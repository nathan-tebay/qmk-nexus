from __future__ import annotations

import re

from models import KeyboardConfig, MacroEntry, MacroStep
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
    'DM_',
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


def _resolved_upstream_layout_name(config: KeyboardConfig) -> str:
    macro = config.layout_macro or 'LAYOUT'
    return config.layout_aliases.get(macro, macro)


def _key_ids_for_keymap(config: KeyboardConfig) -> list[str | None]:
    """Return key ids in the argument order required by the emitted layout macro.

    Generated keyboards define their own layout macro from ``matrix_keys`` order,
    so keymap.c must keep using that same matrix order.

    Native QMK keyboards already have an upstream layout macro. Its arguments are
    in the order declared by upstream ``keyboard.json``, which is often not
    row-major matrix order (ErgoDox EZ is a common example). For native builds,
    preserve that upstream argument order and resolve each entry back to our key
    id by matrix coordinate.
    """
    if config.source_mode == 'qmk_native' and config.upstream_layouts:
        layout_def = config.upstream_layouts.get(_resolved_upstream_layout_name(config))
        upstream_keys = layout_def.get('layout') if isinstance(layout_def, dict) else None
        if isinstance(upstream_keys, list):
            by_matrix = {
                (key.row, key.col): key.id
                for key in config.keys
                if key.row is not None and key.col is not None
            }
            key_order: list[str | None] = []
            for entry in upstream_keys:
                matrix = entry.get('matrix') if isinstance(entry, dict) else None
                if isinstance(matrix, list) and len(matrix) == 2:
                    key_order.append(by_matrix.get((matrix[0], matrix[1])))
                else:
                    key_order.append(None)
            return key_order

    return [key.id for key in matrix_keys(config)]


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


def _macro_enum_name(index: int) -> str:
    return f'NX_M{index}'


_SEND_STRING_ESCAPE = {'\\': '\\\\', '"': '\\"', '\n': '\\n', '\t': '\\t', '\r': '\\r'}


def _escape_send_string(text: str) -> str:
    out: list[str] = []
    for ch in text:
        if ch in _SEND_STRING_ESCAPE:
            out.append(_SEND_STRING_ESCAPE[ch])
            continue
        code = ord(ch)
        if 0x20 <= code < 0x7F:
            out.append(ch)
        else:
            out.append(f'\\x{code:02x}' if code < 0x100 else '?')
    return ''.join(out)


def _macro_step_to_c(step: MacroStep) -> str | None:
    if step.type == 'tap' and step.keycode:
        return f'tap_code16({step.keycode});'
    if step.type == 'down' and step.keycode:
        return f'register_code16({step.keycode});'
    if step.type == 'up' and step.keycode:
        return f'unregister_code16({step.keycode});'
    if step.type == 'string' and step.text is not None:
        return f'SEND_STRING("{_escape_send_string(step.text)}");'
    if step.type == 'delay' and step.ms is not None:
        return f'wait_ms({int(step.ms)});'
    return None


def _emit_macros_block(macros: list[MacroEntry]) -> list[str]:
    if not macros:
        return []
    lines = ['bool process_record_user(uint16_t keycode, keyrecord_t *record) {',
             '    if (!record->event.pressed) return true;',
             '    switch (keycode) {']
    for i, macro in enumerate(macros):
        lines.append(f'        case {_macro_enum_name(i)}:  /* {_c_comment(macro.name)} */')
        for step in macro.steps:
            emitted = _macro_step_to_c(step)
            if emitted:
                lines.append(f'            {emitted}')
        lines.append('            return false;')
    lines.append('    }')
    lines.append('    return true;')
    lines.append('}')
    lines.append('')
    return lines


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

    macros = config.macros or []
    if macros:
        lines.append('enum nexus_macros {')
        for i, _ in enumerate(macros):
            suffix = ' = SAFE_RANGE' if i == 0 else ''
            lines.append(f'    {_macro_enum_name(i)}{suffix},')
        lines.append('};')
        lines.append(f'#define M(n) ({_macro_enum_name(0)} + (n))')
        lines.append('')

    return lines


def generate_keymap_c(config: KeyboardConfig) -> str:
    key_ids = _key_ids_for_keymap(config)
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

        keycodes = [
            layer.keycodes.get(key_id, "KC_TRNS") if key_id is not None else "KC_TRNS"
            for key_id in key_ids
        ]

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

    if config.combos and config.features.get('combo'):
        lines.append('// Combos')
        for i, combo in enumerate(config.combos):
            trigger_kcs: list[str] = []
            for key_id in combo.keys:
                resolved = 'KC_TRNS'
                for layer in config.layers:
                    candidate = layer.keycodes.get(key_id)
                    if candidate and candidate not in ('KC_TRNS', 'KC_NO', '_______'):
                        resolved = candidate
                        break
                trigger_kcs.append(resolved)
            if any(kc == 'KC_TRNS' for kc in trigger_kcs):
                lines.append(f'// WARNING: combo_{i} has unmapped trigger keys (assigned KC_TRNS).')
            kc_list = ', '.join(trigger_kcs)
            lines.append(f'const uint16_t PROGMEM combo_{i}[] = {{{kc_list}, COMBO_END}};')
        lines.append('')
        lines.append('combo_t key_combos[] = {')
        for i, combo in enumerate(config.combos):
            sep = ',' if i < len(config.combos) - 1 else ''
            lines.append(f'    COMBO(combo_{i}, {combo.output}){sep}')
        lines.append('};')
        lines.append('')

    if config.tap_dances and config.features.get('tap_dance'):
        lines.append('// Tap Dance — index i is referenced as TD(i) in the keymap')
        lines.append('tap_dance_action_t tap_dance_actions[] = {')
        for i, td in enumerate(config.tap_dances):
            sep = ',' if i < len(config.tap_dances) - 1 else ''
            lines.append(f'    [{i}] = ACTION_TAP_DANCE_DOUBLE({td.on_tap}, {td.on_double_tap}){sep}')
        lines.append('};')
        lines.append('')

    lines.extend(_emit_macros_block(config.macros or []))

    return "\n".join(lines)
