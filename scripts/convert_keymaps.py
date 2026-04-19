#!/usr/bin/env python3
"""Convert keyboard data files to include _default_keymap via qmk c2json.

Keyboards that fail conversion are moved to backend/data/failed_conversion/.
Keyboards that already have _default_keymap are skipped (resume-safe).

Usage:
    python scripts/convert_keymaps.py [qmk_root]

Default qmk_root: /mnt/LargeNVMe/Projects/GitHub/qmk_firmware
"""

import json
import shutil
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parent
KB_DATA_DIR = REPO_ROOT / 'backend' / 'data' / 'keyboards'
FAILED_DIR  = REPO_ROOT / 'backend' / 'data' / 'failed_conversion'
DEFAULT_QMK_ROOT = Path('/mnt/LargeNVMe/Projects/GitHub/qmk_firmware')


def get_keymap(kb_path: str, qmk_root: Path) -> dict | None:
    # Prefer keymap.json — no conversion needed
    keymap_json = qmk_root / 'keyboards' / kb_path / 'keymaps' / 'default' / 'keymap.json'
    if keymap_json.exists():
        try:
            data = json.loads(keymap_json.read_text())
            return data if data.get('layers') else None
        except Exception:
            pass

    # Fall back to qmk c2json for keymap.c
    try:
        result = subprocess.run(
            ['qmk', 'c2json', '-kb', kb_path, '-km', 'default'],
            cwd=qmk_root,
            capture_output=True,
            text=True,
            timeout=60,
        )
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return None

    if result.returncode != 0:
        return None

    try:
        data = json.loads(result.stdout)
        return data if data.get('layers') else None
    except Exception:
        return None


def main() -> None:
    qmk_root = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_QMK_ROOT
    if not qmk_root.exists():
        print(f'ERROR: QMK root not found: {qmk_root}', file=sys.stderr)
        sys.exit(1)

    FAILED_DIR.mkdir(parents=True, exist_ok=True)

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

        keymap = c2json(kb_path, qmk_root)
        if keymap:
            data['_default_keymap'] = keymap
            kb_file.write_text(json.dumps(data, separators=(',', ':')))
            print(f'ok ({len(keymap["layers"])} layers)')
            done += 1
        else:
            dest = FAILED_DIR / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(kb_file), str(dest))
            print('failed (moved)')
            failed += 1

    print(f'\n{done} converted, {skipped} skipped, {failed} failed / {total} total')


if __name__ == '__main__':
    main()
