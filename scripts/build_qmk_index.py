#!/usr/bin/env python3
"""Build backend/data/qmk_index.json from a local QMK keyboards directory.

Usage:
    python scripts/build_qmk_index.py [keyboards_path]

Default keyboards_path: /mnt/LargeNVMe/Projects/GitHub/qmk_firmware/keyboards
Output: backend/data/qmk_index.json
"""

import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parent
OUTPUT = REPO_ROOT / 'backend' / 'data' / 'qmk_index.json'
KB_DATA_DIR = REPO_ROOT / 'backend' / 'data' / 'keyboards'

DEFAULT_KB_ROOT = Path('/mnt/LargeNVMe/Projects/GitHub/qmk_firmware/keyboards')


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


def build(kb_root: Path) -> list[dict]:
    if not kb_root.exists():
        print(f'ERROR: keyboards path not found: {kb_root}', file=sys.stderr)
        sys.exit(1)

    # Collect all candidate files; prefer keyboard.json over info.json per directory
    candidates: dict[Path, Path] = {}
    for p in kb_root.rglob('info.json'):
        candidates[p.parent] = p
    for p in kb_root.rglob('keyboard.json'):
        candidates[p.parent] = p  # overrides info.json if both exist

    index = []
    skipped = 0
    for dir_path, file_path in sorted(candidates.items()):
        try:
            with open(file_path) as f:
                data = json.load(f)
        except Exception as e:
            print(f'  skip {file_path}: {e}')
            skipped += 1
            continue

        rel = str(dir_path.relative_to(kb_root)).replace('\\', '/')
        entry = extract_summary(data, rel)
        if entry is None:
            skipped += 1
            continue

        # Embed default keymap if keymap.json exists
        keymap_file = dir_path / 'keymaps' / 'default' / 'keymap.json'
        if keymap_file.exists():
            try:
                with open(keymap_file) as f:
                    data['_default_keymap'] = json.load(f)
            except Exception:
                pass

        # Write per-keyboard data file
        kb_file = KB_DATA_DIR / (rel + '.json')
        kb_file.parent.mkdir(parents=True, exist_ok=True)
        with open(kb_file, 'w') as f:
            json.dump(data, f, separators=(',', ':'))

        index.append(entry)

    print(f'  skipped {skipped} (no layouts or parse error)')
    return index


def main() -> None:
    kb_root = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_KB_ROOT
    print(f'Scanning {kb_root} ...')
    KB_DATA_DIR.mkdir(parents=True, exist_ok=True)
    index = build(kb_root)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, 'w') as f:
        json.dump(index, f, separators=(',', ':'))
    index_kb = OUTPUT.stat().st_size // 1024
    data_kb = sum(f.stat().st_size for f in KB_DATA_DIR.rglob('*.json')) // 1024
    print(f'Written {len(index)} keyboards')
    print(f'  Index: {OUTPUT} ({index_kb} KB)')
    print(f'  Data:  {KB_DATA_DIR}/ ({data_kb} KB across {len(index)} files)')


if __name__ == '__main__':
    main()
