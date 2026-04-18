"""Build state + refresh token storage.

Dev: in-memory dicts (no AWS needed).
Prod: DynamoDB tables qmk-nexus-builds and qmk-nexus-refresh.
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from config import settings
from models import BuildStatus, User

_builds_mem: dict[str, dict] = {}
_refresh_mem: dict[str, dict] = {}  # token_hash → record

REFRESH_TTL = timedelta(days=30)
BUILD_TTL = timedelta(hours=1)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _ts(dt: datetime) -> int:
    return int(dt.timestamp())


def _builds_table():
    import boto3
    return boto3.resource('dynamodb', region_name=settings.aws_region).Table('qmk-nexus-builds')


def _refresh_table():
    import boto3
    return boto3.resource('dynamodb', region_name=settings.aws_region).Table('qmk-nexus-refresh')


# ── Build state ────────────────────────────────────────────────────────────────

def put_build(status: BuildStatus, user_id: str) -> None:
    data = status.model_dump()
    data['user_id'] = user_id
    data['ttl'] = _ts(_now() + BUILD_TTL)
    if not settings.is_prod:
        _builds_mem[status.id] = data
        return
    _builds_table().put_item(Item=data)


def get_build(build_id: str) -> dict | None:
    if not settings.is_prod:
        return _builds_mem.get(build_id)
    resp = _builds_table().get_item(Key={'id': build_id})
    return resp.get('Item')


def update_build_fields(build_id: str, **patch) -> None:
    if not settings.is_prod:
        if build_id in _builds_mem:
            _builds_mem[build_id].update(patch)
        return
    expr = 'SET ' + ', '.join(f'#{k} = :{k}' for k in patch)
    _builds_table().update_item(
        Key={'id': build_id},
        UpdateExpression=expr,
        ExpressionAttributeNames={f'#{k}': k for k in patch},
        ExpressionAttributeValues={f':{k}': v for k, v in patch.items()},
    )


def active_builds_for_user(user_id: str) -> list[dict]:
    """Returns builds with status queued/building for rate limiting."""
    if not settings.is_prod:
        return [
            b for b in _builds_mem.values()
            if b.get('user_id') == user_id and b.get('status') in ('queued', 'building')
        ]
    resp = _builds_table().scan(
        FilterExpression='user_id = :uid AND #s IN (:q, :b)',
        ExpressionAttributeNames={'#s': 'status'},
        ExpressionAttributeValues={':uid': user_id, ':q': 'queued', ':b': 'building'},
    )
    return resp.get('Items', [])


# ── Refresh tokens ─────────────────────────────────────────────────────────────

def create_refresh_token(user: User) -> str:
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    expires = _now() + REFRESH_TTL
    record = {
        'user_id': user.id,
        'email': user.email,
        'name': user.name,
        'avatar_url': user.avatar_url,
        'expires_at': expires.isoformat(),
        'ttl': _ts(expires),
    }
    if not settings.is_prod:
        _refresh_mem[token_hash] = record
    else:
        _refresh_table().put_item(Item={'token_hash': token_hash, **record})
    return token


def verify_refresh_token(token: str) -> User | None:
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    if not settings.is_prod:
        record = _refresh_mem.get(token_hash)
    else:
        resp = _refresh_table().get_item(Key={'token_hash': token_hash})
        record = resp.get('Item')

    if not record:
        return None

    expires = datetime.fromisoformat(record['expires_at'])
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if _now() > expires:
        revoke_refresh_token(token)
        return None

    return User(
        id=record['user_id'],
        email=record['email'],
        name=record['name'],
        avatar_url=record.get('avatar_url'),
    )


def revoke_refresh_token(token: str) -> None:
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    if not settings.is_prod:
        _refresh_mem.pop(token_hash, None)
        return
    _refresh_table().delete_item(Key={'token_hash': token_hash})
