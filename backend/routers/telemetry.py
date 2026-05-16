from pydantic import BaseModel, ConfigDict, Field
from fastapi import APIRouter, Depends, HTTPException

import telemetry
from auth import get_current_user
from config import settings
from models import User
from utils import jsonable_out

router = APIRouter(prefix='/telemetry', tags=['telemetry'])


class VisitRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    visitor_id: str = Field(alias='visitorId')
    event: str = 'visit'


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.email.lower() != settings.admin_email.lower():
        raise HTTPException(status_code=403, detail='Admin access required')
    return user


@router.get('/summary')
async def telemetry_summary(user: User = Depends(require_admin)):
    telemetry.record_user_seen(user)
    return jsonable_out(telemetry.summary())


@router.post('/visit')
async def telemetry_visit(payload: VisitRequest):
    user_id = telemetry.record_anonymous_visit(payload.visitor_id, payload.event)
    if not user_id:
        raise HTTPException(status_code=422, detail='Invalid visitor id')
    return {'ok': True, 'userId': user_id}
