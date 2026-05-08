#!/usr/bin/env python3
"""Embed _default_keymap into every keyboard JSON file that is missing one.

Parser improvements over naive regex:
  - Reads keyboard-level header files for cross-file enum constants.
  - Strips #ifdef / #ifndef / #endif before enum parsing.
  - Falls back to bare LAYOUT(...) entries (no [N] = prefix) as layer 0, 1, …

Without flags:        skips boards that already have _default_keymap (resume-safe).
--force:              re-processes every board in KB_DATA_DIR; keeps existing keymap
                      if the new parse fails.
--rebuild-index:      rebuilds the full keyboard index from QMK source first
                      (creates/updates/removes JSON files), then does a --force pass.
                      This is the all-in-one command: covers every keyboard in the
                      QMK tree, not just those already in KB_DATA_DIR.

Usage:
    python scripts/convert_keymaps.py [qmk_root]
    python scripts/convert_keymaps.py [qmk_root] --force
    python scripts/convert_keymaps.py [qmk_root] --rebuild-index

Default qmk_root: /mnt/LargeNVMe/Projects/GitHub/qmk_firmware
"""

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parent
KB_DATA_DIR = REPO_ROOT / 'backend' / 'data' / 'keyboards'
DEFAULT_QMK_ROOT = Path('/mnt/LargeNVMe/Projects/GitHub/qmk_firmware')


def _extract_tokens(src: str, open_paren_pos: int) -> tuple[list[str], int]:
    """Extract top-level comma-delimited tokens from a parenthesised expression.

    ``open_paren_pos`` must point at the opening ``(``.
    Returns ``(tokens, end_pos)`` where ``end_pos`` is the index *after* ``)``.
    """
    depth = 0
    tokens: list[str] = []
    cur: list[str] = []
    i = open_paren_pos
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
                return tokens, i + 1
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
    return tokens, i


def _strip_comments(text: str) -> str:
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.DOTALL)
    return re.sub(r'//[^\n]*', '', text)


def parse_keymap_c(path: Path, extra_text: str = '') -> dict | None:
    src = _strip_comments(path.read_text(errors='replace'))

    # Combine with any supplemental header text (keyboard-level .h files).
    combined = (_strip_comments(extra_text) + '\n' + src) if extra_text else src

    defines: dict[str, int] = {}
    for m in re.finditer(r'#\s*define\s+(\w+)\s+(\d+)', combined):
        defines[m.group(1)] = int(m.group(2))

    # Strip conditional-compilation lines before enum parsing so that
    # #ifdef / #ifndef guards inside enum bodies don't corrupt the entry list.
    enum_src = re.sub(r'#\s*(?:if|ifdef|ifndef|elif|else|endif)\b[^\n]*', '', combined)

    for em in re.finditer(r'enum\s+\w*\s*\{([^}]+)\}', enum_src):
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

        tokens, end = _extract_tokens(src, m.end() - 1)
        if tokens:
            layers_dict[layer_idx] = tokens
        pos = end

    # Fallback: bare LAYOUT(…) without a [N] = prefix — enumerate as layers 0, 1, …
    if not layers_dict:
        keymaps_m = re.search(r'\bkeymaps\s*\[', src)
        bare_pat = re.compile(r'\b(\w*(?:LAYOUT|KEYMAP)\w*)\s*\(')
        layer_num = 0
        search_pos = keymaps_m.end() if keymaps_m else 0
        while True:
            bm = bare_pat.search(src, search_pos)
            if not bm:
                break
            layout_name = layout_name or bm.group(1)
            tokens, end = _extract_tokens(src, bm.end() - 1)
            if tokens:
                layers_dict[layer_num] = tokens
                layer_num += 1
            search_pos = end

    if not layers_dict:
        return None

    max_idx = max(layers_dict.keys())
    result: dict = {'layers': [layers_dict.get(j, []) for j in range(max_idx + 1)]}
    if layout_name:
        result['layout'] = layout_name
    return result


def _find_keymap_dirs(kb_path: str, qmk_root: Path) -> list[Path]:
    """Return candidate keymap dirs: keymaps/default first, then all other keymaps/* subdirs."""
    kb_root = qmk_root / 'keyboards'
    dirs: list[Path] = []
    seen: set[Path] = set()

    parts = Path(kb_path).parts

    # Priority 1: keymaps/default — walk up from kb_path to keyboards/
    for n in range(len(parts), 0, -1):
        candidate = kb_root / Path(*parts[:n]) / 'keymaps' / 'default'
        if candidate.is_dir() and candidate not in seen:
            dirs.append(candidate)
            seen.add(candidate)

    # Priority 2: any keymaps/default/ under kb_path
    for candidate in sorted((kb_root / kb_path).rglob('keymaps/default')):
        if candidate.is_dir() and candidate not in seen:
            dirs.append(candidate)
            seen.add(candidate)

    # Priority 3: all other keymaps/* subdirs — walk up then down
    for n in range(len(parts), 0, -1):
        keymaps_dir = kb_root / Path(*parts[:n]) / 'keymaps'
        if keymaps_dir.is_dir():
            for child in sorted(keymaps_dir.iterdir()):
                if child.is_dir() and child not in seen:
                    dirs.append(child)
                    seen.add(child)

    for candidate in sorted((kb_root / kb_path).rglob('keymaps/*')):
        if candidate.is_dir() and candidate not in seen:
            dirs.append(candidate)
            seen.add(candidate)

    return dirs


def _keyboard_header_text(keymap_dir: Path) -> str:
    """Return concatenated text of all .h files in the keyboard directory.

    The keyboard directory is two levels above the keymap dir
    (keyboards/<kb>/keymaps/<name>/ → keyboards/<kb>/).
    """
    kb_dir = keymap_dir.parent.parent
    text = ''
    for h in sorted(kb_dir.glob('*.h')):
        try:
            text += '\n' + h.read_text(errors='replace')
        except Exception:
            pass
    return text


def _read_keymap_dir(d: Path) -> dict | None:
    extra = _keyboard_header_text(d)
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
                result = parse_keymap_c(f, extra_text=extra)
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


def _run_keymap_pass(qmk_root: Path, *, force: bool) -> None:
    """Iterate KB_DATA_DIR and embed _default_keymap where missing (or everywhere if force)."""
    files = sorted(KB_DATA_DIR.rglob('*.json'))
    total = len(files)
    done = skipped = failed = 0

    for i, kb_file in enumerate(files, 1):
        rel = kb_file.relative_to(KB_DATA_DIR)
        kb_path = str(rel.with_suffix('')).replace('\\', '/')
        print(f'[{i}/{total}] {kb_path}', end='  ', flush=True)

        try:
            data = json.loads(kb_file.read_text())
        except Exception:
            print('ERR (bad json)')
            continue

        if data.get('_default_keymap') and not force:
            print('skip')
            skipped += 1
            continue

        keymap = get_keymap(kb_path, qmk_root)
        if keymap:
            data['_default_keymap'] = keymap
            kb_file.write_text(json.dumps(data, separators=(',', ':')))
            print(f'ok ({len(keymap["layers"])} layers)')
            done += 1
        elif force and data.get('_default_keymap'):
            print('kept existing')
            skipped += 1
        else:
            print('no default keymap')
            failed += 1

    print(f'\n{done} updated, {skipped} skipped, {failed} without keymap / {total} total')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('qmk_root', nargs='?', default=str(DEFAULT_QMK_ROOT))
    parser.add_argument(
        '--force', action='store_true',
        help='Re-process all boards in KB_DATA_DIR, not just those missing a keymap.',
    )
    parser.add_argument(
        '--rebuild-index', action='store_true',
        help='Rebuild the full keyboard index from QMK source first '
             '(creates/updates/removes JSON files), then do a --force keymap pass. '
             'Covers every keyboard in the QMK tree, not just those already indexed.',
    )
    args = parser.parse_args()

    qmk_root = Path(args.qmk_root)
    if not qmk_root.exists():
        print(f'ERROR: QMK root not found: {qmk_root}', file=sys.stderr)
        sys.exit(1)

    if args.rebuild_index:
        from build_qmk_index import build as _build_index, OUTPUT, META_OUTPUT
        import json as _json

        kb_root = qmk_root / 'keyboards'
        print(f'=== Rebuilding keyboard index from {kb_root} ===')
        index = _build_index(kb_root)

        OUTPUT.write_text(_json.dumps(index, indent=2))
        print(f'Wrote {len(index)} entries to {OUTPUT}')

        from datetime import datetime, timezone
        META_OUTPUT.write_text(_json.dumps({
            'qmk_commit': _get_qmk_commit_hash(qmk_root),
            'built_at': datetime.now(timezone.utc).isoformat(),
        }, indent=2))

        print('\n=== Keymap pass (--force) after index rebuild ===')
        _run_keymap_pass(qmk_root, force=True)
    else:
        _run_keymap_pass(qmk_root, force=args.force)


def _get_qmk_commit_hash(qmk_root: Path) -> str:
    try:
        import subprocess
        result = subprocess.run(
            ['git', '-C', str(qmk_root), 'rev-parse', 'HEAD'],
            capture_output=True, text=True, check=True,
        )
        return result.stdout.strip()
    except Exception:
        return 'unknown'


if __name__ == '__main__':
    main()
