import json
import logging
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from config import settings
from models import ColPin, KeyDef, KeyboardConfig, Layer, MatrixPin

logger = logging.getLogger('qmk-nexus.qmk')

router = APIRouter(prefix='/qmk', tags=['qmk'])


# ---------------------------------------------------------------------------
# Index building
# ---------------------------------------------------------------------------

def _extract_info(info: dict[str, Any]) -> dict[str, Any] | None:
    """Extract summary fields from a raw info.json dict. Returns None if not a valid leaf keyboard."""
    layouts = info.get('layouts', {})
    if not layouts:
        return None

    usb = info.get('usb', {})
    processor = info.get('processor', info.get('processor_type', 'unknown'))

    return {
        'name': info.get('keyboard_name', ''),
        'manufacturer': info.get('manufacturer', ''),
        'mcu': str(processor).lower(),
        'usb_vid': usb.get('vid', '0xFEED'),
        'usb_pid': usb.get('pid', '0x0000'),
        'layouts': list(layouts.keys()),
        'key_count': len(next(iter(layouts.values()), {}).get('layout', [])),
        'matrix_pins': info.get('matrix_pins', {}),
    }


@lru_cache(maxsize=1)
def _build_index() -> list[dict[str, Any]]:
    kb_root = Path(settings.qmk_keyboards_path)
    if not kb_root.exists():
        logger.warning('QMK keyboards path not found: %s', kb_root)
        return []

    index: list[dict[str, Any]] = []
    for info_path in sorted(kb_root.rglob('info.json')):
        try:
            with open(info_path) as f:
                data = json.load(f)
        except Exception:
            continue

        entry = _extract_info(data)
        if not entry:
            continue

        rel = info_path.parent.relative_to(kb_root)
        entry['path'] = str(rel).replace('\\', '/')
        index.append(entry)

    logger.info('QMK index built: %d keyboards', len(index))
    return index


# ---------------------------------------------------------------------------
# Response models (plain dicts — no Pydantic overhead for large lists)
# ---------------------------------------------------------------------------

@router.get('/search')
def search_keyboards(q: str = Query('', max_length=100)) -> list[dict[str, Any]]:
    index = _build_index()
    if not q.strip():
        return index[:100]

    q_lower = q.lower()
    results = [
        entry for entry in index
        if q_lower in entry['name'].lower() or q_lower in entry['manufacturer'].lower()
        or q_lower in entry['path'].lower()
    ]
    return results[:100]


# ---------------------------------------------------------------------------
# Import: convert QMK info.json → KeyboardConfig
# ---------------------------------------------------------------------------

def _nanoid() -> str:
    import uuid
    return uuid.uuid4().hex[:10]


def _convert_to_config(kb_path: str, info: dict[str, Any]) -> KeyboardConfig:
    usb = info.get('usb', {})
    processor = info.get('processor', info.get('processor_type', 'atmega32u4'))

    # Pick first layout
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

    # Build pin lists from matrix_pins
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
    features = {k: bool(v) for k, v in features_raw.items() if isinstance(v, bool)}

    return KeyboardConfig(
        id=None,
        name=info.get('keyboard_name', kb_path.split('/')[-1]),
        mcu=str(processor).lower(),
        usb_vid=usb.get('vid', '0xFEED'),
        usb_pid=usb.get('pid', '0x0000'),
        manufacturer=info.get('manufacturer', ''),
        keys=keys,
        row_pins=row_pins,
        col_pins=col_pins,
        layers=[Layer(id='layer0', name='Base', keycodes={})],
        features=features,
        soft_serial_pin='D0',
    )


@router.get('/import/{kb_path:path}', response_model=KeyboardConfig)
def import_keyboard(kb_path: str) -> KeyboardConfig:
    kb_root = Path(settings.qmk_keyboards_path)
    info_file = kb_root / kb_path / 'info.json'

    if not info_file.exists():
        raise HTTPException(status_code=404, detail=f'Keyboard not found: {kb_path}')

    try:
        with open(info_file) as f:
            info = json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Failed to read info.json: {e}')

    return _convert_to_config(kb_path, info)
