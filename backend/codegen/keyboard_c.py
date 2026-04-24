from __future__ import annotations

from models import KeyboardConfig
from codegen._matrix import matrix_keys, matrix_rows, matrix_cols


def generate_keyboard_c(config: KeyboardConfig) -> str:
    keys = matrix_keys(config)
    rows = matrix_rows(config)
    cols = matrix_cols(config)
    rgb_enabled = config.features.get("rgb_matrix", False)
    split_enabled = config.features.get("split_keyboard", False)
    fc = config.feature_configs or {}

    lines: list[str] = ["#include QMK_KEYBOARD_H"]
    if rgb_enabled:
        lines.append('#include "rgb_matrix.h"')
    if split_enabled:
        lines.append('#include "split_util.h"')
    lines.append("")

    if rgb_enabled:
        led_keys = [k for k in keys if k.led_index is not None] or keys

        # Matrix -> LED index mapping
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

        # RGB matrix default config from featureConfigs
        rgb_config = fc.get("rgb_matrix", {})
        default_mode = rgb_config.get("RGB_MATRIX_DEFAULT_MODE", "RGB_MATRIX_EFFECT_BREATHING")
        max_bright = int(rgb_config.get("RGB_MATRIX_MAXIMUM_BRIGHTNESS", "255"))
        lines.append(f"#define RGB_MATRIX_DEFAULT_MODE {default_mode}")
        lines.append(f"#define RGB_MATRIX_MAXIMUM_BRIGHTNESS {max_bright}")
        lines.append("")

    if split_enabled:
        split_config = fc.get("split_keyboard", {})
        lines.append("void keyboard_post_init_kb(void) {")
        lines.append("    split_post_init();")

        # Split-specific settings
        if split_config.get("SPLIT_TRANSPORT_MIRROR", "no") == "yes":
            lines.append("    split_transport_mirror = true;")
        if split_config.get("SPLIT_LAYER_STATE_ENABLE", "no") == "yes":
            lines.append("    split_layer_state_enable = true;")

        lines.append("    keyboard_post_init_user();")
        lines.append("}")
        lines.append("")

    return "\n".join(lines)
