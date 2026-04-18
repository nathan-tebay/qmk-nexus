from __future__ import annotations

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from models import KeyboardConfig
from codegen._matrix import matrix_keys, matrix_rows, matrix_cols


def generate_keyboard_c(config: KeyboardConfig) -> str:
    keys = matrix_keys(config)
    rows = matrix_rows(config)
    cols = matrix_cols(config)
    rgb_enabled = config.features.get("rgb_matrix", False)
    split_enabled = config.features.get("split_keyboard", False)

    lines: list[str] = ["#include QMK_KEYBOARD_H"]
    if rgb_enabled:
        lines.append('#include "rgb_matrix.h"')
    if split_enabled:
        lines.append('#include "split_util.h"')
    lines.append("")

    if rgb_enabled:
        led_keys = [k for k in keys if k.led_index is not None] or keys

        # Matrix → LED index mapping
        matrix_led: list[list[str]] = [["NO_LED"] * cols for _ in range(rows)]
        for k in led_keys:
            idx = k.led_index if k.led_index is not None else led_keys.index(k)
            matrix_led[k.row][k.col] = str(idx)  # type: ignore[index]

        lines.append("led_config_t g_led_config = { {")
        for row in matrix_led:
            lines.append("    { " + ", ".join(row) + " },")
        lines.append("}, {")

        max_x = max((k.x for k in led_keys), default=1.0) or 1.0
        max_y = max((k.y for k in led_keys), default=1.0) or 1.0
        for k in led_keys:
            px = int((k.x / max_x) * 224)
            py = int((k.y / max_y) * 64)
            lines.append(f"    {{ {px}, {py} }},")
        lines.append("}, {")

        for _ in led_keys:
            lines.append("    4,")  # LED_FLAG_KEYLIGHT
        lines.append("} };")
        lines.append("")

    if split_enabled:
        lines.append("void keyboard_post_init_kb(void) {")
        lines.append("    split_post_init();")
        lines.append("    keyboard_post_init_user();")
        lines.append("}")
        lines.append("")

    return "\n".join(lines)
