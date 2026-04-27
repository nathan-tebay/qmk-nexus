"""Per-user SQLite storage on S3 with If-Match conditional writes.

Dev (is_prod=False): local files under /tmp/qmk-nexus-dbs/.
Prod: S3 bucket, with ETag tracked per pulled temp DB so push fails on concurrent writes.
"""
from __future__ import annotations

import sqlite3
import tempfile
import threading
from pathlib import Path

from config import settings

_LOCAL_DB_DIR = Path(tempfile.gettempdir()) / 'qmk-nexus-dbs'
_etag_lock = threading.Lock()
_etags: dict[str, str | None] = {}  # temp db path -> last-seen etag (None means object did not exist)


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
        if not path.exists():
            _init_db(path)
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
    return tmp_path


def push_user_db(user_id: str, db_path: Path) -> None:
    if not settings.is_prod:
        return

    s3 = _s3_client()
    key = _user_key(user_id)
    etag = _get_etag(db_path)
    extra_args = {'IfMatch': etag} if etag else {'IfNoneMatch': '*'}

    try:
        resp = s3.put_object(
            Bucket=settings.s3_bucket,
            Key=key,
            Body=db_path.read_bytes(),
            **extra_args,
        )
        _set_etag(db_path, resp.get('ETag'))
    except Exception as e:
        if _error_code(e) in ('PreconditionFailed', '412'):
            _set_etag(db_path, None)
            raise S3ConflictError('User db changed since pull — retry the request') from e
        raise


def _init_db(path: Path) -> None:
    with sqlite3.connect(path) as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS keyboards (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                config_json TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );
        """)
