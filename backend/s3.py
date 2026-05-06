"""Per-user SQLite storage on S3.

Dev (is_prod=False): local files under /tmp/qmk-nexus-dbs/.
Prod: S3 bucket, with each request pulling and pushing the per-user DB object.
"""
from __future__ import annotations

import sqlite3
import tempfile
import threading
import logging
from pathlib import Path

from config import settings
from db import ensure_schema

_LOCAL_DB_DIR = Path(tempfile.gettempdir()) / 'qmk-nexus-dbs'
_etag_lock = threading.Lock()
_etags: dict[str, str | None] = {}  # temp db path -> last-seen etag (None means object did not exist)
logger = logging.getLogger(__name__)


class S3ConflictError(Exception):
    """Raised when concurrent writes to the same user DB can't be reconciled."""


def _user_key(user_id: str) -> str:
    return f'users/{user_id}/db.sqlite'


def _local_db_path(user_id: str) -> Path:
    _LOCAL_DB_DIR.mkdir(exist_ok=True)
    safe_id = user_id.replace('/', '_')
    return _LOCAL_DB_DIR / f'{safe_id}.sqlite'


def _s3_client():
    import boto3
    return boto3.client('s3', region_name=settings.aws_region)


def _error_code(exc: Exception) -> str | None:
    response = getattr(exc, 'response', None)
    if isinstance(response, dict):
        return response.get('Error', {}).get('Code')
    return None


def _set_etag(db_path: Path, etag: str | None) -> None:
    with _etag_lock:
        _etags[str(db_path)] = etag


def _get_etag(db_path: Path) -> str | None:
    with _etag_lock:
        return _etags.get(str(db_path))


def pull_user_db(user_id: str) -> Path:
    if not settings.is_prod:
        path = _local_db_path(user_id)
        _ensure_readable_db(path)
        return path

    s3 = _s3_client()
    tmp = tempfile.NamedTemporaryFile(suffix='.sqlite', delete=False)
    tmp.close()
    tmp_path = Path(tmp.name)
    try:
        resp = s3.get_object(Bucket=settings.s3_bucket, Key=_user_key(user_id))
        with open(tmp_path, 'wb') as f:
            for chunk in resp['Body'].iter_chunks():
                f.write(chunk)
        _set_etag(tmp_path, resp.get('ETag'))
    except Exception as e:
        if _error_code(e) in ('NoSuchKey', '404'):
            _init_db(tmp_path)
            _set_etag(tmp_path, None)
        else:
            raise
    _ensure_readable_db(tmp_path)
    return tmp_path


def push_user_db(user_id: str, db_path: Path) -> None:
    """Upload user keyboard database to S3.

    Concurrency note: this is intentionally last-write-wins. S3 PutObject does not
    check IfMatch; concurrent writes from the same user (e.g. two browser tabs) will
    silently overwrite each other. Acceptable for current single-user usage.
    """
    if not settings.is_prod:
        return

    s3 = _s3_client()
    key = _user_key(user_id)

    try:
        resp = s3.put_object(
            Bucket=settings.s3_bucket,
            Key=key,
            Body=db_path.read_bytes(),
        )
        _set_etag(db_path, resp.get('ETag'))
    except Exception as e:
        if _error_code(e) in ('PreconditionFailed', '412'):
            _set_etag(db_path, None)
            raise S3ConflictError('User db changed since pull — retry the request') from e
        raise


def _init_db(path: Path) -> None:
    ensure_schema(path)


def _ensure_readable_db(path: Path) -> None:
    try:
        ensure_schema(path)
    except sqlite3.DatabaseError:
        logger.exception('Repairing unreadable user db at %s', path)
        path.unlink(missing_ok=True)
        _init_db(path)
