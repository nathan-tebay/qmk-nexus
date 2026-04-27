import io
import zipfile
from pathlib import PurePosixPath

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response

from auth import get_current_user
from codegen.generator import generate_sources
from codegen.validator import ALLOWED_FILES, MAX_FILE_BYTES, MAX_TOTAL_BYTES, validate_upload
from models import KeyboardConfig, User
from s3 import S3ConflictError, pull_user_db, push_user_db
from utils import jsonable_out, safe_name
from validation import sanitize_keyboard_config, validate_build_ready, validate_keyboard_config
import db as database

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


@router.get('/')
async def list_keyboards(user: User = Depends(get_current_user)):
    path = pull_user_db(user.id)
    return [jsonable_out(k) for k in database.list_keyboards(path)]


MAX_KEYBOARDS = 20


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
