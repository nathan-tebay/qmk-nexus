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
REMAP_PATH = REPO_ROOT / 'backend' / 'data' / 'qmk_remap.json'
BLOCKLIST_PATH = REPO_ROOT / 'backend' / 'data' / 'qmk_blocklist.json'

DEFAULT_KB_ROOT = Path('/mnt/LargeNVMe/Projects/GitHub/qmk_firmware/keyboards')
_ASSIGN_RE = re.compile(r'^\s*([A-Z0-9_]+)\s*([:+?]?=)\s*(.*?)\s*(?:#.*)?$')


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


def _preserve_existing_keymap(kb_path: str, data: dict) -> None:
    existing = KB_DATA_DIR / (kb_path + '.json')
    if not existing.exists() or '_default_keymap' in data:
        return
    try:
        old = json.loads(existing.read_text())
    except Exception:
        return
    if old.get('_default_keymap'):
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

    blocklist: set[str] = set()
    if BLOCKLIST_PATH.exists():
        with open(BLOCKLIST_PATH) as f:
            blocklist = set(json.load(f).keys())

    index = []
    keep_files: set[Path] = set()
    skipped = 0
    for dir_path, file_path in sorted(candidates.items()):
        rel = str(dir_path.relative_to(kb_root)).replace('\\', '/')
        if rel in blocklist:
            skipped += 1
            continue
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


def reindex() -> list[dict]:
    """Rebuild qmk_index.json from existing backend/data/keyboards/*.json files only.

    No QMK source needed — reads already-processed data files.  Use this after
    manually adding, removing, or editing keyboard JSON files.
    """
    blocklist: set[str] = set()
    if BLOCKLIST_PATH.exists():
        with open(BLOCKLIST_PATH) as f:
            blocklist = set(json.load(f).keys())

    index = []
    skipped = 0
    for kb_file in sorted(KB_DATA_DIR.rglob('*.json')):
        rel = str(kb_file.relative_to(KB_DATA_DIR).with_suffix('')).replace('\\', '/')
        if rel in blocklist:
            skipped += 1
            continue
        try:
            data = json.loads(kb_file.read_text())
        except Exception:
            skipped += 1
            continue
        entry = extract_summary(data, rel)
        if entry is None:
            skipped += 1
            continue
        index.append(entry)

    if skipped:
        print(f'  skipped {skipped} (blocklisted or no layouts)')
    return index


def main() -> None:
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('kb_root', nargs='?', default=str(DEFAULT_KB_ROOT),
                        help='Path to qmk_firmware/keyboards (default: %(default)s)')
    parser.add_argument('--reindex', action='store_true',
                        help='Rebuild index from existing backend/data/keyboards/*.json '
                             'without scanning QMK source. Fast — use after manual edits.')
    args = parser.parse_args()

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    if args.reindex:
        print(f'Reindexing from {KB_DATA_DIR} ...')
        index = reindex()
        qmk_commit = 'unknown'
    else:
        kb_root = Path(args.kb_root)
        print(f'Scanning {kb_root} ...')
        KB_DATA_DIR.mkdir(parents=True, exist_ok=True)
        index = build(kb_root)
        qmk_commit = _get_qmk_commit(kb_root)

    with open(OUTPUT, 'w') as f:
        json.dump(index, f, separators=(',', ':'))

    if not args.reindex:
        remap_generated_at = datetime.now(timezone.utc).isoformat()
        meta = {
            'qmk_commit': qmk_commit,
            'indexed_at': remap_generated_at,
            'remap_generated_at': remap_generated_at,
        }
        with open(META_OUTPUT, 'w') as f:
            json.dump(meta, f, indent=2)

    # Preserve the hand-maintained remap table (write back as-is to normalize formatting)
    remap: dict[str, str] = {}
    if REMAP_PATH.exists():
        with open(REMAP_PATH) as f:
            remap = json.load(f)
    with open(REMAP_PATH, 'w') as f:
        json.dump(remap, f, indent=2)
    print(f'  Remap: {REMAP_PATH} ({len(remap)} entries)')

    index_kb = OUTPUT.stat().st_size // 1024
    data_kb = sum(f.stat().st_size for f in KB_DATA_DIR.rglob('*.json')) // 1024
    print(f'Written {len(index)} keyboards')
    print(f'  Index: {OUTPUT} ({index_kb} KB)')
    print(f'  Data:  {KB_DATA_DIR}/ ({data_kb} KB across {len(index)} files)')
    if not args.reindex:
        print(f'  Meta:  {META_OUTPUT} (qmk_commit={qmk_commit})')


if __name__ == '__main__':
    main()
