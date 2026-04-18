from __future__ import annotations

from models import KeyboardConfig
from codegen._matrix import matrix_keys, matrix_rows, matrix_cols


def generate_keymap_c(config: KeyboardConfig) -> str:
    keys = matrix_keys(config)
    rows = matrix_rows(config)
    cols = matrix_cols(config)

    lines: list[str] = [
        "#include QMK_KEYBOARD_H",
        "",
        f"const uint16_t PROGMEM keymaps[][MATRIX_ROWS][MATRIX_COLS] = {{",
    ]

    for layer_idx, layer in enumerate(config.layers):
        lines.append(f"    /* Layer {layer_idx}: {layer.name} */")
        lines.append(f"    [{layer_idx}] = LAYOUT(")

        keycodes = [layer.keycodes.get(k.id, "KC_TRNS") for k in keys]

        for i in range(0, len(keycodes), cols):
            chunk = keycodes[i : i + cols]
            is_last = i + cols >= len(keycodes)
            sep = "" if is_last else ","
            lines.append("        " + ", ".join(chunk) + sep)

        comma = "," if layer_idx < len(config.layers) - 1 else ""
        lines.append(f"    ){comma}")

    lines.append("};")
    lines.append("")

    return "\n".join(lines)
