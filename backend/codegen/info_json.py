from __future__ import annotations

import json
import re

from models import KeyboardConfig
from codegen._matrix import matrix_keys, matrix_rows, matrix_cols, resolve_rgb_led_count
from codegen._mcu import MCU_BOOTLOADER, MCU_QMK_NAME

# QMK's matrix_pins JSON schema only accepts standard MCU pin names.
# GPIO expander aliases (e.g. MCP_A0) are C macros and must live in
# config.h only — including them in keyboard.json causes a fatal schema
# rejection that prevents the entire file from being loaded.
_JSON_SAFE_PIN = re.compile(
    r'^[A-Z][0-9]+$'           # AVR style: B6, C5
    r'|^GPIO[A-Z0-9_]+$'       # ChibiOS: GPIOB_PIN6
    r'|^GP[0-9]+$'             # RP2040: GP25
    r'|^PAL_LINE\(.+\)$'       # ChibiOS PAL_LINE macro
)


def _pins_json_safe(pins: list[str]) -> bool:
    return all(_JSON_SAFE_PIN.match(p) for p in pins if p.strip())


# Features safe to emit in the QMK keyboard.json features block.
# Driver-level and unsupported features (led_matrix, st7565, sleep_led, etc.)
# cause QMK's data validation to crash when present here.
_SAFE_INFO_FEATURES = frozenset({
    'audio', 'backlight', 'bootmagic', 'combo', 'console', 'encoder',
    'extrakeys', 'mousekeys', 'nkro', 'oled', 'pointing_device',
    'rgb_matrix', 'rgblight', 'split_keyboard', 'tap_dance',
})


def generate_info_json(config: KeyboardConfig) -> str:
    rows = matrix_rows(config)
    cols = matrix_cols(config)
    keys = matrix_keys(config)
    mcu = (config.mcu or 'atmega32u4').lower()
    features = config.features or {}
    fc = config.feature_configs or {}

    enabled_features = [k for k, v in features.items() if v and k in _SAFE_INFO_FEATURES]

    info: dict = {
        'keyboard_name': config.name or 'Custom Keyboard',
        'manufacturer': config.manufacturer or '',
        'url': '',
        'maintainer': 'qmk',
        'usb': {
            'vid': config.usb_vid or '0xFEED',
            'pid': config.usb_pid or '0x0000',
            'device_version': '0.0.1',
        },
        'processor': MCU_QMK_NAME.get(mcu, config.mcu or 'atmega32u4'),
        'bootloader': MCU_BOOTLOADER.get(mcu, 'atmel-dfu'),
        'debounce': 5,
        'features': {feat: True for feat in enabled_features},
        # matrix_pins omitted here if any pin is a C-macro alias (e.g. MCP_A0);
        # config.h is the authoritative source in that case.
        **(
            {
                'matrix_pins': {
                    'rows': [p.pin for p in sorted(config.row_pins, key=lambda p: p.row) if p.pin.strip()],
                    'cols': [p.pin for p in sorted(config.col_pins, key=lambda p: p.col) if p.pin.strip()],
                }
            }
            if _pins_json_safe([p.pin for p in config.row_pins + config.col_pins])
            else {}
        ),
        'diode_direction': 'COL2ROW',
        'layouts': {
            (config.layout_macro or 'LAYOUT'): {
                'layout': [
                    {
                        'matrix': [k.row if k.row is not None else 0,
                                   k.col if k.col is not None else 0],
                        'x': round(k.x, 4),
                        'y': round(k.y, 4),
                        **({'w': round(k.w, 4)} if k.w != 1.0 else {}),
                        **({'h': round(k.h, 4)} if k.h != 1.0 else {}),
                        **({'label': k.label} if k.label else {}),
                    }
                    for k in keys
                ],
            },
        },
    }

    if rows:
        info['matrix_size'] = {'rows': rows, 'cols': cols}

    # Split block
    if features.get('split_keyboard'):
        sp = fc.get('split_keyboard', {})
        serial_pin = sp.get('SOFT_SERIAL_PIN', config.soft_serial_pin or 'D2')
        info['split'] = {
            'enabled': True,
            'soft_serial_pin': serial_pin,
        }

    # Encoder block
    if config.encoders and features.get('encoder'):
        enc = fc.get('encoder', {})
        count = len(config.encoders)
        rotary = []
        try:
            resolution = int(enc.get('ENCODER_RESOLUTION', '4'))
        except ValueError:
            resolution = 4
        for i in range(count):
            entry: dict = {'resolution': resolution}
            pin_a = enc.get(f'ENCODER_PAD_A_{i}', '')
            pin_b = enc.get(f'ENCODER_PAD_B_{i}', '')
            if pin_a:
                entry['pin_a'] = pin_a
            if pin_b:
                entry['pin_b'] = pin_b
            rotary.append(entry)
        if rotary:
            info['encoder'] = {'rotary': rotary}

    # RGB matrix block
    if features.get('rgb_matrix'):
        rgb = fc.get('rgb_matrix', {})
        driver = rgb.get('RGB_MATRIX_DRIVER', 'WS2812').lower()
        led_keys = [k for k in config.keys if k.led_index is not None]
        led_count = resolve_rgb_led_count(config)

        rgb_block: dict = {}
        if driver:
            rgb_block['driver'] = driver
        if led_count:
            rgb_block['led_count'] = led_count

        if led_keys:
            # QMK schema requires integers (0-224 for x, 0-64 for y).
            # Normalize from key-unit floats to the QMK range.
            max_x = max((k.x for k in led_keys), default=1.0) or 1.0
            max_y = max((k.y for k in led_keys), default=1.0) or 1.0
            rgb_block['layout'] = [
                {
                    'matrix': [k.row if k.row is not None else 0,
                                k.col if k.col is not None else 0],
                    'x': round(k.x / max_x * 224),
                    'y': round(k.y / max_y * 64),
                    'flags': 4,
                }
                for k in sorted(led_keys, key=lambda k: k.led_index)  # type: ignore[arg-type]
            ]

        if rgb_block:
            info['rgb_matrix'] = rgb_block

    return json.dumps(info, indent=2)
