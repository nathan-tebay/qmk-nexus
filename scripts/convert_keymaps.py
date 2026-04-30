#!/usr/bin/env python3
"""Convert keyboard data files to include _default_keymap via qmk c2json.

Keyboards that fail conversion are kept importable without a default keymap.
Keyboards that already have _default_keymap are skipped (resume-safe).

Usage:
    python scripts/convert_keymaps.py [qmk_root]

Default qmk_root: /mnt/LargeNVMe/Projects/GitHub/qmk_firmware
"""

import json
import re
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parent
KB_DATA_DIR = REPO_ROOT / 'backend' / 'data' / 'keyboards'
DEFAULT_QMK_ROOT = Path('/mnt/LargeNVMe/Projects/GitHub/qmk_firmware')


def parse_keymap_c(path: Path) -> dict | None:
    src = path.read_text(errors='replace')
    src = re.sub(r'/\*.*?\*/', '', src, flags=re.DOTALL)
    src = re.sub(r'//[^\n]*', '', src)

    defines: dict[str, int] = {}
    for m in re.finditer(r'#\s*define\s+(\w+)\s+(\d+)', src):
        defines[m.group(1)] = int(m.group(2))

    # Parse enum declarations: enum foo { A, B = 5, C, ... }
    for em in re.finditer(r'enum\s+\w*\s*\{([^}]+)\}', src):
        counter = 0
        for entry in em.group(1).split(','):
            entry = entry.strip()
            if not entry:
                continue
            eq = re.match(r'(\w+)\s*=\s*(\d+)', entry)
            if eq:
                counter = int(eq.group(2))
                defines[eq.group(1)] = counter
            else:
                name = re.match(r'\w+', entry)
                if name:
                    defines[name.group()] = counter
            counter += 1

    if not re.search(r'keymaps\s*\[', src):
        return None

    layers_dict: dict[int, list[str]] = {}
    layer_pat = re.compile(r'\[(\w+)\]\s*=\s*(\w+)\s*\(')
    layout_name: str | None = None

    pos = 0
    while True:
        m = layer_pat.search(src, pos)
        if not m:
            break

        layer_id = m.group(1)
        layout_name = layout_name or m.group(2)
        if layer_id.isdigit():
            layer_idx = int(layer_id)
        elif layer_id in defines:
            layer_idx = defines[layer_id]
        else:
            pos = m.end()
            continue

        # Extract top-level-comma-delimited tokens inside LAYOUT_(...)
        depth = 0
        i = m.end() - 1  # points at '('
        tokens: list[str] = []
        cur: list[str] = []
        while i < len(src):
            c = src[i]
            if c == '(':
                depth += 1
                if depth > 1:
                    cur.append(c)
            elif c == ')':
                depth -= 1
                if depth == 0:
                    tok = ''.join(cur).strip()
                    if tok:
                        tokens.append(tok)
                    break
                else:
                    cur.append(c)
            elif c == ',' and depth == 1:
                tok = ''.join(cur).strip()
                if tok:
                    tokens.append(tok)
                cur = []
            else:
                cur.append(c)
            i += 1

        if tokens:
            layers_dict[layer_idx] = tokens
        pos = i + 1

    if not layers_dict:
        return None

    max_idx = max(layers_dict.keys())
    result = {'layers': [layers_dict.get(j, []) for j in range(max_idx + 1)]}
    if layout_name:
        result['layout'] = layout_name
    return result


def _find_keymap_dirs(kb_path: str, qmk_root: Path) -> list[Path]:
    """Return candidate keymaps/default dirs: exact path, ancestors, then descendants."""
    kb_root = qmk_root / 'keyboards'
    dirs: list[Path] = []

    # Walk up: kb_path → parent → grandparent (stop at keyboards/)
    parts = Path(kb_path).parts
    for n in range(len(parts), 0, -1):
        candidate = kb_root / Path(*parts[:n]) / 'keymaps' / 'default'
        if candidate.is_dir():
            dirs.append(candidate)

    # Walk down: any keymaps/default/ under kb_path not already found
    for candidate in sorted((kb_root / kb_path).rglob('keymaps/default')):
        if candidate not in dirs:
            dirs.append(candidate)

    return dirs


def _read_keymap_dir(d: Path) -> dict | None:
    for name in ('keymap.json', 'keymap.c'):
        f = d / name
        if not f.exists():
            continue
        try:
            if name == 'keymap.json':
                data = json.loads(f.read_text())
                if data.get('layers'):
                    return data
            else:
                result = parse_keymap_c(f)
                if result:
                    return result
        except Exception:
            pass
    return None


def get_keymap(kb_path: str, qmk_root: Path) -> dict | None:
    for d in _find_keymap_dirs(kb_path, qmk_root):
        result = _read_keymap_dir(d)
        if result:
            return result

    # Fall back to qmk c2json
    try:
        proc = subprocess.run(
            ['qmk', 'c2json', '-kb', kb_path, '-km', 'default'],
            cwd=qmk_root, capture_output=True, text=True, timeout=60,
        )
        if proc.returncode == 0:
            data = json.loads(proc.stdout)
            return data if data.get('layers') else None
    except Exception:
        pass

    return None


def main() -> None:
    qmk_root = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_QMK_ROOT
    if not qmk_root.exists():
        print(f'ERROR: QMK root not found: {qmk_root}', file=sys.stderr)
        sys.exit(1)

    files = sorted(KB_DATA_DIR.rglob('*.json'))
    total = len(files)
    done = skipped = failed = 0

    for i, kb_file in enumerate(files, 1):
        rel     = kb_file.relative_to(KB_DATA_DIR)
        kb_path = str(rel.with_suffix('')).replace('\\', '/')
        print(f'[{i}/{total}] {kb_path}', end='  ', flush=True)

        try:
            data = json.loads(kb_file.read_text())
        except Exception:
            print('ERR (bad json)')
            continue

        if '_default_keymap' in data:
            print('skip')
            skipped += 1
            continue

        keymap = get_keymap(kb_path, qmk_root)
        if keymap:
            data['_default_keymap'] = keymap
            kb_file.write_text(json.dumps(data, separators=(',', ':')))
            print(f'ok ({len(keymap["layers"])} layers)')
            done += 1
        else:
            print('no default keymap')
            failed += 1

    print(f'\n{done} converted, {skipped} skipped, {failed} without keymap / {total} total')


if __name__ == '__main__':
    main()
