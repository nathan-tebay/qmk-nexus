from __future__ import annotations

import json

from models import KeyboardConfig
from codegen._matrix import matrix_keys, matrix_rows, matrix_cols
from codegen._mcu import MCU_BOOTLOADER, MCU_QMK_NAME


def generate_info_json(config: KeyboardConfig) -> str:
    rows = matrix_rows(config)
    cols = matrix_cols(config)
    keys = matrix_keys(config)
    mcu = (config.mcu or 'atmega32u4').lower()
    features = config.features or {}
    fc = config.feature_configs or {}

    enabled_features = [k for k, v in features.items() if v]

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
        'matrix_pins': {
            'rows': [p.pin for p in sorted(config.row_pins, key=lambda p: p.row)],
            'cols': [p.pin for p in sorted(config.col_pins, key=lambda p: p.col)],
        },
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
    if config.encoders and features.get('encoder_map'):
        enc = fc.get('encoder_map', fc.get('encoder', {}))
        count = len(config.encoders)
        rotary = []
        for i in range(count):
            entry: dict = {'resolution': 4}
            pin_a = enc.get(f'ENCODER_PIN_A_{i}', '')
            pin_b = enc.get(f'ENCODER_PIN_B_{i}', '')
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
        led_count_explicit = rgb.get('RGB_MATRIX_LED_COUNT')
        if led_count_explicit:
            try:
                led_count = int(led_count_explicit)
            except ValueError:
                led_count = len(led_keys) or len([k for k in config.keys if k.row is not None])
        else:
            led_count = len(led_keys) or len([k for k in config.keys if k.row is not None])

        rgb_block: dict = {}
        if driver:
            rgb_block['driver'] = driver
        if led_count:
            rgb_block['led_count'] = led_count

        if led_keys:
            rgb_block['layout'] = [
                {
                    'matrix': [k.row if k.row is not None else 0,
                                k.col if k.col is not None else 0],
                    'x': round(k.x, 4),
                    'y': round(k.y, 4),
                    'flags': 4,
                }
                for k in sorted(led_keys, key=lambda k: k.led_index)  # type: ignore[arg-type]
            ]

        if rgb_block:
            info['rgb_matrix'] = rgb_block

    return json.dumps(info, indent=2)
