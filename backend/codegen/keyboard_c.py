from __future__ import annotations

from models import KeyboardConfig, OledElement
from codegen._matrix import matrix_keys, matrix_rows, matrix_cols, resolve_rgb_led_count, pins_json_safe


def _c_string(text: str) -> str:
    return text.replace('\\', '\\\\').replace('"', '\\"').replace('\r', ' ').replace('\n', ' ')


def _rgb_matrix_driver(config: KeyboardConfig) -> str:
    rgb = (config.feature_configs or {}).get('rgb_matrix', {})
    return str(rgb.get('RGB_MATRIX_DRIVER', 'WS2812')).upper()


def _is31fl3731_driver_count(config: KeyboardConfig) -> int:
    rgb = (config.feature_configs or {}).get('rgb_matrix', {})
    default_count = 2 if (config.features or {}).get('split_keyboard') else 1
    try:
        return max(1, int(rgb.get('IS31FL3731_DRIVER_COUNT', str(default_count))))
    except ValueError:
        return default_count


def _is31fl3731_channel_triplet(index: int) -> tuple[str, str, str]:
    group = index // 16
    row = (index % 16) + 1
    first_col = (group * 3) + 1
    return (
        f'C{first_col}_{row}',
        f'C{first_col + 1}_{row}',
        f'C{first_col + 2}_{row}',
    )


def _emit_is31fl3731_leds(config: KeyboardConfig, led_count: int) -> list[str]:
    driver_count = _is31fl3731_driver_count(config)
    leds_per_driver = max(1, (led_count + driver_count - 1) // driver_count)
    leds_per_driver = min(48, leds_per_driver)

    lines = [
        'const is31fl3731_led_t PROGMEM g_is31fl3731_leds[IS31FL3731_LED_COUNT] = {',
    ]
    for led_index in range(led_count):
        driver = min(driver_count - 1, led_index // leds_per_driver)
        local_index = led_index - (driver * leds_per_driver)
        red, green, blue = _is31fl3731_channel_triplet(local_index)
        lines.append(f'    {{ {driver}, {red}, {green}, {blue} }},')
    lines.append('};')
    lines.append('')
    return lines


def _oled_block_snippet(block_id: str, indent: str, config: KeyboardConfig, oled_idx: int = 0, oled: OledElement | None = None) -> list[str]:
    if block_id == 'logo':
        if oled and oled.logo_bytes:
            name = f'_oled{oled_idx}_logo'
            return [f'{indent}oled_write_raw_P({name}, sizeof({name}));']
        return [f'{indent}oled_write_P(PSTR("QMK Nexus\\n"), false);']

    snippets: dict[str, list[str]] = {
        'layer_name': [
            f'{indent}switch (get_highest_layer(layer_state)) {{',
            *[f'{indent}    case {i}: oled_write_P(PSTR("{_c_string(f"{layer.name:<6}")}"), false); break;'
              for i, layer in enumerate(config.layers)],
            f'{indent}    default:  oled_write_P(PSTR("???   "), false); break;',
            f'{indent}}}',
        ],
        'wpm': [
            f'{indent}oled_write_P(PSTR("WPM: "), false);',
            f'{indent}oled_write(get_u8_str(get_current_wpm(), \'0\'), false);',
            f'{indent}oled_write_P(PSTR("\\n"), false);',
        ],
        'host_leds': [
            f'{indent}{{',
            f'{indent}    led_t led_state = host_keyboard_led_state();',
            f'{indent}    oled_write_P(led_state.num_lock    ? PSTR("NUM ") : PSTR("    "), false);',
            f'{indent}    oled_write_P(led_state.caps_lock   ? PSTR("CAP ") : PSTR("    "), false);',
            f'{indent}    oled_write_P(led_state.scroll_lock ? PSTR("SCR ") : PSTR("    "), false);',
            f'{indent}}}',
        ],
        'mod_indicators': [
            f'{indent}{{',
            f'{indent}    uint8_t mods = get_mods() | get_oneshot_mods();',
            f'{indent}    oled_write_P(mods & MOD_MASK_SHIFT ? PSTR("SFT ") : PSTR("    "), false);',
            f'{indent}    oled_write_P(mods & MOD_MASK_CTRL  ? PSTR("CTL ") : PSTR("    "), false);',
            f'{indent}    oled_write_P(mods & MOD_MASK_ALT   ? PSTR("ALT ") : PSTR("    "), false);',
            f'{indent}    oled_write_P(mods & MOD_MASK_GUI   ? PSTR("GUI ") : PSTR("    "), false);',
            f'{indent}}}',
        ],
        'keylog': [
            f'{indent}/* keylog: implement keylog_str in your keymap, then: */',
            f'{indent}/* oled_write(keylog_str, false); */',
        ],
        'master_slave': [
            f'{indent}oled_write_P(is_keyboard_master() ? PSTR("Master") : PSTR("Slave "), false);',
            f'{indent}oled_write_P(PSTR("\\n"), false);',
        ],
    }
    return snippets.get(block_id, [f'{indent}/* unknown block: {block_id} */'])


def _emit_blocks(blocks: list[str], indent: str, config: KeyboardConfig, oled: OledElement, oled_idx: int) -> list[str]:
    lines: list[str] = []
    for block_id in blocks:
        lines.extend(_oled_block_snippet(block_id, indent, config, oled_idx, oled))
    return lines


def _emit_oled_body(oled: OledElement, indent: str, config: KeyboardConfig, oled_idx: int = 0) -> list[str]:
    lines: list[str] = []

    if oled.content_mode == 'custom' and oled.custom_code.strip():
        for line in oled.custom_code.splitlines():
            lines.append(f'{indent}{line}')
        return lines

    has_startup = bool(oled.startup_blocks)
    has_idle    = bool(oled.idle_blocks)
    has_active  = bool(oled.active_blocks)
    startup_ms  = oled.startup_duration if oled.startup_duration is not None else 15000
    idle_ms     = oled.idle_timeout if oled.idle_timeout is not None else 10000

    # Per-OLED indexed variable avoids name collision in split multi-OLED output.
    startup_var = f'_startup_t_{oled_idx}'

    if has_startup:
        lines.append(f'{indent}static uint32_t {startup_var} = 0;')
        lines.append(f'{indent}if (!{startup_var}) {startup_var} = timer_read32();')
        lines.append(f'{indent}if (timer_elapsed32({startup_var}) < {startup_ms}U) {{')
        lines.extend(_emit_blocks(oled.startup_blocks, indent + '    ', config, oled, oled_idx))
        lines.append(f'{indent}    return false;')
        lines.append(f'{indent}}}')

    if has_idle:
        lines.append(f'{indent}if (last_input_activity_elapsed() > {idle_ms}U) {{')
        lines.extend(_emit_blocks(oled.idle_blocks, indent + '    ', config, oled, oled_idx))
        lines.append(f'{indent}    return false;')
        lines.append(f'{indent}}}')

    if has_active:
        lines.extend(_emit_blocks(oled.active_blocks, indent, config, oled, oled_idx))
    elif not has_startup and not has_idle:
        lines.append(f'{indent}/* No OLED content configured */')

    return lines


def generate_keyboard_c(config: KeyboardConfig) -> str:
    keys = matrix_keys(config)
    rows = matrix_rows(config)
    cols = matrix_cols(config)
    rgb_enabled   = config.features.get('rgb_matrix', False)
    split_enabled = config.features.get('split_keyboard', False)
    oled_enabled  = config.features.get('oled', False) and bool(config.oleds)
    fc = config.feature_configs or {}
    rgb_driver = _rgb_matrix_driver(config) if rgb_enabled else ''

    lines: list[str] = ['#include QMK_KEYBOARD_H']
    if rgb_enabled:
        lines.append('#include "rgb_matrix.h"')
        if rgb_driver == 'IS31FL3731':
            lines.append('#include "drivers/led/issi/is31fl3731.h"')
    if split_enabled:
        lines.append('#include "split_util.h"')
    if oled_enabled:
        lines.append('#include "oled_driver.h"')
    lines.append('')

    if rgb_enabled:
        # led_count is the authoritative size for the flags/points arrays and
        # must match RGB_MATRIX_LED_COUNT emitted by config_h (which may be
        # an explicit value imported from the upstream keyboard's LED layout).
        led_count = resolve_rgb_led_count(config)
        if rgb_driver == 'IS31FL3731':
            lines.extend(_emit_is31fl3731_leds(config, led_count))

        explicit_led_keys = sorted(
            [k for k in keys if k.led_index is not None],
            key=lambda k: k.led_index,  # type: ignore[arg-type]
        )

        matrix_led: list[list[str]] = [['NO_LED'] * cols for _ in range(rows)]
        if explicit_led_keys:
            for k in explicit_led_keys:
                if k.row is not None and k.col is not None:
                    matrix_led[k.row][k.col] = str(k.led_index)
        else:
            # No explicit indices: assign sequentially to the first led_count keys.
            for i, k in enumerate(keys[:led_count]):
                if k.row is not None and k.col is not None:
                    matrix_led[k.row][k.col] = str(i)

        lines.append('led_config_t g_led_config = { {')
        for row in matrix_led:
            lines.append('    { ' + ', '.join(row) + ' },')
        lines.append('}, {')

        # Points: exactly led_count entries.
        if explicit_led_keys:
            max_x = max((k.x for k in explicit_led_keys), default=1.0) or 1.0
            max_y = max((k.y for k in explicit_led_keys), default=1.0) or 1.0
            idx_to_key = {k.led_index: k for k in explicit_led_keys}
            for i in range(led_count):
                k = idx_to_key.get(i)
                if k:
                    px = int((k.x / max_x) * 224)
                    py = int((k.y / max_y) * 64)
                else:
                    px = int((i / max(led_count - 1, 1)) * 224)
                    py = 32
                lines.append(f'    {{ {px}, {py} }},')
        else:
            position_keys = keys[:led_count]
            if position_keys:
                max_x = max((k.x for k in position_keys), default=1.0) or 1.0
                max_y = max((k.y for k in position_keys), default=1.0) or 1.0
                for k in position_keys:
                    px = int((k.x / max_x) * 224)
                    py = int((k.y / max_y) * 64)
                    lines.append(f'    {{ {px}, {py} }},')
                for i in range(len(position_keys), led_count):
                    lines.append(f'    {{ {int((i / max(led_count - 1, 1)) * 224)}, 32 }},')
            else:
                for i in range(led_count):
                    lines.append(f'    {{ {int((i / max(led_count - 1, 1)) * 224)}, 32 }},')
        lines.append('}, {')

        # Flags: exactly led_count entries.
        for _ in range(led_count):
            lines.append('    4,')  # LED_FLAG_KEYLIGHT
        lines.append('} };')
        lines.append('')

    if split_enabled:
        sp = fc.get('split_keyboard', {})
        lines.append('void keyboard_post_init_kb(void) {')
        lines.append('    split_post_init();')
        if sp.get('SPLIT_TRANSPORT_MIRROR', 'no') == 'yes':
            lines.append('    split_transport_mirror = true;')
        if sp.get('SPLIT_LAYER_STATE_ENABLE', 'no') == 'yes':
            lines.append('    split_layer_state_enable = true;')
        lines.append('    keyboard_post_init_user();')
        lines.append('}')
        lines.append('')

    if oled_enabled:
        # File-scope PROGMEM logo arrays — one per OLED that has logo bytes.
        # Must be at file scope to avoid duplicate static-local symbol names.
        for oled_idx, oled in enumerate(config.oleds):
            if oled.logo_bytes:
                vals = ', '.join(f'0x{b:02x}' for b in oled.logo_bytes)
                lines.append(f'static const uint8_t PROGMEM _oled{oled_idx}_logo[] = {{ {vals} }};')
        if any(o.logo_bytes for o in config.oleds):
            lines.append('')

        lines.append('bool oled_task_user(void) {')
        if len(config.oleds) == 1:
            lines.extend(_emit_oled_body(config.oleds[0], '    ', config, 0))
        elif split_enabled and len(config.oleds) >= 2:
            # Split dispatch: OLED 0 = master side, OLED 1 = slave side.
            lines.append('    if (is_keyboard_master()) {')
            lines.extend(_emit_oled_body(config.oleds[0], '        ', config, 0))
            lines.append('    } else {')
            lines.extend(_emit_oled_body(config.oleds[1], '        ', config, 1))
            lines.append('    }')
        else:
            lines.extend(_emit_oled_body(config.oleds[0], '    ', config, 0))
        lines.append('    return false;')
        lines.append('}')
        lines.append('')

    # CUSTOM_MATRIX = lite stubs for keyboards with non-GPIO expander pins.
    # These no-ops let the firmware link; the matrix never registers key presses
    # until the user wires up real custom matrix code via custom_files.
    all_pins = [p.pin for p in (config.row_pins or []) + (config.col_pins or [])]
    if all_pins and not pins_json_safe(all_pins):
        lines += [
            'void matrix_init_custom(void) {}',
            '',
            'bool matrix_scan_custom(matrix_row_t current_matrix[]) {',
            '    (void)current_matrix;',
            '    return false;',
            '}',
            '',
        ]

    return '\n'.join(lines)
