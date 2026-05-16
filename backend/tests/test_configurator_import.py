"""Tests for POST /api/keyboards/import/configurator endpoint."""
import json
import sys
import zipfile
from io import BytesIO
from pathlib import Path

import pytest

# Skip entire module if fastapi is not installed (dev env may lack it)
pytest.importorskip('fastapi', reason='fastapi not installed')

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parent.parent))

from auth import get_current_user
from models import KeyboardConfig, User
from routers import keyboards

# ── Fixtures ─────────────────────────────────────────────────────────────────

_FAKE_USER = User(id='test-user-001', email='test@example.com', name='Test User')


def _make_app():
    app = FastAPI()
    app.include_router(keyboards.router, prefix='/api')
    app.dependency_overrides[get_current_user] = lambda: _FAKE_USER
    return app


def _make_client(monkeypatch, tmp_path):
    """Return a TestClient with S3 and DB mocked to use tmp_path."""
    import s3 as s3_mod

    monkeypatch.setattr(s3_mod.settings, 'environment', 'development')
    monkeypatch.setattr(s3_mod, '_LOCAL_DB_DIR', tmp_path)

    app = _make_app()
    return TestClient(app)


def _upload_json(client: TestClient, payload: dict) -> 'Response':
    return _upload_named_file(
        client,
        'export.json',
        json.dumps(payload).encode(),
        'application/json',
    )


def _upload_named_file(client: TestClient, name: str, raw: bytes, content_type: str) -> 'Response':
    return client.post(
        '/api/keyboards/import/configurator',
        files={'file': (name, BytesIO(raw), content_type)},
    )


def _zip_payload(entries: dict[str, bytes]) -> bytes:
    buf = BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for name, raw in entries.items():
            zf.writestr(name, raw)
    return buf.getvalue()


def _upload_zip(client: TestClient, entries: dict[str, bytes]) -> 'Response':
    return _upload_named_file(
        client,
        'qmk-download.zip',
        _zip_payload(entries),
        'application/zip',
    )


# ── Helpers ──────────────────────────────────────────────────────────────────

# Use '30wer' — it has a LAYOUT, 38 keys, all matrix pins defined, no split/RGB.
_KEYBOARD_PATH = '30wer'
_LAYOUT_NAME = 'LAYOUT'
_KEY_COUNT = 38  # from the 30wer keyboard data


def _make_layers(key_count: int, keycodes=None) -> list[list[str]]:
    """Build a single layer list of given length."""
    base = keycodes or (['KC_A'] * key_count)
    return [base]


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestConfiguratorImportValid:
    def test_import_minimal_valid_returns_200(self, monkeypatch, tmp_path):
        client = _make_client(monkeypatch, tmp_path)
        payload = {
            'keyboard': _KEYBOARD_PATH,
            'keymap': 'default',
            'layout': _LAYOUT_NAME,
            'layers': _make_layers(_KEY_COUNT),
        }
        resp = _upload_json(client, payload)
        assert resp.status_code == 200, resp.text

    def test_import_returns_keyboard_config(self, monkeypatch, tmp_path):
        client = _make_client(monkeypatch, tmp_path)
        payload = {
            'keyboard': _KEYBOARD_PATH,
            'keymap': 'default',
            'layout': _LAYOUT_NAME,
            'layers': _make_layers(_KEY_COUNT),
        }
        resp = _upload_json(client, payload)
        assert resp.status_code == 200
        data = resp.json()
        assert 'id' in data
        assert 'keys' in data
        assert 'layers' in data

    def test_import_source_mode_is_qmk_json(self, monkeypatch, tmp_path):
        client = _make_client(monkeypatch, tmp_path)
        payload = {
            'keyboard': _KEYBOARD_PATH,
            'keymap': 'default',
            'layout': _LAYOUT_NAME,
            'layers': _make_layers(_KEY_COUNT),
        }
        resp = _upload_json(client, payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data.get('sourceMode') == 'qmk_json'

    def test_import_long_form_keycodes_normalized(self, monkeypatch, tmp_path):
        client = _make_client(monkeypatch, tmp_path)
        # First key KC_ENTER → should become KC_ENT in the saved layer
        codes = ['KC_ENTER'] + ['KC_A'] * (_KEY_COUNT - 1)
        payload = {
            'keyboard': _KEYBOARD_PATH,
            'keymap': 'default',
            'layout': _LAYOUT_NAME,
            'layers': [codes],
        }
        resp = _upload_json(client, payload)
        assert resp.status_code == 200
        data = resp.json()
        # Collect all keycode values from the first layer
        layers = data.get('layers', [])
        assert layers, 'Expected at least one layer'
        all_codes = list(layers[0].get('keycodes', {}).values())
        # KC_ENTER must not appear; KC_ENT must be there
        assert 'KC_ENTER' not in all_codes, 'KC_ENTER should have been normalized to KC_ENT'
        assert 'KC_ENT' in all_codes, 'KC_ENT should appear after normalization'

    def test_import_unknown_custom_keycode_preserved(self, monkeypatch, tmp_path):
        client = _make_client(monkeypatch, tmp_path)
        codes = ['MY_CUSTOM_MACRO'] + ['KC_A'] * (_KEY_COUNT - 1)
        payload = {
            'keyboard': _KEYBOARD_PATH,
            'keymap': 'default',
            'layout': _LAYOUT_NAME,
            'layers': [codes],
        }
        resp = _upload_json(client, payload)
        assert resp.status_code == 200
        data = resp.json()
        layers = data.get('layers', [])
        assert layers
        all_codes = list(layers[0].get('keycodes', {}).values())
        assert 'MY_CUSTOM_MACRO' in all_codes, 'Unknown keycode should be preserved literally'

    def test_import_optional_fields_set(self, monkeypatch, tmp_path):
        client = _make_client(monkeypatch, tmp_path)
        payload = {
            'keyboard': _KEYBOARD_PATH,
            'keymap': 'my_keymap',
            'layout': _LAYOUT_NAME,
            'layers': _make_layers(_KEY_COUNT),
            'author': 'TestAuthor',
            'notes': 'Some notes here',
            'commit': 'abc123',
        }
        resp = _upload_json(client, payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data.get('author') == 'TestAuthor'
        assert data.get('notes') == 'Some notes here'
        assert data.get('qmkCommit') == 'abc123'


class TestConfiguratorZipImport:
    def test_import_zip_with_keymap_json_returns_200(self, monkeypatch, tmp_path):
        client = _make_client(monkeypatch, tmp_path)
        payload = {
            'keyboard': _KEYBOARD_PATH,
            'keymap': 'default',
            'layout': _LAYOUT_NAME,
            'layers': _make_layers(_KEY_COUNT),
        }
        resp = _upload_zip(client, {
            'readme.txt': b'generated by qmk configurator',
            'keymap.json': json.dumps(payload).encode(),
        })
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data.get('sourceMode') == 'qmk_json'
        assert data.get('upstreamKeyboard') == _KEYBOARD_PATH

    def test_import_zip_without_configurator_json_returns_422(self, monkeypatch, tmp_path):
        client = _make_client(monkeypatch, tmp_path)
        resp = _upload_zip(client, {
            'metadata.json': b'{"not": "a keymap"}',
        })
        assert resp.status_code == 422


class TestConfiguratorImportRemap:
    def test_import_with_remapped_keyboard_path(self, monkeypatch, tmp_path):
        """A path in qmk_remap.json should resolve to the target keyboard."""
        # 'keychron/k2' → 'keychron/k2/rgb/v1'; use a remap entry that
        # actually exists in backend/data/keyboards/ on this machine.
        # Fall back gracefully: just verify the remap lookup works even if
        # the target keyboard doesn't exist (404 not 500).
        client = _make_client(monkeypatch, tmp_path)
        payload = {
            'keyboard': 'keychron/k2',
            'keymap': 'default',
            'layout': 'LAYOUT_all',
            'layers': [['KC_A']],
        }
        resp = _upload_json(client, payload)
        # Either 200 (target exists) or 404 (target missing from index) are both acceptable.
        # What must NOT happen is a 500 or unhandled exception.
        assert resp.status_code in (200, 404)


class TestConfiguratorImportErrors:
    def test_import_unknown_keyboard_returns_404(self, monkeypatch, tmp_path):
        client = _make_client(monkeypatch, tmp_path)
        payload = {
            'keyboard': 'nonexistent/fake_keyboard_xyz',
            'keymap': 'default',
            'layout': 'LAYOUT',
            'layers': [['KC_A']],
        }
        resp = _upload_json(client, payload)
        assert resp.status_code == 404

    def test_import_missing_keyboard_field_returns_422(self, monkeypatch, tmp_path):
        client = _make_client(monkeypatch, tmp_path)
        payload = {
            # 'keyboard' missing
            'keymap': 'default',
            'layout': 'LAYOUT',
            'layers': [['KC_A']],
        }
        resp = _upload_json(client, payload)
        assert resp.status_code == 422

    def test_import_missing_layers_field_returns_422(self, monkeypatch, tmp_path):
        client = _make_client(monkeypatch, tmp_path)
        payload = {
            'keyboard': _KEYBOARD_PATH,
            'keymap': 'default',
            'layout': 'LAYOUT',
            # 'layers' missing
        }
        resp = _upload_json(client, payload)
        assert resp.status_code == 422

    def test_import_missing_layout_field_returns_422(self, monkeypatch, tmp_path):
        client = _make_client(monkeypatch, tmp_path)
        payload = {
            'keyboard': _KEYBOARD_PATH,
            'keymap': 'default',
            # 'layout' missing
            'layers': [['KC_A']],
        }
        resp = _upload_json(client, payload)
        assert resp.status_code == 422

    def test_import_invalid_json_returns_400(self, monkeypatch, tmp_path):
        client = _make_client(monkeypatch, tmp_path)
        resp = client.post(
            '/api/keyboards/import/configurator',
            files={'file': ('export.json', BytesIO(b'not json at all !!!'), 'application/json')},
        )
        assert resp.status_code == 400

    def test_import_layers_not_list_of_lists_returns_422(self, monkeypatch, tmp_path):
        client = _make_client(monkeypatch, tmp_path)
        payload = {
            'keyboard': _KEYBOARD_PATH,
            'keymap': 'default',
            'layout': 'LAYOUT',
            'layers': 'not-a-list',
        }
        resp = _upload_json(client, payload)
        assert resp.status_code == 422
