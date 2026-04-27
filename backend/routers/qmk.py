import json
import logging
import uuid
from collections import defaultdict
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from models import ColPin, KeyDef, KeyboardConfig, Layer, MatrixEdge, MatrixPin
from validation import canonical_feature_id, sanitize_keyboard_config

logger = logging.getLogger('qmk-nexus.qmk')

router = APIRouter(prefix='/qmk', tags=['qmk'])

_INDEX_PATH = Path(__file__).parent.parent / 'data' / 'qmk_index.json'
_KB_DATA_DIR = Path(__file__).parent.parent / 'data' / 'keyboards'


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


def _convert_to_config(kb_path: str, info: dict[str, Any]) -> KeyboardConfig:
    usb = info.get('usb', {})
    processor = info.get('processor', info.get('processor_type', 'atmega32u4'))

    layouts: dict[str, Any] = info.get('layouts', {})
    if not layouts:
        raise HTTPException(status_code=422, detail='Keyboard has no layouts defined')

    layout_name, layout_data = next(iter(layouts.items()))
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

    matrix_pins: dict[str, Any] = info.get('matrix_pins', {})
    row_pins: list[MatrixPin] = [
        MatrixPin(row=i, pin=pin)
        for i, pin in enumerate(matrix_pins.get('rows', []))
    ]
    col_pins: list[ColPin] = [
        ColPin(col=i, pin=pin)
        for i, pin in enumerate(matrix_pins.get('cols', []))
    ]

    features_raw: dict[str, Any] = info.get('features', {})
    features: dict[str, bool] = {}
    for key, value in features_raw.items():
        if isinstance(value, bool):
            canonical = canonical_feature_id(key)
            features[canonical] = bool(value) or features.get(canonical, False)
    split = info.get('split') or {}
    if split.get('enabled'):
        features['split_keyboard'] = True

    feature_configs: dict[str, dict[str, str]] = {}
    if split.get('enabled'):
        split_config: dict[str, str] = {}
        serial_pin = (split.get('serial') or {}).get('pin')
        if serial_pin:
            split_config['SOFT_SERIAL_PIN'] = str(serial_pin)
        transport = (split.get('transport') or {}).get('protocol')
        if transport:
            split_config['SPLIT_TRANSPORT'] = str(transport)
        feature_configs['split_keyboard'] = split_config

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
    raw_keymap = info.get('_default_keymap')
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
        source_mode=(info.get('_nexus') or {}).get('source_mode', 'generated'),
        upstream_keyboard=(info.get('_nexus') or {}).get('upstream_keyboard'),
        upstream_files=(info.get('_nexus') or {}).get('upstream_files', {}),
        soft_serial_pin='D0',
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
