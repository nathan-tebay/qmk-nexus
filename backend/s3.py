import sqlite3
import tempfile
import os
from pathlib import Path
from config import settings

_LOCAL_DB_DIR = Path(tempfile.gettempdir()) / 'tebay-qmk-dbs'


def _user_key(user_id: str) -> str:
    return f'users/{user_id}/db.sqlite'


def _local_db_path(user_id: str) -> Path:
    _LOCAL_DB_DIR.mkdir(exist_ok=True)
    safe_id = user_id.replace('/', '_')
    return _LOCAL_DB_DIR / f'{safe_id}.sqlite'


def pull_user_db(user_id: str) -> Path:
    if not settings.is_prod:
        path = _local_db_path(user_id)
        if not path.exists():
            _init_db(path)
        return path

    import boto3
    s3 = boto3.client('s3', region_name=settings.aws_region)
    tmp = tempfile.NamedTemporaryFile(suffix='.sqlite', delete=False)
    tmp.close()
    tmp_path = Path(tmp.name)
    try:
        s3.download_file(settings.s3_bucket, _user_key(user_id), str(tmp_path))
    except Exception as e:
        code = getattr(getattr(e, 'response', {}), 'get', lambda *_: None)('Error', {}).get('Code')
        if code == '404':
            _init_db(tmp_path)
        else:
            raise
    return tmp_path


def push_user_db(user_id: str, db_path: Path) -> None:
    if not settings.is_prod:
        return
    import boto3
    s3 = boto3.client('s3', region_name=settings.aws_region)
    s3.upload_file(str(db_path), settings.s3_bucket, _user_key(user_id))


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
