import sqlite3

import db
import s3
from models import KeyboardConfig


def test_list_keyboards_initializes_missing_schema(tmp_path):
    path = tmp_path / 'user.sqlite'

    assert db.list_keyboards(path) == []

    with sqlite3.connect(path) as conn:
        row = conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'keyboards'"
        ).fetchone()
    assert row == ('keyboards',)


def test_list_keyboards_skips_invalid_saved_rows(tmp_path):
    path = tmp_path / 'user.sqlite'
    db.ensure_schema(path)
    valid = KeyboardConfig(id='valid', name='Valid Keyboard').model_dump_json()
    invalid = '{"id":"invalid","keys":[{"id":"k0"}]}'

    with sqlite3.connect(path) as conn:
        conn.execute(
            'INSERT INTO keyboards (id, name, config_json) VALUES (?, ?, ?)',
            ('valid', 'Valid Keyboard', valid),
        )
        conn.execute(
            'INSERT INTO keyboards (id, name, config_json) VALUES (?, ?, ?)',
            ('invalid', 'Invalid Keyboard', invalid),
        )

    keyboards = db.list_keyboards(path)

    assert [keyboard.id for keyboard in keyboards] == ['valid']


def test_pull_user_db_repairs_unreadable_local_db(tmp_path, monkeypatch):
    monkeypatch.setattr(s3.settings, 'environment', 'development')
    monkeypatch.setattr(s3, '_LOCAL_DB_DIR', tmp_path)
    path = tmp_path / 'user.sqlite'
    path.write_text('not sqlite')

    repaired = s3.pull_user_db('user')

    assert repaired == path
    assert db.list_keyboards(repaired) == []
