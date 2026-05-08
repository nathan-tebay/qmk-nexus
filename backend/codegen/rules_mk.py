from __future__ import annotations

from models import KeyboardConfig
from codegen._mcu import MCU_ARCH, MCU_QMK_NAME, MCU_QMK_BOARD
from codegen._matrix import pins_json_safe


def generate_rules_mk(config: KeyboardConfig) -> str:
    lines: list[str] = []
    fc = config.feature_configs or {}
    mcu = (config.mcu or 'atmega32u4').lower()
    arch_info = MCU_ARCH.get(mcu, ('avr', '16000000'))
    arch = arch_info[0]

    # Custom matrix lite for keyboards with non-GPIO expander pins (e.g. MCP_A0).
    # The keyboard .c file provides matrix_init_custom / matrix_scan_custom stubs.
    all_pins = [p.pin for p in (config.row_pins or []) + (config.col_pins or [])]
    if all_pins and not pins_json_safe(all_pins):
        lines.append('CUSTOM_MATRIX = lite')
        lines.append('')

    # MCU
    lines.append(f'MCU = {MCU_QMK_NAME.get(mcu, mcu)}')
    if arch == 'avr':
        lines.append(f'F_CPU = {arch_info[1]}')
    elif arch == 'chibios':
        lines.append('TARGET_ARCH = ARM')
        board = MCU_QMK_BOARD.get(mcu)
        if board:
            lines.append(f'BOARD = {board}')
    lines.append('')

    # Features — one ENABLE = yes per enabled feature
    features = config.features or {}
    feature_map: list[tuple[str, str]] = [
        ('extrakeys',     'EXTRAKEY_ENABLE'),
        ('nkro',          'NKRO_ENABLE'),
        ('bootmagic',     'BOOTMAGIC_ENABLE'),
        ('mousekeys',     'MOUSEKEY_ENABLE'),
        ('encoder',       'ENCODER_ENABLE'),
        ('oled',          'OLED_ENABLE'),
        ('backlight',     'BACKLIGHT_ENABLE'),
        ('rgblight',      'RGBLIGHT_ENABLE'),
        ('rgb_matrix',    'RGB_MATRIX_ENABLE'),
        ('split_keyboard','SPLIT_KEYBOARD'),
        ('console',       'CONSOLE_ENABLE'),
        ('tap_dance',     'TAP_DANCE_ENABLE'),
        ('combo',         'COMBO_ENABLE'),
        ('audio',         'AUDIO_ENABLE'),
        ('pointing_device','POINTING_DEVICE_ENABLE'),
    ]
    for feat_id, rules_key in feature_map:
        if features.get(feat_id):
            lines.append(f'{rules_key} = yes')

    lines.append('')

    # Per-feature config variables (go in rules.mk not config.h)
    ws2812_driver_emitted = False

    if features.get('rgb_matrix'):
        rgb = fc.get('rgb_matrix', {})
        driver = rgb.get('RGB_MATRIX_DRIVER', 'WS2812')
        lines.append(f'RGB_MATRIX_DRIVER = {driver.lower()}')
        if driver.upper() == 'IS31FL3731' and arch == 'chibios':
            lines.append('CFLAGS += -Wno-error=unused-but-set-variable')
        if driver.upper() == 'WS2812' and mcu == 'rp2040':
            lines.append('WS2812_DRIVER = vendor')
            ws2812_driver_emitted = True
        lines.append('')

    if features.get('rgblight') and mcu == 'rp2040' and not ws2812_driver_emitted:
        lines.append('WS2812_DRIVER = vendor')
        lines.append('')

    if features.get('backlight'):
        bl = fc.get('backlight', {})
        levels = bl.get('BACKLIGHT_LEVELS', '3')
        breathing = bl.get('BACKLIGHT_BREATHING', 'no')
        lines.append(f'BACKLIGHT_LEVELS = {levels}')
        lines.append(f'BACKLIGHT_BREATHING = {breathing}')
        lines.append('')

    if features.get('split_keyboard'):
        sp = fc.get('split_keyboard', {})
        transport = sp.get('SPLIT_TRANSPORT', 'serial')
        lines.append(f'SPLIT_TRANSPORT = {transport}')
        serial_driver = sp.get('SERIAL_DRIVER')
        if serial_driver:
            lines.append(f'SERIAL_DRIVER = {serial_driver}')
        elif mcu == 'mk20dx256':
            lines.append('SERIAL_DRIVER = usart')
        for key in ('SPLIT_USB_DETECT', 'SPLIT_TRANSPORT_MIRROR',
                    'SPLIT_LAYER_STATE_ENABLE', 'SPLIT_RGB_MATRIX_ENABLE'):
            val = sp.get(key)
            if val:
                lines.append(f'{key} = {val}')
        lines.append('')

    if features.get('pointing_device'):
        pd = fc.get('pointing_device', {})
        driver = pd.get('POINTING_DEVICE_DRIVER', 'pmw3360')
        lines.append(f'POINTING_DEVICE_DRIVER = {driver}')
        lines.append('')

    if features.get('encoder'):
        enc = fc.get('encoder', {})
        resolution = enc.get('ENCODER_RESOLUTION', '4')
        lines.append('ENCODER_MAP_ENABLE = yes')
        lines.append(f'ENCODER_RESOLUTION = {resolution}')
        lines.append('')

    if features.get('oled'):
        oleds = config.oleds or []
        all_blocks = [b for o in oleds for b in (o.startup_blocks + o.active_blocks + o.idle_blocks)]
        if 'wpm' in all_blocks:
            lines.append('WPM_ENABLE = yes')
            lines.append('')

    if features.get('audio'):
        aud = fc.get('audio', {})
        driver = aud.get('AUDIO_DRIVER')
        if driver:
            lines.append(f'AUDIO_DRIVER = {driver}')
        clicky = aud.get('AUDIO_CLICKY', 'no')
        lines.append(f'AUDIO_CLICKY = {clicky}')
        lines.append('')

    if features.get('mousekeys'):
        mk = fc.get('mousekeys', {})
        for key in ('MOUSEKEY_DELAY', 'MOUSEKEY_INTERVAL', 'MOUSEKEY_MAX_SPEED'):
            val = mk.get(key)
            if val:
                lines.append(f'{key} = {val}')
        lines.append('')

    if features.get('tap_dance'):
        td = fc.get('tap_dance', {})
        term = td.get('TAPPING_TERM', '200')
        lines.append(f'TAPPING_TERM = {term}')
        lines.append('')

    if features.get('combo'):
        cb = fc.get('combo', {})
        term = cb.get('COMBO_TERM', '65')
        lines.append(f'COMBO_TERM = {term}')
        lines.append('')

    return '\n'.join(lines).rstrip() + '\n'
