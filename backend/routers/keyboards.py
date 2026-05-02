import io
import json
import zipfile
from pathlib import Path, PurePosixPath
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response

from auth import get_current_user
from codegen.generator import generate_sources
from codegen.keycodes import normalize_layers
from codegen.validator import ALLOWED_FILES, MAX_FILE_BYTES, MAX_TOTAL_BYTES, validate_upload
from models import KeyboardConfig, Layer, User
from routers.qmk import _convert_to_config
from s3 import S3ConflictError, pull_user_db, push_user_db
from utils import jsonable_out, safe_name
from validation import sanitize_keyboard_config, validate_build_ready, validate_keyboard_config
import db as database

_REMAP_PATH = Path(__file__).parent.parent / 'data' / 'qmk_remap.json'
_KB_DATA_DIR = Path(__file__).parent.parent / 'data' / 'keyboards'


def _load_remap() -> dict[str, str]:
    if not _REMAP_PATH.exists():
        return {}
    try:
        with open(_REMAP_PATH) as f:
            return json.load(f)
    except Exception:
        return {}


def _apply_remap(path: str, remap: dict[str, str], max_depth: int = 5) -> str:
    for _ in range(max_depth):
        new_path = remap.get(path)
        if new_path is None or new_path == path:
            return path
        path = new_path
    return path


router = APIRouter(prefix='/keyboards', tags=['keyboards'])


def _push(user_id: str, path):
    try:
        push_user_db(user_id, path)
    except S3ConflictError as e:
        raise HTTPException(status_code=409, detail=str(e))


def _validated_config(config: KeyboardConfig) -> KeyboardConfig:
    config = sanitize_keyboard_config(config)
    errors = validate_keyboard_config(config)
    if errors:
        raise HTTPException(status_code=422, detail=errors)
    return config


@router.get('', include_in_schema=False)
@router.get('/')
async def list_keyboards(user: User = Depends(get_current_user)):
    path = pull_user_db(user.id)
    return [jsonable_out(k) for k in database.list_keyboards(path)]


MAX_KEYBOARDS = 20


@router.post('', include_in_schema=False)
@router.post('/')
async def create_keyboard(config: KeyboardConfig, user: User = Depends(get_current_user)):
    config = _validated_config(config)
    path = pull_user_db(user.id)
    existing = database.list_keyboards(path)
    if len(existing) >= MAX_KEYBOARDS:
        raise HTTPException(status_code=400, detail=f'Keyboard limit reached ({MAX_KEYBOARDS}). Delete one before creating a new keyboard.')
    saved = database.upsert_keyboard(path, config)
    _push(user.id, path)
    return jsonable_out(saved)


@router.get('/{keyboard_id}')
async def get_keyboard(keyboard_id: str, user: User = Depends(get_current_user)):
    path = pull_user_db(user.id)
    config = database.get_keyboard(path, keyboard_id)
    if not config:
        raise HTTPException(status_code=404, detail='Keyboard not found')
    return jsonable_out(config)


@router.put('/{keyboard_id}')
async def update_keyboard(
    keyboard_id: str,
    config: KeyboardConfig,
    user: User = Depends(get_current_user),
):
    config = _validated_config(config.model_copy(update={'id': keyboard_id}))
    path = pull_user_db(user.id)
    if not database.get_keyboard(path, keyboard_id):
        raise HTTPException(status_code=404, detail='Keyboard not found')
    saved = database.upsert_keyboard(path, config)
    _push(user.id, path)
    return jsonable_out(saved)


@router.delete('/{keyboard_id}')
async def delete_keyboard(keyboard_id: str, user: User = Depends(get_current_user)):
    path = pull_user_db(user.id)
    if not database.delete_keyboard(path, keyboard_id):
        raise HTTPException(status_code=404, detail='Keyboard not found')
    _push(user.id, path)
    return {'deleted': keyboard_id}


@router.get('/{keyboard_id}/sources')
async def download_sources(keyboard_id: str, user: User = Depends(get_current_user)):
    path = pull_user_db(user.id)
    config = database.get_keyboard(path, keyboard_id)
    if not config:
        raise HTTPException(status_code=404, detail='Keyboard not found')
    config = _validated_config(config)
    build_errors = validate_build_ready(config)
    if build_errors:
        raise HTTPException(status_code=422, detail=build_errors)

    files = generate_sources(config, overrides=config.custom_files)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for name, content in files.items():
            zf.writestr(name, content)
        if config.source_mode == 'qmk_native':
            for name, content in (config.upstream_files or {}).items():
                zf.writestr(f'upstream_overlay/{name}', content)
    buf.seek(0)

    kb_slug = safe_name(config.name)
    return Response(
        content=buf.read(),
        media_type='application/zip',
        headers={'Content-Disposition': f'attachment; filename="{kb_slug}_sources.zip"'},
    )


@router.post('/{keyboard_id}/sources')
async def upload_sources(
    keyboard_id: str,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    path = pull_user_db(user.id)
    config = database.get_keyboard(path, keyboard_id)
    if not config:
        raise HTTPException(status_code=404, detail='Keyboard not found')
    config = _validated_config(config)

    raw = await file.read()
    if len(raw) > MAX_TOTAL_BYTES:
        raise HTTPException(status_code=413, detail=f'Upload exceeds {MAX_TOTAL_BYTES // 1024} KB limit')

    try:
        zf = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail='Not a valid zip file')

    extracted: dict[str, str] = {}
    total_uncompressed = 0
    with zf:
        for info in zf.infolist():
            base = PurePosixPath(info.filename).name
            if not base:
                continue
            if base in extracted:
                raise HTTPException(status_code=400, detail=f'{base}: duplicate filename in zip')
            if base not in ALLOWED_FILES:
                raise HTTPException(status_code=422, detail=[f'{base}: filename not allowed (expected one of {", ".join(sorted(ALLOWED_FILES))})'])
            if info.file_size > MAX_FILE_BYTES:
                raise HTTPException(status_code=413, detail=f'{base}: file exceeds {MAX_FILE_BYTES // 1024} KB limit')
            total_uncompressed += info.file_size
            if total_uncompressed > MAX_TOTAL_BYTES:
                raise HTTPException(status_code=413, detail=f'Upload exceeds {MAX_TOTAL_BYTES // 1024} KB limit after decompression')
            try:
                extracted[base] = zf.read(info).decode('utf-8')
            except UnicodeDecodeError:
                raise HTTPException(status_code=400, detail=f'{base}: not valid UTF-8')

    errors = validate_upload(extracted)
    if errors:
        raise HTTPException(status_code=422, detail=errors)

    updated_custom = {**config.custom_files, **extracted}
    database.upsert_keyboard(path, config.model_copy(update={'custom_files': updated_custom}))
    _push(user.id, path)

    return {'imported': list(extracted.keys()), 'customFiles': updated_custom}


@router.delete('/{keyboard_id}/sources/{filename}')
async def reset_source_file(
    keyboard_id: str,
    filename: str,
    user: User = Depends(get_current_user),
):
    path = pull_user_db(user.id)
    config = database.get_keyboard(path, keyboard_id)
    if not config:
        raise HTTPException(status_code=404, detail='Keyboard not found')

    custom = {**config.custom_files}
    if filename not in custom:
        raise HTTPException(status_code=404, detail='No custom override for this file')

    del custom[filename]
    database.upsert_keyboard(path, config.model_copy(update={'custom_files': custom}))
    _push(user.id, path)

    return {'reset': filename, 'customFiles': custom}


@router.post('/import/configurator', response_model=KeyboardConfig)
async def import_configurator_json(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    """Import a QMK Configurator exported JSON file as a new keyboard config."""
    raw = await file.read()
    try:
        data: dict[str, Any] = json.loads(raw)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f'Invalid JSON: {e}')

    # Validate required fields
    missing = [f for f in ('keyboard', 'layout', 'layers') if f not in data]
    if missing:
        raise HTTPException(status_code=422, detail=f'Missing required fields: {", ".join(missing)}')

    raw_kb_path: str = data['keyboard']
    raw_layout: str = data['layout']
    raw_layers: list[list[str]] = data['layers']

    if not isinstance(raw_layers, list) or not all(isinstance(layer, list) for layer in raw_layers):
        raise HTTPException(status_code=422, detail='layers must be a list of lists')

    # Apply keyboard path remap
    remap = _load_remap()
    kb_path = _apply_remap(raw_kb_path, remap)

    # Load keyboard data
    kb_file = _KB_DATA_DIR / (kb_path + '.json')
    if not kb_file.exists():
        raise HTTPException(status_code=404, detail=f'Keyboard not found: {kb_path}')

    try:
        with open(kb_file) as f:
            info: dict[str, Any] = json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Failed to read keyboard data: {e}')

    # Build base config from keyboard info
    config = _convert_to_config(kb_path, info)

    # Normalize keycodes across all layers
    normalized_layers = normalize_layers(raw_layers)

    # Build layer objects matched to key order from the config
    _skip = {'KC_TRNS', 'KC_NO', 'XXXXXXX', ''}
    built_layers: list[Layer] = []
    for i, layer_codes in enumerate(normalized_layers):
        keycodes = {
            config.keys[j].id: layer_codes[j]
            for j in range(min(len(layer_codes), len(config.keys)))
            if layer_codes[j] not in _skip
        }
        built_layers.append(Layer(
            id=f'layer{i}',
            name='Base' if i == 0 else f'Layer {i}',
            keycodes=keycodes,
        ))
    if not built_layers:
        built_layers = [Layer(id='layer0', name='Base', keycodes={})]

    # Apply optional metadata from configurator export
    updates: dict[str, Any] = {
        'layers': built_layers,
        'source_mode': 'qmk_json',
        'upstream_keyboard': kb_path,
    }
    if 'author' in data:
        updates['author'] = str(data['author'])
    if 'notes' in data:
        updates['notes'] = str(data['notes'])
    if 'commit' in data:
        updates['qmk_commit'] = str(data['commit'])
    if 'keymap' in data:
        updates['keymap_name'] = str(data['keymap'])

    config = config.model_copy(update=updates)

    # Save to user's keyboard store
    path = pull_user_db(user.id)
    existing = database.list_keyboards(path)
    if len(existing) >= MAX_KEYBOARDS:
        raise HTTPException(
            status_code=400,
            detail=f'Keyboard limit reached ({MAX_KEYBOARDS}). Delete one before importing.',
        )
    saved = database.upsert_keyboard(path, config)
    _push(user.id, path)
    return jsonable_out(saved)
