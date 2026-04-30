import sqlite3
import uuid
import logging
from pathlib import Path

from pydantic import ValidationError

from models import KeyboardConfig

logger = logging.getLogger(__name__)


def ensure_schema(db: Path) -> None:
    with sqlite3.connect(db) as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS keyboards (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                config_json TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );
        """)


def _parse_config(raw: str, keyboard_id: str | None = None) -> KeyboardConfig | None:
    try:
        return KeyboardConfig.model_validate_json(raw)
    except ValidationError:
        logger.exception('Skipping invalid keyboard config%s', f' {keyboard_id}' if keyboard_id else '')
        return None


def list_keyboards(db: Path) -> list[KeyboardConfig]:
    ensure_schema(db)
    with sqlite3.connect(db) as conn:
        rows = conn.execute(
            'SELECT id, config_json FROM keyboards ORDER BY updated_at DESC'
        ).fetchall()
    configs = [_parse_config(config_json, keyboard_id) for keyboard_id, config_json in rows]
    return [config for config in configs if config is not None]


def get_keyboard(db: Path, keyboard_id: str) -> KeyboardConfig | None:
    ensure_schema(db)
    with sqlite3.connect(db) as conn:
        row = conn.execute(
            'SELECT config_json FROM keyboards WHERE id = ?', (keyboard_id,)
        ).fetchone()
    if not row:
        return None
    return _parse_config(row[0], keyboard_id)


def upsert_keyboard(db: Path, config: KeyboardConfig) -> KeyboardConfig:
    ensure_schema(db)
    if not config.id:
        config = config.model_copy(update={'id': str(uuid.uuid4())})
    with sqlite3.connect(db) as conn:
        conn.execute(
            """
            INSERT INTO keyboards (id, name, config_json, updated_at)
            VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                config_json = excluded.config_json,
                updated_at = excluded.updated_at
            """,
            (config.id, config.name, config.model_dump_json()),
        )
    return config


def delete_keyboard(db: Path, keyboard_id: str) -> bool:
    ensure_schema(db)
    with sqlite3.connect(db) as conn:
        cur = conn.execute('DELETE FROM keyboards WHERE id = ?', (keyboard_id,))
    return cur.rowcount > 0
