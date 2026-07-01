from __future__ import annotations

import re

from models import KeyboardConfig, MacroStep
from codegen._matrix import matrix_keys, matrix_rows, matrix_cols
from codegen import _pointing
from codegen import _settings


_LAYER_MACRO_RE = re.compile(r'\b(MO|TG|TT|TO|DF|PDF|OSL|LT|LM)\s*\(\s*([A-Z_][A-Z0-9_]*)')
_BARE_KEYCODE_RE = re.compile(r'^[A-Z][A-Z0-9_]*$')
_KNOWN_KEYCODE_PREFIXES = (
    'KC_',
    'QK_',
    'QK_JOYSTICK',
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
    'JS_',
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
    enum_keycodes: set[str] | None = None,
) -> list[str]:
    layer_names = {symbol for symbol, _idx in layer_symbols}
    reserved = enum_keycodes or set()
    custom: list[str] = []
    for keycode in keycodes:
        if not _BARE_KEYCODE_RE.fullmatch(keycode):
            continue
        if keycode in layer_names or _is_known_keycode(keycode) or keycode in custom:
            continue
        # Keycodes emitted as real SAFE_RANGE enum values (e.g. DPI_NEXT) must
        # not be stubbed to KC_NO — skip them so the enum value is used.
        if keycode in reserved:
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


def _emit_dpi_prelude(config: KeyboardConfig) -> list[str]:
    """Emit the DPI stage table + forward declaration for the indicator helper.

    Only emitted when a trackball with >=1 DPI stage exists. The stage array is
    consumed by the DPI_NEXT handler in process_record_user. The indicator
    helper lives in keyboard.c, so we forward-declare it here when present.
    """
    stages = _pointing.dpi_stages(config)
    if not stages:
        return []
    lines: list[str] = []
    if _pointing.has_indicator(config):
        lines.append(f'void {_pointing.DPI_INDICATOR_FN}(uint8_t stage);')
    stage_list = ', '.join(str(stage) for stage in stages)
    lines.append('/* DPI stages cycled by the DPI_NEXT keycode. */')
    lines.append(f'static const uint16_t dpi_stages[] = {{ {stage_list} }};')
    lines.append('')
    return lines


def _emit_dpi_next_case(config: KeyboardConfig) -> list[str]:
    """Emit the process_record_user case body for the DPI_NEXT keycode.

    Advances a static stage index through dpi_stages[], applies the new CPI,
    and (when configured) updates the shared LED indicator. Returns [] when no
    DPI stages are configured.
    """
    if not _pointing.dpi_stages(config):
        return []
    lines = [
        f'        case {_pointing.DPI_NEXT_KEYCODE}: {{',
        '            static uint8_t dpi_stage = 0;',
        '            dpi_stage = (dpi_stage + 1) % (sizeof(dpi_stages) / sizeof(dpi_stages[0]));',
        '            pointing_device_set_cpi(dpi_stages[dpi_stage]);',
    ]
    if _pointing.has_indicator(config):
        lines.append(f'            {_pointing.DPI_INDICATOR_FN}(dpi_stage);')
    lines.append('            return false;')
    lines.append('        }')
    return lines


def _emit_mode_next_case(config: KeyboardConfig) -> list[str]:
    """Emit the process_record_user case for the MODE_NEXT keycode.

    Advances g_nexus_config.active_mode modulo the number of enabled device
    modes and persists it to EEPROM via the shared settings save helper.
    Returns [] unless device-mode switching is active (>=2 modes).
    """
    if not _settings.device_mode_switching_active(config):
        return []
    mode_count = len(_settings.enabled_device_modes(config))
    return [
        f'        case {_settings.MODE_NEXT_KEYCODE}:',
        '            /* Cycle the active composite-HID device mode + persist it. */',
        f'            {_settings.CONFIG_GLOBAL}.active_mode = '
        f'({_settings.CONFIG_GLOBAL}.active_mode + 1) % {mode_count};',
        f'            {_settings.UPDATE_FN}();',
        '            return false;',
    ]


def _menu_keys_active(config: KeyboardConfig) -> bool:
    """True when a settings menu uses the 'keys' input mode (MENU_* keycodes)."""
    return _settings.menu_active(config) and _settings.menu_input_mode(config) == 'keys'


def _menu_encoder_active(config: KeyboardConfig) -> bool:
    """True when a settings menu uses the 'encoder' input mode."""
    return _settings.menu_active(config) and _settings.menu_input_mode(config) == 'encoder'


def _menu_keycodes(config: KeyboardConfig) -> list[str]:
    """MENU_* SAFE_RANGE keycodes to declare, or [] when keys input isn't used."""
    if not _menu_keys_active(config):
        return []
    return [
        _settings.MENU_UP_KEYCODE,
        _settings.MENU_DOWN_KEYCODE,
        _settings.MENU_SEL_KEYCODE,
    ]


def _emit_menu_keys_cases(config: KeyboardConfig) -> list[str]:
    """Emit process_record_user cases for the MENU_UP/DOWN/SEL keycodes.

    UP/DOWN step the selected setting's value; SEL advances the cursor to the
    next setting. All mutation + persistence is delegated to the shared
    nx_menu_* helpers defined in keyboard.c. Returns [] unless keys input active.
    """
    if not _menu_keys_active(config):
        return []
    return [
        f'        case {_settings.MENU_UP_KEYCODE}:',
        '            nx_menu_value_adjust(1);',
        '            return false;',
        f'        case {_settings.MENU_DOWN_KEYCODE}:',
        '            nx_menu_value_adjust(-1);',
        '            return false;',
        f'        case {_settings.MENU_SEL_KEYCODE}:',
        '            nx_menu_cursor_next();',
        '            return false;',
    ]


def _emit_menu_forward_decls(config: KeyboardConfig) -> list[str]:
    """Forward-declare the shared nx_menu_* helpers (defined in keyboard.c).

    Emitted whenever a keys-input or encoder-input menu handler in this file
    calls them. Returns [] otherwise.
    """
    if not (_menu_keys_active(config) or _menu_encoder_active(config)):
        return []
    return [
        '/* OLED settings-menu mutators (defined in keyboard.c). */',
        'void nx_menu_cursor_next(void);',
        'void nx_menu_value_adjust(int8_t dir);',
        '',
    ]


def _menu_encoder_index(config: KeyboardConfig) -> int | None:
    """Resolve the configured menu encoder's index into config.encoders.

    Returns None when encoder input isn't active or the id can't be resolved
    (falls back to encoder 0 when a menu is present but no id is set).
    """
    if not _menu_encoder_active(config):
        return None
    oleds = _settings.menu_oleds(config)
    enc_id = getattr(oleds[0], 'menu_encoder_id', None) if oleds else None
    encoders = config.encoders or []
    if enc_id is not None:
        for idx, enc in enumerate(encoders):
            if enc.id == enc_id:
                return idx
    return 0 if encoders else None


def _emit_menu_encoder_update(config: KeyboardConfig) -> list[str]:
    """Emit encoder_update_user() driving the menu from the configured encoder.

    On the menu encoder's index: clockwise steps the selected value up, counter-
    clockwise steps it down, and returning false consumes the event. A press to
    advance the cursor is handled separately via the MENU_SEL keycode / keys
    input; for encoder input the cursor is advanced by MENU_SEL if mapped, else
    the user cycles settings by pressing the encoder switch mapped in the keymap.

    Coexistence with ENCODER_MAP: encoder_map handles per-layer encoder keycodes,
    but QMK still calls encoder_update_user first. We take precedence ONLY for the
    menu encoder's index and return true for every other encoder so the default
    encoder_map behaviour is preserved. Returns [] unless encoder input active.
    """
    enc_idx = _menu_encoder_index(config)
    if enc_idx is None:
        return []
    return [
        '/* Menu encoder: this encoder scrolls the selected setting; every other',
        ' * encoder returns true so ENCODER_MAP / default handling still runs. */',
        'bool encoder_update_user(uint8_t index, bool clockwise) {',
        f'    if (index == {enc_idx}) {{',
        '        nx_menu_value_adjust(clockwise ? 1 : -1);',
        '        return false;',
        '    }',
        '    return true;',
        '}',
        '',
    ]


def _emit_process_record_user(config: KeyboardConfig) -> list[str]:
    """Emit process_record_user covering macros + DPI_NEXT + MODE_NEXT + MENU_*.

    Returns [] when none of macros, DPI stages, device-mode switching, or a
    keys-input settings menu are configured, keeping output byte-identical for
    configs that use none of them.
    """
    macros = config.macros or []
    dpi_case = _emit_dpi_next_case(config)
    mode_case = _emit_mode_next_case(config)
    menu_case = _emit_menu_keys_cases(config)
    if not macros and not dpi_case and not mode_case and not menu_case:
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
    lines.extend(dpi_case)
    lines.extend(mode_case)
    lines.extend(menu_case)
    lines.append('    }')
    lines.append('    return true;')
    lines.append('}')
    lines.append('')
    return lines


_HAT_DIRECTIONS = ('N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW')


def _joystick_mode_gate(config: KeyboardConfig) -> int | None:
    """Return the active_mode index that enables joystick output, or None.

    None means no mode gating applies (either device-mode switching is inactive
    or 'joystick' is not one of the configured modes), so joystick output is
    always emitted as before.
    """
    if not _settings.device_mode_switching_active(config):
        return None
    modes = _settings.enabled_device_modes(config)
    if 'joystick' not in modes:
        return None
    return modes.index('joystick')


def _emit_joystick_block(config: KeyboardConfig) -> list[str]:
    """Emit joystick_axes[] and an optional hat handler when joystick is enabled.

    Gated entirely behind features.get('joystick'); emits nothing otherwise.

    When composite-HID device-mode switching includes 'joystick', the hat and
    axis output is additionally gated on g_nexus_config.active_mode: unless
    joystick is the active mode, the hat is centered and every axis is forced to
    its rest value, so no joystick HID movement/buttons are reported. Keyboard
    reports stay active in every mode (mode gating only touches mouse/joystick).
    """
    if not config.features.get('joystick'):
        return []

    fc = config.feature_configs or {}
    js_cfg = fc.get('joystick', {})
    try:
        axis_count = int(js_cfg.get('JOYSTICK_AXIS_COUNT', '2'))
    except ValueError:
        axis_count = 2

    joysticks = config.joysticks or []
    joystick = joysticks[0] if joysticks else None
    axes = list(joystick.axes) if joystick else []

    mode_idx = _joystick_mode_gate(config)
    gated = mode_idx is not None

    lines: list[str] = []

    # joystick_axes[] — only when there are axes to declare.
    if axis_count > 0:
        axis_entries: list[str] = []
        for i in range(axis_count):
            axis = axes[i] if i < len(axes) else None
            if axis is None or axis.virtual or not axis.pin:
                axis_entries.append('JOYSTICK_AXIS_VIRTUAL')
            else:
                axis_entries.append(
                    f'JOYSTICK_AXIS_IN({axis.pin}, {axis.low}, {axis.rest}, {axis.high})'
                )
        lines.append(
            'joystick_config_t joystick_axes[JOYSTICK_AXIS_COUNT] = {'
        )
        for idx, entry in enumerate(axis_entries):
            sep = ',' if idx < len(axis_entries) - 1 else ''
            lines.append(f'    {entry}{sep}')
        lines.append('};')
        lines.append('')

    # Optional 8-way hat handler driven by configured direction pins.
    has_hat = js_cfg.get('JOYSTICK_HAS_HAT', 'no') == 'yes'
    hat_map = joystick.hat if (joystick and joystick.has_hat) else None
    need_scan = (has_hat and hat_map) or gated
    if need_scan:
        lines.append('/* Joystick: poll inputs each scan, gated by the active device mode. */')
        lines.append('void matrix_scan_user(void) {')
        if gated:
            # When joystick is not the active mode, force axes to rest + center
            # the hat so the composite device emits a neutral joystick report.
            lines.append(f'    if ({_settings.CONFIG_GLOBAL}.active_mode != {mode_idx}) {{')
            for i in range(axis_count):
                axis = axes[i] if i < len(axes) else None
                rest = axis.rest if (axis and not axis.virtual and axis.pin) else 0
                lines.append(f'        joystick_set_axis({i}, {rest});')
            if has_hat and hat_map:
                lines.append('        joystick_set_hat(-1);')
            lines.append('        return;')
            lines.append('    }')
        if has_hat and hat_map:
            lines.append('    int8_t hat_dir = -1;  /* -1 = centered */')
            for value, direction in enumerate(_HAT_DIRECTIONS):
                pin = hat_map.get(direction)
                if not pin:
                    continue
                lines.append(f'    if (readPin({pin}) == 0) hat_dir = {value};  /* {direction} */')
            lines.append('    joystick_set_hat(hat_dir);')
        lines.append('}')
        lines.append('')

    return lines


def _generated_keymap_prelude(config: KeyboardConfig) -> list[str]:
    keycodes = _all_keycodes(config)
    layer_symbols = _generated_layer_symbols(keycodes, len(config.layers))
    dpi_enabled = bool(_pointing.dpi_stages(config))
    mode_switch = _settings.device_mode_switching_active(config)
    menu_keycodes = _menu_keycodes(config)
    enum_keycodes: set[str] = set()
    if dpi_enabled:
        enum_keycodes.add(_pointing.DPI_NEXT_KEYCODE)
    if mode_switch:
        enum_keycodes.add(_settings.MODE_NEXT_KEYCODE)
    enum_keycodes.update(menu_keycodes)
    custom_keycodes = _generated_custom_keycode_defines(keycodes, layer_symbols, enum_keycodes)
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

    # User keycode enum (SAFE_RANGE). Macros are emitted as NX_M*, and the DPI
    # cycle keycode DPI_NEXT is appended as a real enum value so it is a
    # distinct keycode (never #defined to KC_NO). Both share one SAFE_RANGE
    # origin to keep keycode values contiguous and non-overlapping.
    macros = config.macros or []
    enum_items: list[str] = [_macro_enum_name(i) for i in range(len(macros))]
    if dpi_enabled:
        enum_items.append(_pointing.DPI_NEXT_KEYCODE)
    if mode_switch:
        enum_items.append(_settings.MODE_NEXT_KEYCODE)
    enum_items.extend(menu_keycodes)

    if enum_items:
        lines.append('enum nexus_macros {')
        for i, item in enumerate(enum_items):
            suffix = ' = SAFE_RANGE' if i == 0 else ''
            lines.append(f'    {item}{suffix},')
        lines.append('};')
        if macros:
            lines.append(f'#define M(n) ({_macro_enum_name(0)} + (n))')
        lines.append('')

    lines.extend(_emit_dpi_prelude(config))
    lines.extend(_emit_menu_forward_decls(config))

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

    lines.extend(_emit_joystick_block(config))

    lines.extend(_emit_menu_encoder_update(config))

    lines.extend(_emit_process_record_user(config))

    return "\n".join(lines)
