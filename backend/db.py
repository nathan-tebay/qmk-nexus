import sqlite3
import json
import uuid
from pathlib import Path
from models import KeyboardConfig


def list_keyboards(db: Path) -> list[KeyboardConfig]:
    with sqlite3.connect(db) as conn:
        rows = conn.execute(
            'SELECT config_json FROM keyboards ORDER BY updated_at DESC'
        ).fetchall()
    return [KeyboardConfig.model_validate_json(r[0]) for r in rows]


def get_keyboard(db: Path, keyboard_id: str) -> KeyboardConfig | None:
    with sqlite3.connect(db) as conn:
        row = conn.execute(
            'SELECT config_json FROM keyboards WHERE id = ?', (keyboard_id,)
        ).fetchone()
    if not row:
        return None
    return KeyboardConfig.model_validate_json(row[0])


def upsert_keyboard(db: Path, config: KeyboardConfig) -> KeyboardConfig:
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
    with sqlite3.connect(db) as conn:
        cur = conn.execute('DELETE FROM keyboards WHERE id = ?', (keyboard_id,))
    return cur.rowcount > 0
