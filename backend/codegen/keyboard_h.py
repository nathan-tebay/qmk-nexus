from __future__ import annotations

from models import KeyboardConfig
from codegen._matrix import matrix_keys, matrix_rows, matrix_cols


def generate_keyboard_h(config: KeyboardConfig) -> str:
    keys = matrix_keys(config)
    rows = matrix_rows(config)
    cols = matrix_cols(config)

    params = [f"k{k.row:02d}{k.col:02d}" for k in keys]
    param_str = ", ".join(params)

    # Build full matrix body for LAYOUT macro
    cells: list[list[str]] = [["KC_NO"] * cols for _ in range(rows)]
    for k in keys:
        cells[k.row][k.col] = f"k{k.row:02d}{k.col:02d}"  # type: ignore[index]

    lines = [
        "#pragma once",
        "",
        '#include "quantum.h"',
        "",
        f"#define MATRIX_ROWS {rows}",
        f"#define MATRIX_COLS {cols}",
        "",
        f"#define LAYOUT({param_str}) \\",
        "    { \\",
    ]
    for i, row in enumerate(cells):
        comma = "," if i < rows - 1 else ""
        lines.append(f"        {{ {', '.join(row)} }}{comma} \\")
    lines.append("    }")
    lines.append("")
    lines.append("extern const uint16_t keymaps[][MATRIX_ROWS][MATRIX_COLS];")
    lines.append("")

    return "\n".join(lines)
