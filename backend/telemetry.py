from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from config import settings
from dynamo import _builds_mem, _builds_table
from models import BuildStatus, User

logger = logging.getLogger(__name__)

USER_PREFIX = 'telemetry#user#'
BUILD_PREFIX = 'telemetry#build#'
FINAL_STATUSES = {'success', 'failed'}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _put_item(item: dict[str, Any]) -> None:
    if not settings.is_prod:
        existing = _builds_mem.get(item['id'])
        if existing:
            created_at = existing.get('created_at') or item.get('created_at') or _now_iso()
            item = {**existing, **item}
            item['created_at'] = created_at
        _builds_mem[item['id']] = item
        return
    _builds_table().put_item(Item=item)


def _record_item(item: dict[str, Any]) -> None:
    try:
        _put_item(item)
    except Exception:
        logger.warning('telemetry write failed', exc_info=True)


def _scan_telemetry() -> list[dict[str, Any]]:
    if not settings.is_prod:
        return [
            item for key, item in _builds_mem.items()
            if key.startswith(USER_PREFIX) or key.startswith(BUILD_PREFIX)
        ]

    table = _builds_table()
    items: list[dict[str, Any]] = []
    kwargs: dict[str, Any] = {}
    while True:
        resp = table.scan(**kwargs)
        items.extend(
            item for item in resp.get('Items', [])
            if str(item.get('id', '')).startswith(USER_PREFIX)
            or str(item.get('id', '')).startswith(BUILD_PREFIX)
        )
        last_key = resp.get('LastEvaluatedKey')
        if not last_key:
            return items
        kwargs['ExclusiveStartKey'] = last_key


def record_user_seen(user: User) -> None:
    now = _now_iso()
    _record_item({
        'id': f'{USER_PREFIX}{user.id}',
        'type': 'user',
        'user_id': user.id,
        'email': user.email,
        'name': user.name,
        'created_at': now,
        'last_seen_at': now,
    })


def record_build_final(status: BuildStatus, user_id: str) -> None:
    if status.status not in FINAL_STATUSES:
        return
    now = _now_iso()
    _record_item({
        'id': f'{BUILD_PREFIX}{status.id}',
        'type': 'build',
        'build_id': status.id,
        'user_id': user_id,
        'keyboard_id': status.keyboard_id,
        'status': status.status,
        'artifact_available': status.artifact_available,
        'error': status.error,
        'created_at': now,
        'completed_at': now,
    })


def summary() -> dict[str, Any]:
    items = _scan_telemetry()
    users_by_identity: dict[str, dict[str, Any]] = {}
    for item in items:
        if item.get('type') != 'user' or not item.get('user_id'):
            continue
        email = str(item.get('email') or '').lower()
        identity = email or str(item['user_id'])
        existing = users_by_identity.get(identity)
        if existing and str(existing.get('lastSeenAt') or '') >= str(item.get('last_seen_at') or ''):
            continue
        users_by_identity[identity] = {
            'userId': item.get('user_id'),
            'email': item.get('email') or '',
            'name': item.get('name') or '',
            'firstSeenAt': item.get('created_at'),
            'lastSeenAt': item.get('last_seen_at'),
        }

    builds_by_status = {status: 0 for status in sorted(FINAL_STATUSES)}
    completed_builds: list[dict[str, Any]] = []
    total_builds = 0
    for item in items:
        if item.get('type') != 'build':
            continue
        status = item.get('status')
        if status not in FINAL_STATUSES:
            continue
        total_builds += 1
        builds_by_status[status] = builds_by_status.get(status, 0) + 1
        completed_builds.append({
            'buildId': item.get('build_id'),
            'userId': item.get('user_id'),
            'keyboardId': item.get('keyboard_id'),
            'status': status,
            'completedAt': item.get('completed_at'),
        })

    completed_builds.sort(key=lambda item: item.get('completedAt') or '', reverse=True)
    users = sorted(
        users_by_identity.values(),
        key=lambda item: item.get('lastSeenAt') or '',
        reverse=True,
    )

    return {
        'uniqueUsers': len(users_by_identity),
        'users': users,
        'builds': {
            'total': total_builds,
            'byFinalStatus': builds_by_status,
            'completed': completed_builds,
        },
    }
