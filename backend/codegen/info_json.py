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

    enabled_features = [k for k, v in (config.features or {}).items() if v]

    info: dict = {
        'keyboard_name': config.name or 'Custom Keyboard',
        'manufacturer': config.manufacturer or '',
        'usb': {
            'vid': config.usb_vid or '0xFEED',
            'pid': config.usb_pid or '0x0000',
            'device_version': '0.0.1',
        },
        'processor': MCU_QMK_NAME.get(mcu, config.mcu or 'atmega32u4'),
        'bootloader': MCU_BOOTLOADER.get(mcu, 'atmel-dfu'),
        'features': {feat: True for feat in enabled_features},
        'matrix_pins': {
            'rows': [p.pin for p in sorted(config.row_pins, key=lambda p: p.row)],
            'cols': [p.pin for p in sorted(config.col_pins, key=lambda p: p.col)],
        },
        'diode_direction': 'COL2ROW',
        'layouts': {
            'LAYOUT': {
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

    return json.dumps(info, indent=2)
