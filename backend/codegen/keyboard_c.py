from __future__ import annotations

from models import KeyboardConfig, OledElement
from codegen._matrix import matrix_keys, matrix_rows, matrix_cols, resolve_rgb_led_count, pins_json_safe
from codegen import _pointing
from codegen import _settings


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


def _menu_setting_label(setting: str) -> str:
    """Fixed-width (7-char) label for a menu row so the OLED columns line up."""
    return {
        'dpi_stage':        'DPI    ',
        'device_mode':      'Mode   ',
        'rgb_brightness':   'RGB    ',
        'joystick_enabled': 'Joy    ',
    }.get(setting, f'{setting:<7}'[:7])


def _menu_value_snippet(setting: str, config: KeyboardConfig, indent: str) -> list[str]:
    """Emit the C that prints the current value for one menu setting."""
    cfg = _settings.CONFIG_GLOBAL
    if setting == 'dpi_stage':
        return [f'{indent}oled_write(get_u16_str(pointing_device_get_cpi(), \' \'), false);']
    if setting == 'device_mode':
        modes = _settings.enabled_device_modes(config)
        lines = [f'{indent}switch ({cfg}.active_mode) {{']
        for idx, mode in enumerate(modes):
            lines.append(
                f'{indent}    case {idx}: oled_write_P(PSTR("{_c_string(f"{mode:<8}"[:8])}"), false); break;'
            )
        lines.append(f'{indent}    default: oled_write_P(PSTR("?       "), false); break;')
        lines.append(f'{indent}}}')
        return lines
    if setting == 'rgb_brightness':
        rgb_matrix = bool((config.features or {}).get('rgb_matrix'))
        getter = 'rgb_matrix_get_val()' if rgb_matrix else 'rgblight_get_val()'
        return [f'{indent}oled_write(get_u8_str({getter}, \' \'), false);']
    if setting == 'joystick_enabled':
        return [
            f'{indent}oled_write_P({cfg}.joystick_enabled ? PSTR("ON ") : PSTR("OFF"), false);'
        ]
    return [f'{indent}oled_write_P(PSTR("?"), false);']


def _emit_settings_menu_block(indent: str, config: KeyboardConfig, oled: OledElement | None) -> list[str]:
    """Render the interactive settings menu on the OLED.

    A title line, then one row per exposed setting: a cursor marker for the row
    matching g_nexus_config.menu_index, a fixed-width label, and the setting's
    live value (read from g_nexus_config / QMK getters).
    """
    settings = _settings.menu_settings_for(oled) if oled else []
    if not settings:
        return [f'{indent}/* settings_menu: no settings exposed */']
    cfg = _settings.CONFIG_GLOBAL
    lines: list[str] = [f'{indent}oled_write_P(PSTR("SETTINGS\\n"), false);']
    for row, setting in enumerate(settings):
        lines.append(
            f'{indent}oled_write_P({cfg}.menu_index == {row} ? PSTR(">") : PSTR(" "), false);'
        )
        lines.append(f'{indent}oled_write_P(PSTR("{_c_string(_menu_setting_label(setting))}"), false);')
        lines.extend(_menu_value_snippet(setting, config, indent))
        lines.append(f'{indent}oled_write_P(PSTR("\\n"), false);')
    return lines


def _oled_block_snippet(block_id: str, indent: str, config: KeyboardConfig, oled_idx: int = 0, oled: OledElement | None = None) -> list[str]:
    if block_id == 'logo':
        if oled and oled.logo_bytes:
            name = f'_oled{oled_idx}_logo'
            return [f'{indent}oled_write_raw_P({name}, sizeof({name}));']
        return [f'{indent}oled_write_P(PSTR("QMK Nexus\\n"), false);']

    if block_id == 'settings_menu':
        return _emit_settings_menu_block(indent, config, oled)

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


def _emit_dpi_indicator_helper(config: KeyboardConfig) -> list[str]:
    """Emit nx_dpi_indicator_update(stage) — shared by init + DPI_NEXT handler.

    Only emitted when a DPI indicator (rgb or pins) is configured. The function
    is non-static so keymap.c can forward-declare and call it. Returns [] when
    no indicator is active, keeping output byte-identical for configs without
    a DPI indicator.
    """
    if not _pointing.has_indicator(config):
        return []

    ball = _pointing.active_trackball(config)
    indicator = ball.dpi_indicator if ball else None
    if indicator is None:
        return []

    lines: list[str] = [
        '/* DPI indicator: reflect the active DPI stage. Shared by the pointing',
        ' * device init and the DPI_NEXT keycode handler. */',
        f'void {_pointing.DPI_INDICATOR_FN}(uint8_t stage) {{',
    ]

    if _pointing.rgb_indicator_active(config):
        rgb_matrix = bool((config.features or {}).get('rgb_matrix'))
        triplets = [_pointing.color_to_rgb(c) for c in indicator.colors]
        lines.append('    switch (stage) {')
        for idx, (red, green, blue) in enumerate(triplets):
            sep = 'case' if idx < len(triplets) - 1 else 'default'
            label = f'case {idx}:' if idx < len(triplets) - 1 else 'default:'
            if rgb_matrix:
                setter = f'rgb_matrix_set_color_all({red}, {green}, {blue});'
            else:
                setter = f'rgblight_setrgb({red}, {green}, {blue});'
            lines.append(f'        {label} {setter} break;')
        lines.append('    }')

    if _pointing.pins_indicator_active(config):
        pins = indicator.pins
        lines.append('    /* Drive indicator pins to encode the stage index in binary. */')
        for bit, pin in enumerate(pins):
            lines.append(f'    gpio_set_pin_output({pin});')
            lines.append(f'    gpio_write_pin({pin}, (stage >> {bit}) & 1);')

    lines.append('}')
    lines.append('')
    return lines


def _emit_pointing_device_init(config: KeyboardConfig) -> list[str]:
    """Emit pointing_device_init_user() to set the startup CPI.

    Gated on a resolvable default CPI (explicit cpi or first DPI stage). For a
    split keyboard the per-side setter is preferred so both halves share the
    CPI. Returns [] otherwise.
    """
    cpi = _pointing.default_cpi(config)
    if cpi is None:
        return []

    split = bool((config.features or {}).get('split_keyboard'))
    lines: list[str] = [
        'void pointing_device_init_user(void) {',
    ]
    if split:
        lines.append('    /* Split: set CPI on both halves so they match. */')
        lines.append(f'    pointing_device_set_cpi_on_side(true, {cpi});')
        lines.append(f'    pointing_device_set_cpi_on_side(false, {cpi});')
    else:
        lines.append(f'    pointing_device_set_cpi({cpi});')
    if _pointing.has_indicator(config):
        lines.append(f'    {_pointing.DPI_INDICATOR_FN}(0);')
    lines.append('}')
    lines.append('')
    return lines


def _emit_mode_gate_pointing(config: KeyboardConfig) -> list[str]:
    """Emit pointing_device_task_user() to gate the mouse report by active mode.

    Device-mode switching runs keyboard / mouse / joystick as one composite HID
    device; ``g_nexus_config.active_mode`` indexes into the enabled device_modes
    list and decides which report category is emitted. When 'mouse' is NOT the
    active mode we zero the mouse report so no pointer movement / buttons are
    sent, while QMK keeps reading the sensor (so switching back is instant).

    Note: keyboard (key matrix) reports are intentionally NEVER gated -- mode
    switching only suppresses the mouse/joystick HID categories, so the user can
    never lock themselves out of the keyboard regardless of the active mode.

    Gated on: device-mode switching active, pointing_device enabled, and 'mouse'
    being one of the configured modes. Returns [] otherwise.
    """
    if not _settings.device_mode_switching_active(config):
        return []
    if not (config.features or {}).get('pointing_device'):
        return []
    modes = _settings.enabled_device_modes(config)
    if 'mouse' not in modes:
        return []

    mouse_idx = modes.index('mouse')
    return [
        '/* Mode gate: only emit the mouse HID report when mouse is the active',
        ' * device mode. Other modes zero the report (no movement/buttons). */',
        'report_mouse_t pointing_device_task_user(report_mouse_t mouse_report) {',
        f'    if ({_settings.CONFIG_GLOBAL}.active_mode != {mouse_idx}) {{',
        '        report_mouse_t empty = {0};',
        '        return empty;',
        '    }',
        '    return mouse_report;',
        '}',
        '',
    ]


def _pointing_tap_supported(config: KeyboardConfig) -> bool:
    """True when a pointing device whose driver supports a native tap gesture is
    configured. Best-effort: Azoteq (IQS5xx) and Cirque (pinnacle) trackpads
    expose ``*_get_report`` touch data; other sensors (pmw3360, etc.) don't.
    """
    if not (config.features or {}).get('pointing_device'):
        return False
    fc = config.feature_configs or {}
    driver = str((fc.get('pointing_device') or {}).get('POINTING_DEVICE_DRIVER', '')).lower()
    ball = _pointing.active_trackball(config)
    ball_driver = str(getattr(ball, 'driver', '') or '').lower()
    combined = f'{driver} {ball_driver}'
    return any(tag in combined for tag in ('azoteq', 'iqs5', 'cirque', 'pinnacle'))


def _emit_menu_mutators(config: KeyboardConfig) -> list[str]:
    """Emit shared, non-static menu mutation helpers used by every input mode.

    ``nx_menu_cursor_next()`` advances the persisted cursor across the exposed
    settings; ``nx_menu_value_adjust(dir)`` changes the currently-selected
    setting's value (+1 / -1) and persists. keymap.c forward-declares and calls
    these so the encoder / MENU_* keycode handlers reuse one implementation.

    Returns [] unless a settings menu is active, keeping output byte-identical
    for configs without a menu.
    """
    if not _settings.menu_active(config):
        return []

    settings = _settings.active_menu_settings(config)
    count = len(settings)
    cfg = _settings.CONFIG_GLOBAL
    save = _settings.UPDATE_FN
    rgb_matrix = bool((config.features or {}).get('rgb_matrix'))

    lines: list[str] = [
        '/* OLED settings-menu mutators — shared by every input mode (encoder,',
        ' * MENU_* keycodes, pointing-device tap). Cursor + values live in the',
        ' * persisted g_nexus_config; each change is flushed to EEPROM. */',
        f'void nx_menu_cursor_next(void) {{',
        f'    {cfg}.menu_index = ({cfg}.menu_index + 1) % {count};',
        f'    {save}();',
        '}',
        '',
        'void nx_menu_value_adjust(int8_t dir) {',
        f'    switch ({cfg}.menu_index) {{',
    ]
    for row, setting in enumerate(settings):
        # Braced case body so per-case local declarations (e.g. the dpi_stage
        # ``uint16_t cpi``) are legal C after a case label.
        lines.append(f'        case {row}: {{  /* {setting} */')
        lines.extend(f'            {line}' for line in _menu_adjust_snippet(setting, config, rgb_matrix))
        lines.append('            break;')
        lines.append('        }')
    lines.append('        default: break;')
    lines.append('    }')
    lines.append(f'    {save}();')
    lines.append('}')
    lines.append('')
    return lines


def _menu_adjust_snippet(setting: str, config: KeyboardConfig, rgb_matrix: bool) -> list[str]:
    """C body that adjusts one setting by ``dir`` (+1/-1)."""
    cfg = _settings.CONFIG_GLOBAL
    if setting == 'dpi_stage':
        # Step the live CPI in 100-count increments, clamped to a sane range.
        return [
            'uint16_t cpi = pointing_device_get_cpi();',
            'cpi = (dir > 0) ? cpi + 100 : (cpi > 100 ? cpi - 100 : 100);',
            'pointing_device_set_cpi(cpi);',
        ]
    if setting == 'device_mode':
        count = len(_settings.enabled_device_modes(config))
        return [
            f'{cfg}.active_mode = ({cfg}.active_mode + (dir > 0 ? 1 : {count} - 1)) % {count};',
        ]
    if setting == 'rgb_brightness':
        step = 'rgb_matrix_increase_val(); ' if rgb_matrix else 'rgblight_increase_val(); '
        step_dn = 'rgb_matrix_decrease_val();' if rgb_matrix else 'rgblight_decrease_val();'
        getter = 'rgb_matrix_get_val()' if rgb_matrix else 'rgblight_get_val()'
        return [
            f'if (dir > 0) {{ {step}}} else {{ {step_dn} }}',
            f'{cfg}.rgb_brightness = {getter};',
        ]
    if setting == 'joystick_enabled':
        return [
            f'{cfg}.joystick_enabled = {cfg}.joystick_enabled ? 0 : 1;',
        ]
    return ['/* no-op */']


def _emit_menu_pointing_tap(config: KeyboardConfig) -> list[str]:
    """Emit the pointing-device tap hook that steps the menu value on a tap.

    Only emitted when menu_input == 'pointing_tap'. When no supported trackpad is
    present we emit an explanatory comment instead of a hook, so the user knows a
    tap-capable sensor (Azoteq / Cirque) is required.
    """
    if _settings.menu_input_mode(config) != 'pointing_tap':
        return []
    if not _pointing_tap_supported(config):
        return [
            '/* OLED menu input is set to pointing-device tap, but no tap-capable',
            ' * trackpad (Azoteq IQS5xx / Cirque Pinnacle) is configured. Tap',
            ' * detection requires such a sensor; no tap hook generated. */',
            '',
        ]
    # A tap toggles the value; the derived tap comes from the mouse report having
    # no movement while a button/contact registers. We approximate a tap as a
    # BTN1 press edge in pointing_device_task_user.
    return [
        '/* OLED menu: treat a trackpad tap (BTN1 press edge, no movement) as a',
        ' * value step for the selected setting. */',
        'void nx_menu_value_adjust(int8_t dir);',
        'report_mouse_t pointing_device_task_user(report_mouse_t mouse_report) {',
        '    static bool prev_pressed = false;',
        '    bool pressed = (mouse_report.buttons & MOUSE_BTN1) != 0;',
        '    if (pressed && !prev_pressed && mouse_report.x == 0 && mouse_report.y == 0) {',
        '        nx_menu_value_adjust(1);',
        '        mouse_report.buttons &= ~MOUSE_BTN1;  /* consume the tap */',
        '    }',
        '    prev_pressed = pressed;',
        '    return mouse_report;',
        '}',
        '',
    ]


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
    menu_needs_pointing = _settings.menu_input_mode(config) == 'pointing_tap' or (
        'dpi_stage' in _settings.active_menu_settings(config)
    )
    if _pointing.default_cpi(config) is not None or _pointing.has_indicator(config) or menu_needs_pointing:
        lines.append('#include "pointing_device.h"')
    if _settings.has_settings(config):
        # memcpy for packing the settings struct into the eeconfig user word.
        lines.append('#include <string.h>')
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
        lines.append('}, {')

        # Flags: exactly led_count entries.
        for _ in range(led_count):
            lines.append('    4,')  # LED_FLAG_KEYLIGHT
        lines.append('} };')
        lines.append('')

    if split_enabled:
        lines.append('void keyboard_post_init_kb(void) {')
        lines.append('    split_post_init();')
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

        _ROT = {90: 'OLED_ROTATION_90', 180: 'OLED_ROTATION_180', 270: 'OLED_ROTATION_270'}
        rot0 = _ROT.get(getattr(config.oleds[0], 'display_rotation', 0) if config.oleds else 0)
        rot1 = _ROT.get(getattr(config.oleds[1], 'display_rotation', 0) if len(config.oleds) > 1 else 0)
        need_init = rot0 or (split_enabled and rot1)
        if need_init:
            lines.append('oled_rotation_t oled_init_user(oled_rotation_t rotation) {')
            if split_enabled and len(config.oleds) >= 2:
                if rot0:
                    lines.append(f'    if (is_keyboard_master()) return {rot0};')
                if rot1:
                    lines.append(f'    if (!is_keyboard_master()) return {rot1};')
            elif rot0:
                lines.append(f'    return {rot0};')
            lines.append('    return rotation;')
            lines.append('}')
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

    # Persistent user settings (EEPROM) scaffold: struct + eeconfig hooks +
    # save helper. Emitted only when a feature registers a field (today: device
    # mode switching). Phase D extends the field registry in codegen/_settings.py.
    lines.extend(_settings.emit_settings_block(config))

    # Pointing-device DPI: indicator helper first (referenced by init), then init.
    lines.extend(_emit_dpi_indicator_helper(config))
    lines.extend(_emit_pointing_device_init(config))

    # OLED settings-menu mutators (shared by encoder / MENU_* / tap inputs).
    lines.extend(_emit_menu_mutators(config))

    # Mode gate for the mouse HID report (composite-HID device-mode switching).
    mode_gate = _emit_mode_gate_pointing(config)
    lines.extend(mode_gate)

    # Pointing-device tap → menu value step. Skipped when the mode gate already
    # defines pointing_device_task_user (they'd otherwise collide); in that case
    # the tap-to-menu input mode is unavailable and a note is emitted instead.
    tap_lines = _emit_menu_pointing_tap(config)
    if tap_lines and mode_gate:
        lines.append('/* OLED menu tap input suppressed: pointing_device_task_user')
        lines.append(' * is already used by device-mode mouse gating. */')
        lines.append('')
    else:
        lines.extend(tap_lines)

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
