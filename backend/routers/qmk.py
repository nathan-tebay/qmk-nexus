import json
import logging
import re
import uuid
from collections import defaultdict
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from models import ColPin, EncoderElement, KeyDef, KeyboardConfig, Layer, MatrixEdge, MatrixPin
from validation import canonical_feature_id, sanitize_keyboard_config

logger = logging.getLogger('qmk-nexus.qmk')

router = APIRouter(prefix='/qmk', tags=['qmk'])

_INDEX_PATH = Path(__file__).parent.parent / 'data' / 'qmk_index.json'
_KB_DATA_DIR = Path(__file__).parent.parent / 'data' / 'keyboards'
_DEFINE_ARRAY_RE = re.compile(r'#\s*define\s+([A-Z0-9_]+)\s+\{([^}]+)\}')
_DEFINE_VALUE_RE = re.compile(r'#\s*define\s+([A-Z0-9_]+)\s+([^\s/]+)')


@lru_cache(maxsize=1)
def _load_index() -> list[dict[str, Any]]:
    if not _INDEX_PATH.exists():
        logger.warning('QMK index not found at %s', _INDEX_PATH)
        return []
    with open(_INDEX_PATH) as f:
        data = json.load(f)
    logger.info('QMK index loaded: %d keyboards', len(data))
    return data


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

    split = info.get('split') or {}
    if split.get('enabled') or split_enabled:
        split_config: dict[str, str] = {}
        serial_pin = (split.get('serial') or {}).get('pin')
        if serial_pin:
            split_config['SOFT_SERIAL_PIN'] = str(serial_pin)
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
        ws2812 = info.get('ws2812') or {}
        if ws2812.get('pin'):
            rgb_config['RGB_MATRIX_PIN'] = str(ws2812['pin'])
        native_defines = _defines_from_native_config(info)
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
        ws2812 = info.get('ws2812') or {}
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

    return feature_configs


def _encoders_from_info(info: dict[str, Any], keys: list[KeyDef]) -> list[EncoderElement]:
    rotary = (info.get('encoder') or {}).get('rotary') or []
    if not rotary:
        return []
    max_x = max((key.x + key.w for key in keys), default=0)
    min_y = min((key.y for key in keys), default=0)
    return [
        EncoderElement(id=_nanoid(), x=max_x + 1.0, y=min_y + i * 1.25, has_switch=False)
        for i, _entry in enumerate(rotary)
    ]


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


def _define_arrays_from_native_config(info: dict[str, Any]) -> dict[str, list[str]]:
    config_text = _native_config_text(info)
    arrays: dict[str, list[str]] = {}
    for name, body in _DEFINE_ARRAY_RE.findall(config_text):
        arrays[name] = [token.strip() for token in body.split(',')]
    return arrays


def _defines_from_native_config(info: dict[str, Any]) -> dict[str, str]:
    defines: dict[str, str] = {}
    for name, value in _DEFINE_VALUE_RE.findall(_native_config_text(info)):
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

    arrays = _define_arrays_from_native_config(info)
    onboard_rows = arrays.get('MATRIX_ONBOARD_ROW_PINS') or []
    expander_rows = arrays.get('MATRIX_EXPANDER_ROW_PINS') or []
    if onboard_rows:
        for i, pin in enumerate(onboard_rows):
            if pin and pin != '0':
                row_pins.append(MatrixPin(row=i, pin=pin))
            elif i < len(expander_rows):
                row_pins.append(MatrixPin(row=i, pin=f'MCP_A{expander_rows[i]}'))

    onboard_cols = arrays.get('MATRIX_ONBOARD_COL_PINS') or []
    expander_cols = arrays.get('MATRIX_EXPANDER_COL_PINS') or []
    if onboard_cols:
        col_pins = [ColPin(col=i, pin=pin) for i, pin in enumerate(onboard_cols) if pin and pin != '0']
    elif expander_cols:
        col_pins = [ColPin(col=i, pin=f'MCP_B{pin}') for i, pin in enumerate(expander_cols)]

    return row_pins, col_pins


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
    return (
        row_count > 8
        and (
            _uses_custom_matrix(info)
            or len(row_pins) < row_count
            or (not row_pins and not matrix_pins.get('rows'))
            or (not col_pins and not matrix_pins.get('cols'))
        )
    )


def _layout_from_info(info: dict[str, Any], layouts: dict[str, Any]) -> tuple[str, Any]:
    raw_keymap = info.get('_default_keymap')
    preferred_layout = raw_keymap.get('layout') if isinstance(raw_keymap, dict) else None
    if preferred_layout in layouts:
        return preferred_layout, layouts[preferred_layout]

    aliases = info.get('layout_aliases') or {}
    aliased_layout = aliases.get(preferred_layout)
    if aliased_layout in layouts:
        return str(preferred_layout), layouts[aliased_layout]

    return next(iter(layouts.items()))


def _source_mode_from_info(kb_path: str, info: dict[str, Any]) -> tuple[str, str | None, dict[str, str]]:
    nexus = info.get('_nexus') or {}
    source_mode = nexus.get('source_mode')
    upstream_keyboard = nexus.get('upstream_keyboard')
    upstream_files = nexus.get('upstream_files') or {}

    if source_mode:
        return str(source_mode), upstream_keyboard, upstream_files

    if _uses_custom_matrix(info):
        return 'qmk_native', kb_path, upstream_files

    return 'generated', upstream_keyboard, upstream_files


def _convert_to_config(kb_path: str, info: dict[str, Any]) -> KeyboardConfig:
    usb = info.get('usb', {})
    processor = info.get('processor', info.get('processor_type', 'atmega32u4'))

    layouts: dict[str, Any] = info.get('layouts', {})
    if not layouts:
        raise HTTPException(status_code=422, detail='Keyboard has no layouts defined')

    raw_keymap = info.get('_default_keymap')
    layout_name, layout_data = _layout_from_info(info, layouts)
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
            label='',
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
    split_enabled = _infer_split_enabled(kb_path, info, keys, row_pins, col_pins)
    if split_enabled:
        features['split_keyboard'] = True

    feature_configs = _feature_configs_from_info(info, split_enabled=split_enabled)
    source_mode, upstream_keyboard, upstream_files = _source_mode_from_info(kb_path, info)

    # Build matrix edges by chaining keys within each row/col group
    row_groups: dict[int, list[KeyDef]] = defaultdict(list)
    col_groups: dict[int, list[KeyDef]] = defaultdict(list)
    for key in keys:
        if key.row is not None:
            row_groups[key.row].append(key)
        if key.col is not None:
            col_groups[key.col].append(key)

    matrix_edges: list[MatrixEdge] = []
    for group in row_groups.values():
        for i in range(len(group) - 1):
            matrix_edges.append(MatrixEdge(from_=group[i].id, to=group[i + 1].id, type='row'))
    for group in col_groups.values():
        for i in range(len(group) - 1):
            matrix_edges.append(MatrixEdge(from_=group[i].id, to=group[i + 1].id, type='col'))

    # Parse embedded default keymap if available (from build_qmk_index.py)
    if raw_keymap and raw_keymap.get('layers'):
        _skip = {'KC_TRNS', 'KC_NO', 'XXXXXXX', ''}
        layers: list[Layer] = []
        for i, codes in enumerate(raw_keymap['layers']):
            keycodes = {
                keys[j].id: code
                for j, code in enumerate(codes)
                if j < len(keys) and code not in _skip
            }
            layers.append(Layer(
                id=f'layer{i}',
                name='Base' if i == 0 else f'Layer {i}',
                keycodes=keycodes,
            ))
        if not layers:
            layers = [Layer(id='layer0', name='Base', keycodes={})]
    else:
        layers = [Layer(id='layer0', name='Base', keycodes={})]

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
        matrix_edges=matrix_edges,
        layers=layers,
        features=features,
        feature_configs=feature_configs,
        layout_macro=layout_name,
        source_mode=source_mode,
        upstream_keyboard=upstream_keyboard,
        upstream_files=upstream_files,
        soft_serial_pin='D0',
        encoders=_encoders_from_info(info, keys),
    )
    return sanitize_keyboard_config(config)


@router.get('/import/{kb_path:path}', response_model=KeyboardConfig)
def import_keyboard(kb_path: str) -> KeyboardConfig:
    kb_file = _KB_DATA_DIR / (kb_path + '.json')
    if not kb_file.exists():
        raise HTTPException(status_code=404, detail=f'Keyboard not found: {kb_path}')

    try:
        with open(kb_file) as f:
            info = json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Failed to read keyboard data: {e}')

    return _convert_to_config(kb_path, info)
