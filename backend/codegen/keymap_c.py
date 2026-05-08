from __future__ import annotations

import re

from models import KeyboardConfig
from codegen._matrix import matrix_keys, matrix_rows, matrix_cols


_LAYER_MACRO_RE = re.compile(r'\b(MO|TG|TT|TO|DF|PDF|OSL|LT|LM)\s*\(\s*([A-Z_][A-Z0-9_]*)')
_BARE_KEYCODE_RE = re.compile(r'^[A-Z][A-Z0-9_]*$')
_KNOWN_KEYCODE_PREFIXES = (
    'KC_',
    'QK_',
    'RM_',
    'RGB_',
    'UG_',
    'BL_',
    'MS_',
    'AU_',
    'EE_',
    'DB_',
    'GU_',
    'CW_',
    'MAGIC_',
)
_KNOWN_BARE_KEYCODES = {
    'XXXXXXX',
    '_______',
    'KC_NO',
    'KC_TRNS',
    'RESET',
    'QK_BOOT',
}


def _c_comment(text: str) -> str:
    return text.replace('*/', '* /').replace('\r', ' ').replace('\n', ' ')


def _all_keycodes(config: KeyboardConfig) -> list[str]:
    keys = matrix_keys(config)
    return [
        layer.keycodes.get(key.id, 'KC_TRNS')
        for layer in config.layers
        for key in keys
    ]


_ORTHO_LAYER_ORDER = {
    '_QWERTY': 0,
    '_COLEMAK': 1,
    '_DVORAK': 2,
    '_LOWER': 3,
    '_RAISE': 4,
    '_PLOVER': 5,
    '_ADJUST': 6,
}


def _generated_layer_symbols(keycodes: list[str], layer_count: int) -> list[tuple[str, int]]:
    symbols: list[str] = []
    for keycode in keycodes:
        for match in _LAYER_MACRO_RE.finditer(keycode):
            symbol = match.group(2)
            if symbol.isdigit() or symbol in symbols:
                continue
            symbols.append(symbol)

    used_indices: set[int] = set()
    result: list[tuple[str, int]] = []
    use_ortho_order = layer_count >= 6 and any(symbol in ('_QWERTY', '_COLEMAK', '_DVORAK') for symbol in symbols)

    for symbol in symbols:
        if use_ortho_order and symbol in _ORTHO_LAYER_ORDER and _ORTHO_LAYER_ORDER[symbol] < layer_count:
            idx = _ORTHO_LAYER_ORDER[symbol]
        else:
            idx = 1
            while idx in used_indices:
                idx += 1
        used_indices.add(idx)
        result.append((symbol, idx))

    return result


def _is_known_keycode(identifier: str) -> bool:
    return identifier in _KNOWN_BARE_KEYCODES or identifier.startswith(_KNOWN_KEYCODE_PREFIXES)


def _generated_custom_keycode_defines(
    keycodes: list[str],
    layer_symbols: list[tuple[str, int]],
) -> list[str]:
    layer_names = {symbol for symbol, _idx in layer_symbols}
    custom: list[str] = []
    for keycode in keycodes:
        if not _BARE_KEYCODE_RE.fullmatch(keycode):
            continue
        if keycode in layer_names or _is_known_keycode(keycode) or keycode in custom:
            continue
        custom.append(keycode)
    return custom


def _generated_keymap_prelude(config: KeyboardConfig) -> list[str]:
    keycodes = _all_keycodes(config)
    layer_symbols = _generated_layer_symbols(keycodes, len(config.layers))
    custom_keycodes = _generated_custom_keycode_defines(keycodes, layer_symbols)
    lines: list[str] = []

    if layer_symbols:
        lines.append('enum nexus_layers {')
        for symbol, layer_idx in layer_symbols:
            lines.append(f'    {symbol} = {layer_idx},')
        lines.append('};')
        lines.append('')

    for keycode in custom_keycodes:
        lines.append(f'#define {keycode} KC_NO')
    if custom_keycodes:
        lines.append('')

    return lines


def generate_keymap_c(config: KeyboardConfig) -> str:
    keys = matrix_keys(config)
    rows = matrix_rows(config)
    cols = matrix_cols(config) or 1

    lines: list[str] = [
        "#include QMK_KEYBOARD_H",
        "",
    ]
    lines.extend(_generated_keymap_prelude(config))
    lines.append(f"const uint16_t PROGMEM keymaps[][MATRIX_ROWS][MATRIX_COLS] = {{")

    for layer_idx, layer in enumerate(config.layers):
        lines.append(f"    /* Layer {layer_idx}: {_c_comment(layer.name)} */")
        layout_macro = config.layout_macro or 'LAYOUT'
        lines.append(f"    [{layer_idx}] = {layout_macro}(")

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

    if config.encoders and config.features.get('encoder'):
        enc_count = len(config.encoders)
        layer_count = len(config.layers)
        enc_keycodes = config.encoder_keycodes or {}
        lines.append('#if defined(ENCODER_MAP_ENABLE)')
        lines.append(f'const uint16_t PROGMEM encoder_map[{layer_count}][{enc_count}][2] = {{')
        for layer_idx, layer in enumerate(config.layers):
            lines.append(f'    /* Layer {layer_idx}: {_c_comment(layer.name)} */')
            layer_comma = ',' if layer_idx < layer_count - 1 else ''
            lines.append(f'    [{layer_idx}] = {{')
            for enc_idx, enc in enumerate(config.encoders):
                cw  = enc_keycodes.get(f'{layer.id}:{enc.id}:cw',  'KC_TRNS')
                ccw = enc_keycodes.get(f'{layer.id}:{enc.id}:ccw', 'KC_TRNS')
                enc_comma = ',' if enc_idx < enc_count - 1 else ''
                lines.append(f'        [{enc_idx}] = ENCODER_CCW_CW({ccw}, {cw}){enc_comma}')
            lines.append(f'    }}{layer_comma}')
        lines.append('};')
        lines.append('#endif')
        lines.append('')

    return "\n".join(lines)
