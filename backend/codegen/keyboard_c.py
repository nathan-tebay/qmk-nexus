from __future__ import annotations

from models import KeyboardConfig, OledElement
from codegen._matrix import matrix_keys, matrix_rows, matrix_cols


def _oled_block_snippet(block_id: str, indent: str, config: KeyboardConfig, oled_idx: int = 0, oled: OledElement | None = None) -> list[str]:
    if block_id == 'logo':
        if oled and oled.logo_bytes:
            name = f'_oled{oled_idx}_logo'
            return [f'{indent}oled_write_raw_P({name}, sizeof({name}));']
        return [f'{indent}oled_write_P(PSTR("QMK Nexus\\n"), false);']

    snippets: dict[str, list[str]] = {
        'layer_name': [
            f'{indent}switch (get_highest_layer(layer_state)) {{',
            *[f'{indent}    case {i}: oled_write_P(PSTR("{layer.name:<6}"), false); break;'
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

    lines: list[str] = ['#include QMK_KEYBOARD_H']
    if rgb_enabled:
        lines.append('#include "rgb_matrix.h"')
    if split_enabled:
        lines.append('#include "split_util.h"')
    if oled_enabled:
        lines.append('#include "oled_driver.h"')
    lines.append('')

    if rgb_enabled:
        led_keys = [k for k in keys if k.led_index is not None] or [
            k for k in keys if k.row is not None and k.col is not None
        ]

        matrix_led: list[list[str]] = [['NO_LED'] * cols for _ in range(rows)]
        for k in led_keys:
            if k.row is None or k.col is None:
                continue
            idx = k.led_index if k.led_index is not None else led_keys.index(k)
            matrix_led[k.row][k.col] = str(idx)

        lines.append('led_config_t g_led_config = { {')
        for row in matrix_led:
            lines.append('    { ' + ', '.join(row) + ' },')
        lines.append('}, {')

        max_x = max((k.x for k in led_keys), default=1.0) or 1.0
        max_y = max((k.y for k in led_keys), default=1.0) or 1.0
        for k in led_keys:
            px = int((k.x / max_x) * 224)
            py = int((k.y / max_y) * 64)
            lines.append(f'    {{ {px}, {py} }},')
        lines.append('}, {')

        for _ in led_keys:
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
        else:
            # Split dispatch: OLED 0 = master side, OLED 1 = slave side.
            # Only two OLEDs supported in the split dispatch path.
            lines.extend(_emit_oled_body(config.oleds[0], '    ', config, 0))
            # Unreachable guard keeps the slave body valid when master_slave block is absent.
            lines.append('    if (!is_keyboard_master()) {')
            lines.extend(_emit_oled_body(config.oleds[1], '        ', config, 1))
            lines.append('    }')
        lines.append('    return false;')
        lines.append('}')
        lines.append('')

    return '\n'.join(lines)
