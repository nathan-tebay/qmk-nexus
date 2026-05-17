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
TELEMETRY_PREFIX = 'telemetry#'
LOCK_PREFIX = 'lock#'

REFRESH_TTL = timedelta(days=30)
BUILD_TTL = timedelta(hours=1)
CACHE_TTL = timedelta(days=5)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _ts(dt: datetime) -> int:
    return int(dt.timestamp())


def _builds_table():
    import boto3
    return boto3.resource('dynamodb', region_name=settings.aws_region).Table('qmk-nexus-builds')


def _is_build_record(item: dict) -> bool:
    id_ = str(item.get('id', ''))
    return not id_.startswith(TELEMETRY_PREFIX) and not id_.startswith(LOCK_PREFIX)


def _refresh_table():
    import boto3
    return boto3.resource('dynamodb', region_name=settings.aws_region).Table('qmk-nexus-refresh')


# ── Build state ────────────────────────────────────────────────────────────────

def put_build(status: BuildStatus, user_id: str, ttl_override: timedelta | None = None) -> None:
    data = status.model_dump()
    data['user_id'] = user_id
    data['ttl'] = _ts(_now() + (ttl_override if ttl_override is not None else BUILD_TTL))
    if status.bucket is not None:
        data['bucket'] = status.bucket
    if status.prefix is not None:
        data['prefix'] = status.prefix
    if not settings.is_prod:
        _builds_mem[status.id] = data
        return
    _builds_table().put_item(Item=data)


def get_build(build_id: str) -> dict | None:
    if not settings.is_prod:
        return _builds_mem.get(build_id)
    resp = _builds_table().get_item(Key={'id': build_id})
    return resp.get('Item')


def find_cached_build(user_id: str, config_hash: str) -> dict | None:
    """Return the most recent successful ECS build for user+config_hash within CACHE_TTL."""
    cutoff_iso = (_now() - CACHE_TTL).isoformat()
    if not settings.is_prod:
        candidates = [
            rec for rec in _builds_mem.values()
            if _is_build_record(rec)
            and rec.get('user_id') == user_id
            and rec.get('config_hash') == config_hash
            and rec.get('status') == 'success'
            and rec.get('mode') == 'ecs'
            and rec.get('artifact_available') is True
            and rec.get('bucket')
            and rec.get('prefix')
            and (rec.get('created_at') or '') >= cutoff_iso
        ]
        if not candidates:
            return None
        return max(candidates, key=lambda r: r.get('created_at') or '')

    # TODO: Replace scan with GSI query on (user_id, config_hash) for production scale
    from boto3.dynamodb.conditions import Attr
    resp = _builds_table().scan(
        FilterExpression=(
            Attr('user_id').eq(user_id)
            & Attr('config_hash').eq(config_hash)
            & Attr('status').eq('success')
            & Attr('mode').eq('ecs')
            & Attr('artifact_available').eq(True)
            & Attr('created_at').gte(cutoff_iso)
        )
    )
    items = [
        item for item in resp.get('Items', [])
        if _is_build_record(item) and item.get('bucket') and item.get('prefix')
    ]
    if not items:
        return None
    return max(items, key=lambda r: r.get('created_at') or '')


def list_user_builds(user_id: str, limit: int = 10) -> list[dict]:
    """Return the most recent builds for user_id, sorted by created_at desc."""
    # TODO: Replace scan with GSI query on user_id + created_at sort key for production scale
    if not settings.is_prod:
        candidates = [
            rec for rec in _builds_mem.values()
            if _is_build_record(rec)
            and rec.get('user_id') == user_id
        ]
        candidates.sort(key=lambda r: r.get('created_at') or '', reverse=True)
        return candidates[:limit]

    from boto3.dynamodb.conditions import Attr
    resp = _builds_table().scan(FilterExpression=Attr('user_id').eq(user_id))
    items = [
        item for item in resp.get('Items', [])
        if _is_build_record(item)
    ]
    items.sort(key=lambda r: r.get('created_at') or '', reverse=True)
    return items[:limit]


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


# ── Per-user build locks ───────────────────────────────────────────────────────

def acquire_build_lock(user_id: str) -> bool:
    """Atomically claim a build slot for user_id. Returns False if already locked."""
    lock_key = f'{LOCK_PREFIX}{user_id}'
    lock_ttl = _ts(_now() + BUILD_TTL + timedelta(seconds=60))
    if not settings.is_prod:
        if lock_key in _builds_mem:
            return False
        _builds_mem[lock_key] = {'id': lock_key, 'user_id': user_id, 'ttl': lock_ttl}
        return True
    try:
        _builds_table().put_item(
            Item={'id': lock_key, 'user_id': user_id, 'ttl': lock_ttl},
            ConditionExpression='attribute_not_exists(id)',
        )
        return True
    except Exception as e:
        if getattr(e, 'response', {}).get('Error', {}).get('Code') == 'ConditionalCheckFailedException':
            return False
        raise


def release_build_lock(user_id: str) -> None:
    """Release the build lock for user_id. Safe to call even if no lock exists."""
    lock_key = f'{LOCK_PREFIX}{user_id}'
    if not settings.is_prod:
        _builds_mem.pop(lock_key, None)
        return
    _builds_table().delete_item(Key={'id': lock_key})


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
        return token
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
