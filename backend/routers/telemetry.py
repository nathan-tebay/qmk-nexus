from fastapi import APIRouter, Depends, HTTPException

import telemetry
from auth import get_current_user
from models import User
from utils import jsonable_out

router = APIRouter(prefix='/telemetry', tags=['telemetry'])
ADMIN_EMAIL = 'nathan.tebay80@gmail.com'


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.email.lower() != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail='Admin access required')
    return user


@router.get('/summary')
async def telemetry_summary(user: User = Depends(require_admin)):
    telemetry.record_user_seen(user)
    return jsonable_out(telemetry.summary())
