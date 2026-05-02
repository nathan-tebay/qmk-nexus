#!/usr/bin/env python3
"""Build backend/data/qmk_index.json from a local QMK keyboards directory.

Usage:
    python scripts/build_qmk_index.py [keyboards_path]

Default keyboards_path: /mnt/LargeNVMe/Projects/GitHub/qmk_firmware/keyboards
Output: backend/data/qmk_index.json
"""

import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from convert_keymaps import get_keymap

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parent
OUTPUT = REPO_ROOT / 'backend' / 'data' / 'qmk_index.json'
META_OUTPUT = REPO_ROOT / 'backend' / 'data' / 'qmk_meta.json'
KB_DATA_DIR = REPO_ROOT / 'backend' / 'data' / 'keyboards'

DEFAULT_KB_ROOT = Path('/mnt/LargeNVMe/Projects/GitHub/qmk_firmware/keyboards')
NATIVE_QMK_PREFIXES = ('keychron/', 'zsa/', 'splitkb/')
_ASSIGN_RE = re.compile(r'^\s*([A-Z0-9_]+)\s*([:+?]?=)\s*(.*?)\s*(?:#.*)?$')
_CONTINUATION_RE = re.compile(r'\\\s*$')
_TEXT_SUFFIXES = {
    '.c', '.h', '.cpp', '.hpp', '.mk', '.json', '.ld', '.inc',
}
_TEXT_NAMES = {'rules.mk', 'post_rules.mk', 'config.h', 'post_config.h', 'halconf.h', 'mcuconf.h'}


def _get_qmk_commit(kb_root: Path) -> str:
    try:
        result = subprocess.run(
            ['git', '-C', str(kb_root.parent), 'rev-parse', 'HEAD'],
            capture_output=True, text=True, check=True
        )
        return result.stdout.strip()
    except Exception:
        return 'unknown'


def extract_summary(info: dict, path: str) -> dict | None:
    layouts = info.get('layouts', {})
    if not layouts:
        return None

    usb = info.get('usb', {})
    processor = info.get('processor', info.get('processor_type', 'unknown'))
    first_layout = next(iter(layouts.values()), {})

    return {
        'path': path,
        'name': info.get('keyboard_name', path.split('/')[-1]),
        'manufacturer': info.get('manufacturer', ''),
        'mcu': str(processor).lower(),
        'usb_vid': usb.get('vid', '0xFEED'),
        'usb_pid': usb.get('pid', '0x0000'),
        'layouts': list(layouts.keys()),
        'key_count': len(first_layout.get('layout', [])),
    }


def _qmk_root(kb_root: Path) -> Path:
    return kb_root.parent if kb_root.name == 'keyboards' else kb_root


def _resolved_info(qmk_root: Path, kb_path: str, fallback_file: Path) -> dict | None:
    proc = subprocess.run(
        ['qmk', 'info', '-kb', kb_path, '--format', 'json'],
        cwd=qmk_root,
        capture_output=True,
        text=True,
        timeout=60,
    )
    if proc.returncode == 0:
        try:
            return json.loads(proc.stdout)
        except json.JSONDecodeError:
            pass

    try:
        with open(fallback_file) as f:
            return json.load(f)
    except Exception as e:
        print(f'  skip {fallback_file}: {e}')
        return None


def _qmk_list_keyboards(qmk_root: Path) -> set[str]:
    proc = subprocess.run(
        ['qmk', 'list-keyboards'],
        cwd=qmk_root,
        capture_output=True,
        text=True,
        timeout=300,
    )
    if proc.returncode != 0:
        return set()
    return {line.strip() for line in proc.stdout.splitlines() if line.strip()}


def _is_native_priority(kb_path: str) -> bool:
    return kb_path.startswith(NATIVE_QMK_PREFIXES)


def _logical_make_lines(path: Path) -> list[str]:
    lines: list[str] = []
    pending = ''
    for raw in path.read_text(errors='ignore').splitlines():
        line = raw.rstrip()
        if _CONTINUATION_RE.search(line):
            pending += _CONTINUATION_RE.sub('', line) + ' '
            continue
        lines.append(pending + line)
        pending = ''
    if pending:
        lines.append(pending)
    return lines


def _keyboard_ancestors(qmk_root: Path, kb_path: str) -> list[Path]:
    kb_root = qmk_root / 'keyboards'
    current = kb_root / kb_path
    ancestors: list[Path] = []
    while current != kb_root:
        if current.exists():
            ancestors.append(current)
        current = current.parent
    return list(reversed(ancestors))


def _include_file(path: Path) -> bool:
    if path.name in _TEXT_NAMES:
        return True
    return path.suffix in _TEXT_SUFFIXES


def _add_text_file(files: dict[str, str], qmk_root: Path, path: Path) -> None:
    if not path.exists() or not path.is_file() or not _include_file(path):
        return
    rel = str(path.relative_to(qmk_root)).replace('\\', '/')
    if rel in files:
        return
    try:
        files[rel] = path.read_text(encoding='utf-8')
    except UnicodeDecodeError:
        files[rel] = path.read_text(errors='ignore')


def _make_vars(paths: list[Path]) -> tuple[list[str], list[str]]:
    src: list[str] = []
    vpath: list[str] = []
    for directory in paths:
        for name in ('rules.mk', 'post_rules.mk'):
            mk = directory / name
            if not mk.exists():
                continue
            for line in _logical_make_lines(mk):
                match = _ASSIGN_RE.match(line)
                if not match:
                    continue
                key, _op, value = match.groups()
                tokens = [token for token in value.split() if token and not token.startswith('$(')]
                if key == 'SRC':
                    src.extend(tokens)
                elif key == 'VPATH':
                    vpath.extend(tokens)
    return src, vpath


def _collect_native_files(qmk_root: Path, kb_path: str) -> dict[str, str]:
    ancestors = _keyboard_ancestors(qmk_root, kb_path)
    files: dict[str, str] = {}

    for directory in ancestors:
        for child in directory.iterdir():
            if child.is_file():
                _add_text_file(files, qmk_root, child)
            elif child.name in {'ld', 'lib'}:
                for nested in child.rglob('*'):
                    _add_text_file(files, qmk_root, nested)

    src_tokens, vpath_tokens = _make_vars(ancestors)
    search_dirs = [*ancestors, *(qmk_root / token for token in vpath_tokens)]
    for token in src_tokens:
        if not token.endswith(('.c', '.h', '.cpp', '.hpp')):
            continue
        for directory in search_dirs:
            candidate = directory / token
            if candidate.exists():
                _add_text_file(files, qmk_root, candidate)
                break

    default_keymap = qmk_root / 'keyboards' / kb_path / 'keymaps' / 'default'
    if default_keymap.is_dir():
        for child in default_keymap.iterdir():
            if child.is_file():
                _add_text_file(files, qmk_root, child)

    return files


def _mark_native_qmk(info: dict, qmk_root: Path, kb_path: str) -> None:
    info['_nexus'] = {
        'source_mode': 'qmk_native',
        'upstream_keyboard': kb_path,
        'upstream_files': _collect_native_files(qmk_root, kb_path),
    }


def _unsupported_matrix(info: dict) -> bool:
    matrix_pins = info.get('matrix_pins') or {}
    if matrix_pins.get('custom') or matrix_pins.get('custom_lite') or matrix_pins.get('direct'):
        return True

    matrices: list[tuple[int, int]] = []
    for layout in (info.get('layouts') or {}).values():
        for key in layout.get('layout', []):
            matrix = key.get('matrix')
            if (
                isinstance(matrix, list)
                and len(matrix) >= 2
                and isinstance(matrix[0], int)
                and isinstance(matrix[1], int)
            ):
                matrices.append((matrix[0], matrix[1]))
    if not matrices:
        return False

    row_count = max(row for row, _ in matrices) + 1
    col_count = max(col for _, col in matrices) + 1
    row_pins = matrix_pins.get('rows') or []
    col_pins = matrix_pins.get('cols') or []
    split_enabled = bool((info.get('split') or {}).get('enabled'))

    expected_rows = row_count
    expected_cols = col_count
    if split_enabled and row_count % 2 == 0 and len(row_pins) < row_count:
        expected_rows = row_count // 2
    if split_enabled and col_count % 2 == 0 and len(col_pins) < col_count:
        expected_cols = col_count // 2

    return (
        len(row_pins) < expected_rows
        or len(col_pins) < expected_cols
        or not all(row_pins[:expected_rows])
        or not all(col_pins[:expected_cols])
    )


def _requires_native_qmk(info: dict) -> bool:
    """Return true when generated sources are too lossy for upstream imports."""
    if _unsupported_matrix(info):
        return True

    features = info.get('features') or {}
    for feature in ('rgb_matrix', 'led_matrix', 'oled', 'encoder', 'pointing_device', 'audio'):
        if features.get(feature):
            return True

    if info.get('split'):
        return True

    ws2812 = info.get('ws2812') or {}
    if ws2812.get('driver') and ws2812.get('driver') != 'bitbang':
        return True

    return False


def _preserve_existing_keymap(kb_path: str, data: dict) -> None:
    existing = KB_DATA_DIR / (kb_path + '.json')
    if not existing.exists() or '_default_keymap' in data:
        return
    try:
        old = json.loads(existing.read_text())
    except Exception:
        return
    if '_default_keymap' in old:
        data['_default_keymap'] = old['_default_keymap']


def build(kb_root: Path) -> list[dict]:
    if not kb_root.exists():
        print(f'ERROR: keyboards path not found: {kb_root}', file=sys.stderr)
        sys.exit(1)
    qmk_root = _qmk_root(kb_root)
    buildable_keyboards = _qmk_list_keyboards(qmk_root)

    # Collect all candidate files; prefer keyboard.json over info.json per directory
    candidates: dict[Path, Path] = {}
    for p in kb_root.rglob('info.json'):
        candidates[p.parent] = p
    for p in kb_root.rglob('keyboard.json'):
        candidates[p.parent] = p  # overrides info.json if both exist

    index = []
    keep_files: set[Path] = set()
    skipped = native_fallback = 0
    for dir_path, file_path in sorted(candidates.items()):
        rel = str(dir_path.relative_to(kb_root)).replace('\\', '/')
        if (
            buildable_keyboards
            and rel not in buildable_keyboards
            and any(kb.startswith(rel + '/') for kb in buildable_keyboards)
        ):
            skipped += 1
            continue
        data = _resolved_info(qmk_root, rel, file_path)
        if data is None:
            skipped += 1
            continue
        requires_native = _requires_native_qmk(data)
        if _is_native_priority(rel) or requires_native:
            _mark_native_qmk(data, qmk_root, rel)
            if requires_native and not _is_native_priority(rel):
                native_fallback += 1

        entry = extract_summary(data, rel)
        if entry is None:
            skipped += 1
            continue

        _preserve_existing_keymap(rel, data)

        keymap = get_keymap(rel, qmk_root)
        if keymap:
            data['_default_keymap'] = keymap

        # Write per-keyboard data file
        kb_file = KB_DATA_DIR / (rel + '.json')
        kb_file.parent.mkdir(parents=True, exist_ok=True)
        with open(kb_file, 'w') as f:
            json.dump(data, f, separators=(',', ':'))
        keep_files.add(kb_file)

        index.append(entry)

    print(f'  skipped {skipped} (no layouts or parse error)')
    print(f'  native fallback {native_fallback} (feature-heavy upstream boards kept as QMK-native)')

    removed = 0
    for existing in KB_DATA_DIR.rglob('*.json'):
        if existing not in keep_files:
            existing.unlink()
            removed += 1
    for directory in sorted((p for p in KB_DATA_DIR.rglob('*') if p.is_dir()), reverse=True):
        try:
            directory.rmdir()
        except OSError:
            pass
    if removed:
        print(f'  removed {removed} stale/unsupported data files')
    return index


def main() -> None:
    kb_root = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_KB_ROOT
    print(f'Scanning {kb_root} ...')
    KB_DATA_DIR.mkdir(parents=True, exist_ok=True)
    index = build(kb_root)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, 'w') as f:
        json.dump(index, f, separators=(',', ':'))
    qmk_commit = _get_qmk_commit(kb_root)
    meta = {
        'qmk_commit': qmk_commit,
        'indexed_at': datetime.now(timezone.utc).isoformat(),
    }
    with open(META_OUTPUT, 'w') as f:
        json.dump(meta, f, indent=2)
    index_kb = OUTPUT.stat().st_size // 1024
    data_kb = sum(f.stat().st_size for f in KB_DATA_DIR.rglob('*.json')) // 1024
    print(f'Written {len(index)} keyboards')
    print(f'  Index: {OUTPUT} ({index_kb} KB)')
    print(f'  Data:  {KB_DATA_DIR}/ ({data_kb} KB across {len(index)} files)')
    print(f'  Meta:  {META_OUTPUT} (qmk_commit={qmk_commit})')


if __name__ == '__main__':
    main()
