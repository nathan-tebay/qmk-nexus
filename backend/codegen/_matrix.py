from __future__ import annotations
from models import KeyboardConfig, KeyDef


def matrix_keys(config: KeyboardConfig) -> list[KeyDef]:
    """Keys with row/col assigned, sorted by (row, col). Undefined keys excluded."""
    defined = [k for k in config.keys if k.row is not None and k.col is not None]
    return sorted(defined, key=lambda k: (k.row, k.col))  # type: ignore[arg-type]


def matrix_rows(config: KeyboardConfig) -> int:
    rows = [k.row for k in config.keys if k.row is not None]
    return max(rows) + 1 if rows else len(config.row_pins)


def matrix_cols(config: KeyboardConfig) -> int:
    cols = [k.col for k in config.keys if k.col is not None]
    return max(cols) + 1 if cols else len(config.col_pins)
