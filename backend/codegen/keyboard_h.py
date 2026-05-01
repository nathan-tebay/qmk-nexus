from __future__ import annotations

from models import KeyboardConfig


def generate_keyboard_h(config: KeyboardConfig) -> str:
    lines = [
        "#pragma once",
        "",
        '#include "quantum.h"',
        "",
    ]
    # MATRIX_ROWS/MATRIX_COLS are defined in config.h, which QMK's build system
    # includes before keyboard.h via the generated build rules.
    lines.append("extern const uint16_t keymaps[][MATRIX_ROWS][MATRIX_COLS];")
    lines.append("")

    return "\n".join(lines)
