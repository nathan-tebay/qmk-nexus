from fastapi import APIRouter, Depends, HTTPException
from models import KeyboardConfig, User
from auth import get_current_user
from s3 import S3ConflictError, pull_user_db, push_user_db
from utils import jsonable_out
import db as database

router = APIRouter(prefix='/keyboards', tags=['keyboards'])


def _push(user_id: str, path):
    try:
        push_user_db(user_id, path)
    except S3ConflictError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get('/')
async def list_keyboards(user: User = Depends(get_current_user)):
    path = pull_user_db(user.id)
    return [jsonable_out(k) for k in database.list_keyboards(path)]


@router.post('/')
async def create_keyboard(config: KeyboardConfig, user: User = Depends(get_current_user)):
    path = pull_user_db(user.id)
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
    config = config.model_copy(update={'id': keyboard_id})
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
