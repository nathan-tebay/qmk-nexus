#!/usr/bin/env python3
"""Validate every keyboard in backend/data/keyboards/ through the import pipeline.

Three checks per board
  keymap  – at least one layer contains non-trivial keycodes.
            If _default_keymap exists but all keycodes are trivial (KC_NO etc.),
            that is a WARNING rather than an error.
  wiring  – matrix_edges non-empty.  Skipped for single-key boards and when no
            edges are geometrically possible (no two keys share a row or col).
  pins    – one of:
              direct_pins set           (GPIO direct-pin matrix)
              row_pins + col_pins set   (standard row/col matrix)
              custom / custom_lite flag (shift-register or I²C expander;
                                         pins are in upstream C code)
            qmk_native boards with none of the above get a WARNING, not an
            ERROR – their matrix is managed entirely by the upstream firmware.

For generated/qmk_json boards with row+col pins, an additional coverage check
warns when not all rows or cols have a pin entry.  For split keyboards only the
first half of rows is checked (the second half mirrors the first).

Usage:
    python scripts/test_keyboards.py
    python scripts/test_keyboards.py --verbose
    python scripts/test_keyboards.py --filter "0xcb/*"
    python scripts/test_keyboards.py --errors-only

Exit code: 0 = all pass or warn,  1 = any errors.
"""

import argparse
import fnmatch
import sys
from dataclasses import dataclass, field
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parent
KB_DATA_DIR = REPO_ROOT / 'backend' / 'data' / 'keyboards'

sys.path.insert(0, str(REPO_ROOT / 'backend'))

from fastapi import HTTPException  # noqa: E402 – must come after path insert
from routers.qmk import _convert_to_config, _load_keyboard_info  # noqa: E402


# ── result type ──────────────────────────────────────────────────────────────

@dataclass
class BoardResult:
    kb_path: str
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors

    @property
    def status(self) -> str:
        if self.errors:
            return 'FAIL'
        if self.warnings:
            return 'WARN'
        return 'pass'


# ── per-board checker ────────────────────────────────────────────────────────

def check_board(kb_path: str) -> BoardResult:
    r = BoardResult(kb_path)

    try:
        info = _load_keyboard_info(kb_path)
        cfg = _convert_to_config(kb_path, info)
    except (HTTPException, Exception) as exc:
        r.errors.append(f'import failed: {exc}')
        return r

    # ── keys ─────────────────────────────────────────────────────────────────
    if not cfg.keys:
        r.errors.append('no keys')
        return r

    # ── keymap ───────────────────────────────────────────────────────────────
    if not cfg.layers:
        r.errors.append('no layers')
    elif not any(layer.keycodes for layer in cfg.layers):
        # Distinguish: _default_keymap present but all keycodes trivial (KC_NO
        # filtered out) vs no keymap data at all.
        if info.get('_default_keymap'):
            r.warnings.append('all keycodes trivial (KC_NO / _______) in default keymap')
        else:
            r.errors.append('no keycodes in any layer')

    # ── wiring ───────────────────────────────────────────────────────────────
    is_split = bool(cfg.features.get('split_keyboard'))

    if len(cfg.keys) > 1 and not cfg.matrix_edges:
        if is_split:
            # Each half has an independent matrix — check edges within each half.
            all_rows = [k.row for k in cfg.keys if k.row is not None]
            half_rows = (max(all_rows, default=0) + 1) // 2
            halves = [
                [k for k in cfg.keys if k.row is not None and k.row < half_rows],
                [k for k in cfg.keys if k.row is not None and k.row >= half_rows],
            ]
            edges_possible = False
            for half in halves:
                h_rows = [k.row for k in half]
                h_cols = [k.col for k in half if k.col is not None]
                if len(h_rows) != len(set(h_rows)) or len(h_cols) != len(set(h_cols)):
                    edges_possible = True
                    break
        else:
            key_rows = [k.row for k in cfg.keys if k.row is not None]
            key_cols = [k.col for k in cfg.keys if k.col is not None]
            edges_possible = (len(key_rows) != len(set(key_rows))
                              or len(key_cols) != len(set(key_cols)))
        if edges_possible:
            r.errors.append('no wiring (matrix_edges empty)')

    # ── pins ─────────────────────────────────────────────────────────────────
    matrix_pins = info.get('matrix_pins') or {}
    has_direct    = bool(cfg.direct_pins)
    has_row_col   = bool(cfg.row_pins) and bool(cfg.col_pins)
    has_custom    = bool(matrix_pins.get('custom') or matrix_pins.get('custom_lite'))

    if has_direct or has_row_col or has_custom:
        # For generated/qmk_json boards with row+col pins: check coverage.
        if has_row_col and cfg.source_mode not in ('qmk_native',):
            max_row = max((k.row for k in cfg.keys if k.row is not None), default=-1)
            max_col = max((k.col for k in cfg.keys if k.col is not None), default=-1)
            # Split boards: only first-half rows need pins (second half mirrors).
            if is_split and max_row > 0:
                max_row = (max_row + 1) // 2 - 1
            assigned_rows = {p.row for p in cfg.row_pins}
            assigned_cols = {p.col for p in cfg.col_pins}
            missing_rows = [i for i in range(max_row + 1) if i not in assigned_rows]
            missing_cols = [i for i in range(max_col + 1) if i not in assigned_cols]
            if missing_rows:
                r.warnings.append(f'row pins missing for rows: {missing_rows}')
            if missing_cols:
                r.warnings.append(f'col pins missing for cols: {missing_cols}')
    else:
        if cfg.source_mode == 'qmk_native':
            r.warnings.append('no extractable pins (qmk_native – handled by upstream firmware)')
        else:
            r.errors.append('no pin assignments')

    return r


# ── main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--verbose', '-v', action='store_true',
                        help='Print every board, not just failures/warnings')
    parser.add_argument('--filter', metavar='GLOB',
                        help='Only test boards matching this glob (e.g. "0xcb/*")')
    parser.add_argument('--errors-only', action='store_true',
                        help='Suppress WARN lines; show only ERRORs')
    args = parser.parse_args()

    all_files = sorted(KB_DATA_DIR.rglob('*.json'))
    kb_paths = [
        str(f.relative_to(KB_DATA_DIR)).replace('\\', '/').removesuffix('.json')
        for f in all_files
    ]

    if args.filter:
        kb_paths = [kb for kb in kb_paths if fnmatch.fnmatch(kb, args.filter)]

    total = len(kb_paths)
    if total == 0:
        print('No keyboards matched.', file=sys.stderr)
        sys.exit(0)

    results: list[BoardResult] = []
    for i, kb_path in enumerate(kb_paths, 1):
        print(f'\r  testing [{i:>4}/{total}] {kb_path:<60}', end='', flush=True)
        results.append(check_board(kb_path))
    print()  # clear progress line

    errors   = [r for r in results if r.errors]
    warnings = [r for r in results if not r.errors and r.warnings]
    passed   = [r for r in results if r.ok and not r.warnings]

    # ── output ───────────────────────────────────────────────────────────────
    def _print_result(r: BoardResult) -> None:
        tag = f'[{r.status}]'.ljust(6)
        print(f'{tag} {r.kb_path}')
        for e in r.errors:
            print(f'         error: {e}')
        for w in r.warnings:
            print(f'         warn:  {w}')

    if args.verbose:
        for r in results:
            if args.errors_only and not r.errors:
                continue
            _print_result(r)
    else:
        for r in errors:
            _print_result(r)
        if not args.errors_only:
            for r in warnings:
                _print_result(r)

    # ── summary ───────────────────────────────────────────────────────────────
    print()
    print(f'{"─" * 52}')
    print(f'  Total:    {total}')
    print(f'  Passed:   {len(passed)}')
    if warnings:
        print(f'  Warnings: {len(warnings)}')
    if errors:
        print(f'  Failed:   {len(errors)}')
    print(f'{"─" * 52}')

    sys.exit(1 if errors else 0)


if __name__ == '__main__':
    main()
