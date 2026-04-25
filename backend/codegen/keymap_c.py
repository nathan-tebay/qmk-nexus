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
            chunk += ['KC_TRNS'] * (cols - len(chunk))  # pad short last row
            is_last = i + cols >= len(keycodes)
            sep = "" if is_last else ","
            lines.append("        " + ", ".join(chunk) + sep)

        comma = "," if layer_idx < len(config.layers) - 1 else ""
        lines.append(f"    ){comma}")

    lines.append("};")
    lines.append("")

    if config.encoders and config.features.get('encoder'):
        enc_count = len(config.encoders)
        layer_count = len(config.layers)
        enc_keycodes = config.encoder_keycodes or {}
        lines.append('#if defined(ENCODER_MAP_ENABLE)')
        lines.append(f'const uint16_t PROGMEM encoder_map[{layer_count}][{enc_count}][2] = {{')
        for layer_idx, layer in enumerate(config.layers):
            lines.append(f'    /* Layer {layer_idx}: {layer.name} */')
            layer_comma = ',' if layer_idx < layer_count - 1 else ''
            lines.append(f'    [{layer_idx}] = {{')
            for enc_idx, enc in enumerate(config.encoders):
                cw  = enc_keycodes.get(f'{layer.id}:{enc.id}:cw',  'KC_TRNS')
                ccw = enc_keycodes.get(f'{layer.id}:{enc.id}:ccw', 'KC_TRNS')
                enc_comma = ',' if enc_idx < enc_count - 1 else ''
                lines.append(f'        [{enc_idx}] = {{ENCODER_CCW_CW({ccw}, {cw})}}{enc_comma}')
            lines.append(f'    }}{layer_comma}')
        lines.append('};')
        lines.append('#endif')
        lines.append('')

    return "\n".join(lines)
