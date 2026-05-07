import json
import logging
import re
import uuid
from collections import defaultdict
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from codegen.keycodes import TRIVIAL_KEYCODES, normalize_keycode
from codegen._mcu import MCU_ARCH
from models import ColPin, EncoderElement, KeyDef, KeyboardConfig, Layer, MatrixEdge, MatrixPin, OledElement, TrackballElement
from utils import jsonable_out
from validation import canonical_feature_id, sanitize_keyboard_config

logger = logging.getLogger('qmk-nexus.qmk')

router = APIRouter(prefix='/qmk', tags=['qmk'])

_INDEX_PATH = Path(__file__).parent.parent / 'data' / 'qmk_index.json'
_KB_DATA_DIR = Path(__file__).parent.parent / 'data' / 'keyboards'
_KB_DATA_DIR_RESOLVED = _KB_DATA_DIR.resolve()
_META_PATH = Path(__file__).parent.parent / 'data' / 'qmk_meta.json'


def _safe_kb_file(kb_path: str) -> Path:
    """Resolve ``kb_path`` under ``_KB_DATA_DIR`` and reject any escape attempts."""
    if not kb_path or kb_path.startswith('/') or '\x00' in kb_path:
        raise HTTPException(status_code=400, detail='Invalid keyboard path')
    candidate = (_KB_DATA_DIR / (kb_path + '.json')).resolve()
    try:
        candidate.relative_to(_KB_DATA_DIR_RESOLVED)
    except ValueError:
        raise HTTPException(status_code=400, detail='Invalid keyboard path')
    return candidate
_DEFINE_ARRAY_RE = re.compile(r'#\s*define\s+([A-Z0-9_]+)\s+\{([^}]+)\}')
_DEFINE_VALUE_RE = re.compile(r'#\s*define\s+([A-Z0-9_]+)\s+([^\s/]+)')
_ROW_CASE_PIN_RE = re.compile(
    r'case\s+(\d+)\s*:(?P<body>.*?break\s*;)',
    re.DOTALL,
)
_GPIO_PIN_RE = re.compile(r'gpio_(?:set_pin_output|write_pin_low)\(\s*([A-Z]\d+)\s*\)')
_PIN_READ_COL_RE = re.compile(
    r'PIN([A-Z])\s*&\s*\(\s*1\s*<<\s*P[A-Z](\d+)\s*\).*?'
    r'\(\s*1\s*<<\s*\(?\s*(\d+)(?:\s*\+\s*(\d+))?\s*\)?\s*\)',
    re.DOTALL,
)
_GPIO_READ_PIN_RE = re.compile(r'gpio_read_pin\(\s*([A-Z]\d+)\s*\)')
_MCP_GPIO_READ_RE = re.compile(r'\w+_read\(\s*([A-Z0-9_]*GPIO([AB]))\s*,')
_MCP_IODIR_WRITE_RE = re.compile(r'\w+_write\(\s*([A-Z0-9_]*IODIR([AB]))\s*,\s*(0x[0-9A-Fa-f]+|\d+)\s*\)')
_MCP23018_READ_PINS_RE = re.compile(
    r'mcp23018_read_pins\s*\([^;]*?\bmcp23018_PORT([AB])\b[^;]*?&\s*([A-Za-z_][A-Za-z0-9_]*)[^;]*?\)',
    re.DOTALL | re.IGNORECASE,
)


@lru_cache(maxsize=1)
def _load_index() -> list[dict[str, Any]]:
    """Load QMK keyboard index from disk. Cached indefinitely; restart to refresh."""
    if not _INDEX_PATH.exists():
        logger.warning('QMK index not found at %s', _INDEX_PATH)
        return []
    with open(_INDEX_PATH) as f:
        data = json.load(f)
    logger.info('QMK index loaded: %d keyboards', len(data))
    return data


@lru_cache(maxsize=1)
def _load_meta() -> dict:
    """Load QMK metadata (e.g. qmk_commit). Cached indefinitely; restart to refresh."""
    if not _META_PATH.exists():
        return {}
    with open(_META_PATH) as f:
        return json.load(f)


@router.get('/meta')
def get_qmk_meta() -> dict:
    return _load_meta()


@router.get('/search')
def search_keyboards(q: str = Query('', max_length=100)) -> list[dict[str, Any]]:
    index = _load_index()
    if not q.strip():
        return index[:100]

    q_lower = q.lower()
    results = [
        entry for entry in index
        if q_lower in entry.get('name', '').lower()
        or q_lower in entry.get('manufacturer', '').lower()
        or q_lower in entry.get('path', '').lower()
    ]
    return results[:100]


def _nanoid() -> str:
    return uuid.uuid4().hex[:10]


def _yes_no(value: Any) -> str:
    return 'yes' if bool(value) else 'no'


def _feature_configs_from_info(info: dict[str, Any], *, split_enabled: bool = False) -> dict[str, dict[str, str]]:
    feature_configs: dict[str, dict[str, str]] = {}
    features = info.get('features') or {}
    ws2812 = info.get('ws2812') or {}
    native_config_text = _native_config_text(info)

    split = info.get('split') or {}
    if split.get('enabled') or split_enabled:
        split_config: dict[str, str] = {}
        serial_pin = (split.get('serial') or {}).get('pin')
        if serial_pin:
            split_config['SOFT_SERIAL_PIN'] = str(serial_pin)
        serial_driver = (split.get('serial') or {}).get('driver')
        if serial_driver:
            split_config['SERIAL_DRIVER'] = str(serial_driver)
        transport = (split.get('transport') or {}).get('protocol')
        if transport:
            split_config['SPLIT_TRANSPORT'] = str(transport)
        sync = (split.get('transport') or {}).get('sync') or {}
        if sync.get('layer_state'):
            split_config['SPLIT_LAYER_STATE_ENABLE'] = 'yes'
        if sync.get('modifiers') or sync.get('matrix_state'):
            split_config['SPLIT_TRANSPORT_MIRROR'] = 'yes'
        feature_configs['split_keyboard'] = split_config

    mousekey = info.get('mousekey') or {}
    mousekey_config: dict[str, str] = {}
    for qmk_key, nexus_key in (
        ('delay', 'MOUSEKEY_DELAY'),
        ('interval', 'MOUSEKEY_INTERVAL'),
        ('max_speed', 'MOUSEKEY_MAX_SPEED'),
    ):
        if qmk_key in mousekey:
            mousekey_config[nexus_key] = str(mousekey[qmk_key])
    if mousekey_config:
        feature_configs['mousekeys'] = mousekey_config

    rgb_matrix = info.get('rgb_matrix') or info.get('led_matrix') or {}
    if rgb_matrix:
        rgb_config: dict[str, str] = {}
        driver = rgb_matrix.get('driver')
        if driver:
            rgb_config['RGB_MATRIX_DRIVER'] = str(driver).upper()
        layout = rgb_matrix.get('layout') or []
        if layout:
            rgb_config['RGB_MATRIX_LED_COUNT'] = str(len(layout))
        if 'max_brightness' in rgb_matrix:
            rgb_config['RGB_MATRIX_MAXIMUM_BRIGHTNESS'] = str(rgb_matrix['max_brightness'])
        if 'sleep' in rgb_matrix:
            rgb_config['RGB_MATRIX_SLEEP'] = _yes_no(rgb_matrix['sleep'])
        if ws2812.get('pin'):
            rgb_config['RGB_MATRIX_PIN'] = str(ws2812['pin'])
        native_defines = _defines_from_native_config(info, native_config_text)
        for key in ('RGB_MATRIX_I2C_SDA', 'RGB_MATRIX_I2C_SCL'):
            if key in native_defines:
                rgb_config[key] = native_defines[key]
        if rgb_config:
            feature_configs['rgb_matrix'] = rgb_config

    rgblight = info.get('rgblight') or {}
    if rgblight:
        rgblight_config: dict[str, str] = {}
        if 'led_count' in rgblight:
            rgblight_config['RGBLIGHT_LED_COUNT'] = str(rgblight['led_count'])
        if 'max_brightness' in rgblight:
            rgblight_config['RGBLIGHT_LIMIT_VAL'] = str(rgblight['max_brightness'])
        if ws2812.get('pin'):
            rgblight_config['RGBLIGHT_PIN'] = str(ws2812['pin'])
        if rgblight_config:
            feature_configs['rgblight'] = rgblight_config

    encoder = info.get('encoder') or {}
    rotary = encoder.get('rotary') or []
    if rotary:
        encoder_config: dict[str, str] = {'ENCODER_COUNT': str(len(rotary))}
        for i, entry in enumerate(rotary):
            if entry.get('pin_a'):
                encoder_config[f'ENCODER_PAD_A_{i}'] = str(entry['pin_a'])
            if entry.get('pin_b'):
                encoder_config[f'ENCODER_PAD_B_{i}'] = str(entry['pin_b'])
        feature_configs['encoder'] = encoder_config

    if features.get('oled') or features.get('st7565') or info.get('oled') or info.get('st7565'):
        count = 2 if split_enabled else 1
        display_size = '128_64' if features.get('wide_oled') else '128_32'
        driver = _oled_driver(info)
        oled_config: dict[str, str] = {'OLED_COUNT': str(count)}
        for i in range(count):
            oled_config[f'OLED_DRIVER_{i}'] = driver
            oled_config[f'OLED_DISPLAY_SIZE_{i}'] = display_size
        feature_configs['oled'] = oled_config

    if features.get('pointing_device') or info.get('pointing_device'):
        feature_configs['pointing_device'] = {
            'POINTING_DEVICE_DRIVER': _pointing_driver_from_info('', info),
        }

    audio = info.get('audio') or {}
    if features.get('audio') or audio:
        audio_config: dict[str, str] = {}
        if audio.get('driver'):
            audio_config['AUDIO_DRIVER'] = str(audio['driver'])
        if audio.get('pin'):
            audio_config['AUDIO_PIN'] = str(audio['pin'])
        if audio_config:
            feature_configs['audio'] = audio_config

    return feature_configs


def _bounds(keys: list[KeyDef]) -> tuple[float, float, float, float]:
    if not keys:
        return 0.0, 0.0, 0.0, 0.0
    min_x = min(key.x for key in keys)
    min_y = min(key.y for key in keys)
    max_x = max(key.x + key.w for key in keys)
    max_y = max(key.y + key.h for key in keys)
    return min_x, min_y, max_x, max_y


def _oled_display_size(info: dict[str, Any]) -> str:
    features = info.get('features') or {}
    return '128_64' if features.get('wide_oled') else '128_32'


def _oled_driver(info: dict[str, Any]) -> str:
    features = info.get('features') or {}
    return 'ST7567' if features.get('st7565') or info.get('st7565') else 'SSD1306'


def _oled_blocks(index: int, *, split_enabled: bool = False, include_wpm: bool = True) -> list[str]:
    if split_enabled and index > 0:
        return ['master_slave']
    return ['layer_name', 'wpm'] if include_wpm else ['layer_name']


def _oleds_from_info(info: dict[str, Any], keys: list[KeyDef], *, split_enabled: bool = False) -> list[OledElement]:
    features = info.get('features') or {}
    if not (features.get('oled') or features.get('st7565') or info.get('oled') or info.get('st7565')):
        return []

    processor = str(info.get('processor', info.get('processor_type', ''))).lower()
    include_wpm = not (processor.startswith('atmega') and features.get('audio'))
    min_x, min_y, max_x, _max_y = _bounds(keys)
    y = max(0.0, min_y - 1.25)
    display_size = _oled_display_size(info)

    if split_enabled:
        center_x = (min_x + max_x) / 2
        left_keys = [key for key in keys if key.x + key.w / 2 <= center_x]
        right_keys = [key for key in keys if key.x + key.w / 2 > center_x]
        left_center = (
            (min(key.x for key in left_keys) + max(key.x + key.w for key in left_keys)) / 2
            if left_keys else min_x + 1.5
        )
        right_center = (
            (min(key.x for key in right_keys) + max(key.x + key.w for key in right_keys)) / 2
            if right_keys else max_x - 1.5
        )
        return [
            OledElement(id=_nanoid(), x=max(0.0, left_center - 1.0), y=y, display_size=display_size, active_blocks=_oled_blocks(0, split_enabled=True, include_wpm=include_wpm)),
            OledElement(id=_nanoid(), x=max(0.0, right_center - 1.0), y=y, display_size=display_size, active_blocks=_oled_blocks(1, split_enabled=True, include_wpm=include_wpm)),
        ]

    return [OledElement(id=_nanoid(), x=max_x + 1.0, y=min_y, display_size=display_size, active_blocks=_oled_blocks(0, include_wpm=include_wpm))]


def _pointing_driver_from_info(kb_path: str, info: dict[str, Any]) -> str:
    text = ' '.join([
        kb_path,
        str(info.get('keyboard_name', '')),
        str(info.get('tags', '')),
        json.dumps(info.get('pointing_device') or {}),
    ]).lower()
    if 'cirque' in text:
        return 'cirque_pinnacle_spi'
    if 'pmw3389' in text:
        return 'pmw3389'
    if 'adns9800' in text:
        return 'adns9800'
    if 'pimoroni' in text:
        return 'pimoroni_trackball'
    return 'pmw3360'


def _trackballs_from_info(kb_path: str, info: dict[str, Any], keys: list[KeyDef]) -> list[TrackballElement]:
    features = info.get('features') or {}
    if not (features.get('pointing_device') or info.get('pointing_device')):
        return []

    text = f'{kb_path} {info.get("keyboard_name", "")}'.lower()
    count = 2 if 'dual' in text else 1
    driver = _pointing_driver_from_info(kb_path, info)
    min_x, min_y, max_x, max_y = _bounds(keys)
    y = min_y + max(0.0, (max_y - min_y - 2.0) / 2)

    if count == 2:
        center_x = (min_x + max_x) / 2
        return [
            TrackballElement(id=_nanoid(), x=max(0.0, center_x - 3.0), y=y, driver=driver),
            TrackballElement(id=_nanoid(), x=center_x + 1.0, y=y, driver=driver),
        ]

    return [TrackballElement(id=_nanoid(), x=max_x + 1.0, y=y, driver=driver)]


_LABEL_TO_KEYCODE: dict[str, str] = {
    'Esc': 'KC_ESC', 'Escape': 'KC_ESC',
    '1': 'KC_1', '2': 'KC_2', '3': 'KC_3', '4': 'KC_4', '5': 'KC_5',
    '6': 'KC_6', '7': 'KC_7', '8': 'KC_8', '9': 'KC_9', '0': 'KC_0',
    '-': 'KC_MINS', '=': 'KC_EQL',
    'Backspace': 'KC_BSPC', 'Delete': 'KC_DEL',
    'Tab': 'KC_TAB',
    '[': 'KC_LBRC', ']': 'KC_RBRC', '\\': 'KC_BSLS',
    'Caps Lock': 'KC_CAPS', 'Caps': 'KC_CAPS',
    ';': 'KC_SCLN', "'": 'KC_QUOT', 'Enter': 'KC_ENT',
    'Shift': 'KC_LSFT', 'Left Shift': 'KC_LSFT', 'Right Shift': 'KC_RSFT',
    ',': 'KC_COMM', '.': 'KC_DOT', '/': 'KC_SLSH', '`': 'KC_GRV',
    'Ctrl': 'KC_LCTL', 'Left Ctrl': 'KC_LCTL', 'Right Ctrl': 'KC_RCTL',
    'Alt': 'KC_LALT', 'Left Alt': 'KC_LALT', 'Right Alt': 'KC_RALT',
    'Win': 'KC_LGUI', 'GUI': 'KC_LGUI', 'Left GUI': 'KC_LGUI', 'Right GUI': 'KC_RGUI',
    'Space': 'KC_SPC',
    'F1': 'KC_F1', 'F2': 'KC_F2', 'F3': 'KC_F3', 'F4': 'KC_F4',
    'F5': 'KC_F5', 'F6': 'KC_F6', 'F7': 'KC_F7', 'F8': 'KC_F8',
    'F9': 'KC_F9', 'F10': 'KC_F10', 'F11': 'KC_F11', 'F12': 'KC_F12',
    'Print Screen': 'KC_PSCR', 'PrtSc': 'KC_PSCR',
    'Scroll Lock': 'KC_SCRL', 'ScrLk': 'KC_SCRL',
    'Pause': 'KC_PAUS', 'Break': 'KC_PAUS',
    'Insert': 'KC_INS', 'Home': 'KC_HOME',
    'Page Up': 'KC_PGUP', 'PgUp': 'KC_PGUP',
    'Page Down': 'KC_PGDN', 'PgDn': 'KC_PGDN',
    'End': 'KC_END',
    'Up': 'KC_UP', 'Down': 'KC_DOWN', 'Left': 'KC_LEFT', 'Right': 'KC_RGHT',
    'Num Lock': 'KC_NUM', 'NumLk': 'KC_NUM',
}


def _keycode_from_label(label: str) -> str:
    if not label:
        return ''
    kc = _LABEL_TO_KEYCODE.get(label)
    if kc is not None:
        return kc
    up = label.upper()
    if len(label) == 1 and label.isalpha():
        return f'KC_{up}'
    if len(label) == 1 and label.isdigit():
        return f'KC_{label}'
    return ''


def _normalize_imported_encoder_keycode(value: Any) -> str | None:
    text = normalize_keycode(str(value or '').strip())
    if not text or text == '_______' or text in TRIVIAL_KEYCODES:
        return None
    return text


def _encoder_keycodes_from_default_keymap(
    raw_keymap: Any,
    layers: list[Layer],
    encoders: list[EncoderElement],
) -> dict[str, str]:
    if not isinstance(raw_keymap, dict) or not encoders:
        return {}

    raw_layers = raw_keymap.get('encoders')
    if not isinstance(raw_layers, list):
        return {}

    result: dict[str, str] = {}
    for layer_index, raw_encoders in enumerate(raw_layers):
        if layer_index >= len(layers) or not isinstance(raw_encoders, list):
            continue
        layer = layers[layer_index]
        for encoder_index, raw_binding in enumerate(raw_encoders):
            if encoder_index >= len(encoders) or not isinstance(raw_binding, dict):
                continue
            encoder = encoders[encoder_index]
            ccw = _normalize_imported_encoder_keycode(raw_binding.get('ccw'))
            cw = _normalize_imported_encoder_keycode(raw_binding.get('cw'))
            if ccw:
                result[f'{layer.id}:{encoder.id}:ccw'] = ccw
            if cw:
                result[f'{layer.id}:{encoder.id}:cw'] = cw
    return result


def _encoder_count_from_default_keymap(raw_keymap: Any) -> int:
    if not isinstance(raw_keymap, dict):
        return 0
    raw_layers = raw_keymap.get('encoders')
    if not isinstance(raw_layers, list):
        return 0
    return max((len(layer) for layer in raw_layers if isinstance(layer, list)), default=0)


def _supports_generated_audio(processor: Any) -> bool:
    mcu = str(processor or 'atmega32u4').lower()
    return MCU_ARCH.get(mcu, ('avr', '16000000'))[0] == 'avr'


def _encoders_from_info(info: dict[str, Any], keys: list[KeyDef], *, min_count: int = 0) -> list[EncoderElement]:
    rotary = (info.get('encoder') or {}).get('rotary') or []
    count = max(len(rotary), min_count)
    if count <= 0:
        return []
    max_x = max((key.x + key.w for key in keys), default=0)
    min_y = min((key.y for key in keys), default=0)
    return [
        EncoderElement(id=_nanoid(), x=max_x + 1.0, y=min_y + i * 1.25, has_switch=False)
        for i in range(count)
    ]


def _layers_from_default_keymap(raw_keymap: Any, keys: list[KeyDef]) -> list[Layer]:
    if not (isinstance(raw_keymap, dict) and raw_keymap.get('layers')):
        # Fall back to layout labels when no default keymap is available.
        keycodes = {
            key.id: kc
            for key in keys
            if (kc := _keycode_from_label(key.label)) and kc not in TRIVIAL_KEYCODES
        }
        return [Layer(id='layer0', name='Base', keycodes=keycodes)]

    layers: list[Layer] = []
    for i, codes in enumerate(raw_keymap['layers']):
        normalized_codes = [normalize_keycode(str(code)) for code in codes]
        keycodes = {
            keys[j].id: code
            for j, code in enumerate(normalized_codes)
            if j < len(keys) and code not in TRIVIAL_KEYCODES
        }
        layers.append(Layer(
            id=f'layer{i}',
            name='Base' if i == 0 else f'Layer {i}',
            keycodes=keycodes,
        ))
    return layers or [Layer(id='layer0', name='Base', keycodes={})]


def _merge_peripheral_feature_configs(
    info: dict[str, Any],
    features: dict[str, bool],
    feature_configs: dict[str, dict[str, str]],
    encoders: list[EncoderElement],
    oleds: list[OledElement],
    trackballs: list[TrackballElement],
) -> None:
    if encoders:
        features['encoder'] = True
        encoder_config = dict(feature_configs.get('encoder') or {})
        encoder_config['ENCODER_COUNT'] = str(len(encoders))
        feature_configs['encoder'] = encoder_config
    if oleds:
        features['oled'] = True
        oled_config = dict(feature_configs.get('oled') or {})
        oled_config['OLED_COUNT'] = str(len(oleds))
        for i, oled in enumerate(oleds):
            oled_config[f'OLED_DRIVER_{i}'] = _oled_driver(info)
            oled_config[f'OLED_DISPLAY_SIZE_{i}'] = oled.display_size
        feature_configs['oled'] = oled_config
    if trackballs:
        features['pointing_device'] = True
        pointing_config = dict(feature_configs.get('pointing_device') or {})
        pointing_config['POINTING_DEVICE_DRIVER'] = trackballs[0].driver
        feature_configs['pointing_device'] = pointing_config


def _apply_led_indices(info: dict[str, Any], keys: list[KeyDef]) -> list[KeyDef]:
    rgb_matrix = info.get('rgb_matrix') or info.get('led_matrix') or {}
    led_layout = rgb_matrix.get('layout') or []
    if not led_layout:
        return keys

    led_by_matrix: dict[tuple[int, int], int] = {}
    for index, led in enumerate(led_layout):
        matrix = led.get('matrix')
        if (
            isinstance(matrix, list)
            and len(matrix) >= 2
            and isinstance(matrix[0], int)
            and isinstance(matrix[1], int)
        ):
            led_by_matrix.setdefault((matrix[0], matrix[1]), index)

    return [
        key.model_copy(update={'led_index': led_by_matrix.get((key.row, key.col))})
        if key.row is not None and key.col is not None and (key.row, key.col) in led_by_matrix
        else key
        for key in keys
    ]


def _define_arrays_from_native_config(info: dict[str, Any], config_text: str | None = None) -> dict[str, list[str]]:
    config_text = _native_config_text(info) if config_text is None else config_text
    arrays: dict[str, list[str]] = {}
    for name, body in _DEFINE_ARRAY_RE.findall(config_text):
        arrays[name] = [token.strip() for token in body.split(',')]
    return arrays


def _defines_from_native_config(info: dict[str, Any], config_text: str | None = None) -> dict[str, str]:
    defines: dict[str, str] = {}
    config_text = _native_config_text(info) if config_text is None else config_text
    for name, value in _DEFINE_VALUE_RE.findall(config_text):
        defines[name] = value.strip()
    return defines


def _native_config_text(info: dict[str, Any]) -> str:
    files = (info.get('_nexus') or {}).get('upstream_files') or {}
    config_text = ''
    for rel_path, content in files.items():
        if rel_path.endswith('/config.h') or rel_path == 'config.h':
            config_text += '\n' + str(content)
    return config_text


def _matrix_pins_from_info(info: dict[str, Any]) -> tuple[list[MatrixPin], list[ColPin]]:
    matrix_pins: dict[str, Any] = info.get('matrix_pins', {})
    direct_pins = matrix_pins.get('direct')
    if direct_pins:
        return _matrix_pins_from_direct(direct_pins)

    row_pins: list[MatrixPin] = [
        MatrixPin(row=i, pin=str(pin))
        for i, pin in enumerate(matrix_pins.get('rows', []))
        if pin is not None
    ]
    col_pins: list[ColPin] = [
        ColPin(col=i, pin=str(pin))
        for i, pin in enumerate(matrix_pins.get('cols', []))
        if pin is not None
    ]
    if row_pins or col_pins:
        return row_pins, col_pins

    native_config_text = _native_config_text(info)
    arrays = _define_arrays_from_native_config(info, native_config_text)
    onboard_rows = arrays.get('MATRIX_ONBOARD_ROW_PINS') or arrays.get('MATRIX_ROW_PINS') or []
    expander_rows = arrays.get('MATRIX_EXPANDER_ROW_PINS') or []
    if onboard_rows:
        for i, pin in enumerate(onboard_rows):
            if pin and pin != '0':
                row_pins.append(MatrixPin(row=i, pin=pin))
            elif i < len(expander_rows):
                row_pins.append(MatrixPin(row=i, pin=f'MCP_A{expander_rows[i]}'))

    onboard_cols = arrays.get('MATRIX_ONBOARD_COL_PINS') or arrays.get('MATRIX_COL_PINS') or []
    expander_cols = arrays.get('MATRIX_EXPANDER_COL_PINS') or []
    if onboard_cols:
        col_pins = [ColPin(col=i, pin=pin) for i, pin in enumerate(onboard_cols) if pin and pin != '0']
    elif expander_cols:
        col_pins = [ColPin(col=i, pin=f'MCP_B{pin}') for i, pin in enumerate(expander_cols)]

    if not row_pins and not col_pins:
        row_pins, col_pins = _matrix_pins_from_custom_sources(info)

    return row_pins, col_pins


def _matrix_pins_from_direct(direct_pins: Any) -> tuple[list[MatrixPin], list[ColPin]]:
    if not isinstance(direct_pins, list):
        return [], []

    row_pins: list[MatrixPin] = []
    col_pins: list[ColPin] = []
    for row_index, row in enumerate(direct_pins):
        if not isinstance(row, list):
            continue
        for col_index, pin in enumerate(row):
            if pin is None:
                continue
            pin_name = str(pin)
            if not pin_name.strip():
                continue
            if col_index == 0:
                row_pins.append(MatrixPin(row=row_index, pin=pin_name))
            else:
                col_pins.append(ColPin(col=col_index, pin=pin_name))
    return row_pins, col_pins


def _direct_pins_from_info(info: dict[str, Any]) -> list[list[str | None]]:
    direct_pins = (info.get('matrix_pins') or {}).get('direct')
    if not isinstance(direct_pins, list):
        return []

    result: list[list[str | None]] = []
    for row in direct_pins:
        if not isinstance(row, list):
            continue
        result.append([
            str(pin) if pin is not None and str(pin).strip() else None
            for pin in row
        ])
    return result


def _matrix_pins_from_custom_sources(info: dict[str, Any]) -> tuple[list[MatrixPin], list[ColPin]]:
    files = (info.get('_nexus') or {}).get('upstream_files') or {}
    source_text = '\n'.join(
        str(content)
        for rel_path, content in files.items()
        if rel_path.endswith(('.c', '.h'))
    )
    if not source_text:
        return [], []

    row_by_index: dict[int, str] = {}
    for match in _ROW_CASE_PIN_RE.finditer(source_text):
        row = int(match.group(1))
        pins = _GPIO_PIN_RE.findall(match.group('body'))
        if pins:
            row_by_index[row] = pins[0]

    col_by_index: dict[int, str] = {}
    for port, pin, base, offset in _PIN_READ_COL_RE.findall(source_text):
        col_by_index[int(base) + int(offset or 0)] = f'{port}{pin}'

    for gpio_register, bank in _MCP_GPIO_READ_RE.findall(source_text):
        mask = _mcp_input_mask(source_text, gpio_register.replace('GPIO', 'IODIR'))
        for bit in range(8):
            if mask & (1 << bit):
                col_by_index.setdefault(bit, f'MCP_{bank}{bit}')

    col_entries = [(col, pin) for col, pin in sorted(col_by_index.items())]
    if not col_entries:
        col_entries.extend(_gpio_read_col_entries(source_text))
    col_entries.extend(_mcp23018_wrapper_col_entries(source_text))

    row_pins = [MatrixPin(row=row, pin=pin) for row, pin in sorted(row_by_index.items())]
    col_pins = [ColPin(col=col, pin=pin) for col, pin in col_entries]
    return row_pins, col_pins


def _gpio_read_col_entries(source_text: str) -> list[tuple[int, str]]:
    entries: list[tuple[int, str]] = []
    seen: set[str] = set()
    for body in _column_read_bodies(source_text):
        for pin in _GPIO_READ_PIN_RE.findall(body):
            if pin in seen:
                continue
            seen.add(pin)
            entries.append((len(entries), pin))
    return entries


def _mcp23018_wrapper_col_entries(source_text: str) -> list[tuple[int, str]]:
    entries: list[tuple[int, str]] = []
    seen: set[tuple[int, str]] = set()
    for bank, variable in _MCP23018_READ_PINS_RE.findall(source_text):
        mask = _variable_input_mask(source_text, variable)
        if not mask:
            continue
        bank = bank.upper()
        for bit in range(8):
            if not (mask & (1 << bit)):
                continue
            entry = (bit, f'MCP_{bank}{bit}')
            if entry not in seen:
                seen.add(entry)
                entries.append(entry)
    return entries


def _column_read_bodies(source_text: str) -> list[str]:
    bodies: list[str] = []
    pattern = re.compile(r'\b\w*read\w*col\w*\s*\([^)]*\)\s*\{', re.IGNORECASE)
    for match in pattern.finditer(source_text):
        start = match.end()
        depth = 1
        i = start
        while i < len(source_text) and depth:
            if source_text[i] == '{':
                depth += 1
            elif source_text[i] == '}':
                depth -= 1
            i += 1
        if depth == 0:
            bodies.append(source_text[start:i - 1])
    return bodies or [source_text]


def _variable_input_mask(source_text: str, variable: str) -> int:
    match = re.search(rf'\b{re.escape(variable)}\b\s*&\s*(0b[01]+|0x[0-9A-Fa-f]+|\d+)', source_text)
    return int(match.group(1), 0) if match else 0


def _mcp_input_mask(source_text: str, iodir_register: str) -> int:
    for register, _bank, value in _MCP_IODIR_WRITE_RE.findall(source_text):
        if register == iodir_register:
            return int(value, 0)
    return 0


def _uses_custom_matrix(info: dict[str, Any]) -> bool:
    matrix_pins = info.get('matrix_pins') or {}
    return bool(
        matrix_pins.get('custom')
        or matrix_pins.get('custom_lite')
        or matrix_pins.get('direct')
    )


def _matrix_row_count(keys: list[KeyDef]) -> int:
    rows = [key.row for key in keys if key.row is not None]
    return max(rows) + 1 if rows else 0


def _split_physical_sides(group: list[KeyDef], split_enabled: bool) -> list[list[KeyDef]]:
    if not split_enabled or len(group) < 2:
        return [group]

    ordered = sorted(group, key=lambda key: key.x)
    min_x = min(key.x for key in ordered)
    max_x = max(key.x + key.w for key in ordered)
    center_x = (min_x + max_x) / 2
    split_candidates = [
        (
            abs(((ordered[i].x + ordered[i].w + ordered[i + 1].x) / 2) - center_x),
            i,
        )
        for i in range(len(ordered) - 1)
        if ordered[i + 1].x - (ordered[i].x + ordered[i].w) >= 1.5
    ]
    if not split_candidates:
        return [group]
    _distance_from_center, split_at = min(split_candidates)
    return [ordered[:split_at + 1], ordered[split_at + 1:]]


def _split_by_matrix_half(group: list[KeyDef], attr: str, extent: int, split_enabled: bool) -> list[list[KeyDef]]:
    if not split_enabled or extent < 2 or extent % 2 != 0:
        return [group]
    midpoint = extent // 2
    left = [key for key in group if getattr(key, attr) is not None and getattr(key, attr) < midpoint]
    right = [key for key in group if getattr(key, attr) is not None and getattr(key, attr) >= midpoint]
    if left and right:
        return [left, right]
    return [group]


def _matrix_edges_from_keys(keys: list[KeyDef], split_enabled: bool) -> list[MatrixEdge]:
    row_groups: dict[int, list[KeyDef]] = defaultdict(list)
    col_groups: dict[int, list[KeyDef]] = defaultdict(list)
    for key in keys:
        if key.row is not None:
            row_groups[key.row].append(key)
        if key.col is not None:
            col_groups[key.col].append(key)

    row_count = _matrix_row_count(keys)
    matrix_edges: list[MatrixEdge] = []
    for group in row_groups.values():
        for segment in _split_physical_sides(group, split_enabled):
            ordered = sorted(segment, key=lambda key: (key.x, key.y))
            for i in range(len(ordered) - 1):
                matrix_edges.append(MatrixEdge(from_=ordered[i].id, to=ordered[i + 1].id, type='row'))
    for group in col_groups.values():
        for matrix_segment in _split_by_matrix_half(group, 'row', row_count, split_enabled):
            for segment in _split_physical_sides(matrix_segment, split_enabled):
                ordered = sorted(segment, key=lambda key: (key.y, key.x))
                for i in range(len(ordered) - 1):
                    matrix_edges.append(MatrixEdge(from_=ordered[i].id, to=ordered[i + 1].id, type='col'))

    return matrix_edges


def _infer_split_enabled(
    kb_path: str,
    info: dict[str, Any],
    keys: list[KeyDef],
    row_pins: list[MatrixPin],
    col_pins: list[ColPin],
) -> bool:
    split = info.get('split') or {}
    if split.get('enabled'):
        return True
    path_parts = kb_path.lower().split('/')
    if 'split' in path_parts:
        return True
    if (info.get('rgb_matrix') or {}).get('split_count') or (info.get('led_matrix') or {}).get('split_count'):
        return True

    row_count = _matrix_row_count(keys)
    matrix_pins = info.get('matrix_pins') or {}
    if (
        row_count > 8
        and (
            _uses_custom_matrix(info)
            or len(row_pins) < row_count
            or (not row_pins and not matrix_pins.get('rows'))
            or (not col_pins and not matrix_pins.get('cols'))
        )
    ):
        return True

    # Symmetric physical layout: large center gap with balanced key count on each side.
    # Catches ergodox-style boards (6×14 custom matrix) that omit split.enabled.
    if len(keys) >= 20:
        xs = sorted(k.x + k.w / 2 for k in keys)
        gaps = [(xs[i + 1] - xs[i], (xs[i] + xs[i + 1]) / 2) for i in range(len(xs) - 1)]
        if gaps:
            max_gap_size, gap_mid = max(gaps, key=lambda g: g[0])
            total_width = xs[-1] - xs[0]
            if total_width > 0 and max_gap_size >= 1.5:
                near_center = abs(gap_mid - (xs[0] + xs[-1]) / 2) / total_width < 0.30
                if near_center:
                    left = sum(1 for x in xs if x < gap_mid)
                    right = sum(1 for x in xs if x > gap_mid)
                    if max(left, right) > 0 and min(left, right) / max(left, right) >= 0.85:
                        return True

    return False


def _layout_from_info(
    info: dict[str, Any],
    layouts: dict[str, Any],
    *,
    preferred_layout: str | None = None,
) -> tuple[str, Any]:
    aliases = info.get('layout_aliases') or {}

    # Priority 0: explicit caller-supplied layout (e.g. layout switcher)
    if preferred_layout:
        if preferred_layout in layouts:
            return preferred_layout, layouts[preferred_layout]
        canonical = aliases.get(preferred_layout)
        if canonical and canonical in layouts:
            return preferred_layout, layouts[canonical]

    raw_keymap = info.get('_default_keymap')
    keymap_pref = raw_keymap.get('layout') if isinstance(raw_keymap, dict) else None

    # Priority 1: exact match on default keymap layout
    if keymap_pref and keymap_pref in layouts:
        return keymap_pref, layouts[keymap_pref]

    # Priority 2: alias resolution of default keymap layout
    if keymap_pref:
        canonical = aliases.get(keymap_pref)
        if canonical and canonical in layouts:
            return keymap_pref, layouts[canonical]

    # Priority 3: exact LAYOUT
    if 'LAYOUT' in layouts:
        return 'LAYOUT', layouts['LAYOUT']

    # Priority 4: legacy KEYMAP
    if 'KEYMAP' in layouts:
        return 'KEYMAP', layouts['KEYMAP']

    # Priority 5: first available
    return next(iter(layouts.items()))


def _source_mode_from_info(kb_path: str, info: dict[str, Any]) -> tuple[str, str | None, dict[str, str]]:
    nexus = info.get('_nexus') or {}
    source_mode = nexus.get('source_mode')
    upstream_keyboard = nexus.get('upstream_keyboard')
    upstream_files = nexus.get('upstream_files') or {}

    if source_mode:
        return str(source_mode), upstream_keyboard or kb_path, upstream_files

    # All upstream imports default to qmk_json — delegate to the QMK tree's
    # implementation of pin scanning/matrix logic via the imported keymap.
    return 'qmk_json', kb_path, {}


def _convert_to_config(
    kb_path: str,
    info: dict[str, Any],
    *,
    preferred_layout: str | None = None,
    layout_only: bool = False,
) -> KeyboardConfig:
    usb = info.get('usb', {})
    processor = info.get('processor', info.get('processor_type', 'atmega32u4'))

    layouts: dict[str, Any] = info.get('layouts', {})
    if not layouts:
        raise HTTPException(status_code=422, detail='Keyboard has no layouts defined')

    raw_keymap = info.get('_default_keymap')
    layout_name, layout_data = _layout_from_info(info, layouts, preferred_layout=preferred_layout)
    qmk_keys: list[dict[str, Any]] = layout_data.get('layout', [])

    keys: list[KeyDef] = []
    for qk in qmk_keys:
        matrix = qk.get('matrix', [None, None])
        keys.append(KeyDef(
            id=_nanoid(),
            x=float(qk.get('x', 0)),
            y=float(qk.get('y', 0)),
            w=float(qk.get('w', 1)),
            h=float(qk.get('h', 1)),
            rotation=float(qk.get('r', 0)),
            label=str(qk.get('label', '')),
            row=matrix[0] if len(matrix) > 0 else None,
            col=matrix[1] if len(matrix) > 1 else None,
            led_index=None,
            shape='rect',
        ))
    keys = _apply_led_indices(info, keys)

    row_pins, col_pins = _matrix_pins_from_info(info)

    features_raw: dict[str, Any] = info.get('features', {})
    features: dict[str, bool] = {}
    for key, value in features_raw.items():
        if isinstance(value, bool):
            canonical = canonical_feature_id(key)
            features[canonical] = bool(value) or features.get(canonical, False)
    if features_raw.get('oled') or features_raw.get('st7565') or info.get('oled') or info.get('st7565'):
        features['oled'] = True
    if features_raw.get('led_matrix') or info.get('led_matrix'):
        features['rgb_matrix'] = True
    if features.get('audio') and not _supports_generated_audio(processor):
        features['audio'] = False
    split_enabled = _infer_split_enabled(kb_path, info, keys, row_pins, col_pins)
    if split_enabled:
        features['split_keyboard'] = True

    feature_configs = _feature_configs_from_info(info, split_enabled=split_enabled)
    source_mode, upstream_keyboard, upstream_files = _source_mode_from_info(kb_path, info)

    matrix_edges = _matrix_edges_from_keys(keys, split_enabled)
    encoders = _encoders_from_info(
        info,
        keys,
        min_count=_encoder_count_from_default_keymap(raw_keymap),
    )
    oleds = _oleds_from_info(info, keys, split_enabled=split_enabled)
    trackballs = _trackballs_from_info(kb_path, info, keys)
    _merge_peripheral_feature_configs(info, features, feature_configs, encoders, oleds, trackballs)

    layers = _layers_from_default_keymap(raw_keymap, keys)

    qmk_commit = _load_meta().get('qmk_commit')

    if layout_only:
        matrix_pins = info.get('matrix_pins') or {}
        has_custom_col_matrix = bool(matrix_pins.get('custom') or matrix_pins.get('custom_lite'))
        if has_custom_col_matrix:
            # Custom-matrix boards (shift register, expander) can't be expressed as
            # GPIO pin lists. Keep the native source mode and upstream files so the
            # build uses the keyboard's own matrix driver instead of Nexus codegen.
            pass
        else:
            source_mode = 'generated'
            upstream_files = {}

    config = KeyboardConfig(
        id=None,
        name=info.get('keyboard_name', kb_path.split('/')[-1]),
        mcu=str(processor).lower(),
        usb_vid=usb.get('vid', '0xFEED'),
        usb_pid=usb.get('pid', '0x0000'),
        manufacturer=info.get('manufacturer', ''),
        keys=keys,
        row_pins=row_pins,
        col_pins=col_pins,
        direct_pins=_direct_pins_from_info(info),
        matrix_edges=matrix_edges,
        layers=layers,
        features=features,
        feature_configs=feature_configs,
        layout_macro=layout_name,
        source_mode=source_mode,
        upstream_keyboard=upstream_keyboard,
        upstream_files=upstream_files,
        upstream_layouts=layouts,
        layout_aliases=info.get('layout_aliases') or {},
        keymap_name='nexus',
        qmk_commit=qmk_commit,
        soft_serial_pin='D0',
        encoders=encoders,
        oleds=oleds,
        trackballs=trackballs,
        encoder_keycodes=_encoder_keycodes_from_default_keymap(raw_keymap, layers, encoders),
    )
    return sanitize_keyboard_config(config)


@router.get('/import/{kb_path:path}', response_model=KeyboardConfig)
def import_keyboard(
    kb_path: str,
    layout_only: bool = Query(default=False, alias='layoutOnly'),
) -> KeyboardConfig:
    info = _load_keyboard_info(kb_path)
    return jsonable_out(_convert_to_config(kb_path, info, layout_only=layout_only))


class LayoutSwitchRequest(BaseModel):
    layout: str  # requested layout name


def _load_keyboard_info(kb_path: str) -> dict[str, Any]:
    kb_file = _safe_kb_file(kb_path)
    if not kb_file.exists():
        raise HTTPException(status_code=404, detail=f'Keyboard not found: {kb_path}')
    try:
        with open(kb_file) as f:
            return json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Failed to read keyboard data: {e}')


@router.post('/import/{kb_path:path}/switch-layout', response_model=KeyboardConfig)
def switch_layout(
    kb_path: str,
    req: LayoutSwitchRequest,
    keyboard_id: str | None = Query(default=None),
) -> KeyboardConfig:
    """Re-import a keyboard with a different layout, reconciling existing layers.

    Pass ``keyboard_id`` to reconcile existing layers against the new layout.
    Without ``keyboard_id``, returns a fresh import with the requested layout.
    """
    info = _load_keyboard_info(kb_path)
    layouts: dict[str, Any] = info.get('layouts') or {}
    if not layouts:
        raise HTTPException(status_code=422, detail='Keyboard has no layouts defined')

    aliases = info.get('layout_aliases') or {}
    requested = req.layout
    if requested not in layouts and aliases.get(requested) not in layouts:
        raise HTTPException(
            status_code=422,
            detail=f'Layout {requested!r} is not available for {kb_path}',
        )

    new_config = _convert_to_config(kb_path, info, preferred_layout=requested)

    # NOTE: full reconciliation against an existing stored keyboard requires
    # user context (so we can pull the right SQLite from S3). This endpoint
    # currently performs a fresh re-import; the auth-aware reconciliation
    # path will be added when the frontend wires up the layout switcher.
    # The reconciliation algorithm itself lives in ``layout_reconcile.py``
    # and is exercised directly in the test suite.
    _ = keyboard_id  # reserved for future use

    return jsonable_out(new_config)
