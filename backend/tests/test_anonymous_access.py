import io
import zipfile

import pytest
pytest.importorskip('fastapi', reason='fastapi not installed')

from fastapi import FastAPI
from fastapi.testclient import TestClient

import telemetry
from dynamo import _builds_mem
from routers import keyboards, telemetry as telemetry_router


def setup_function():
    _builds_mem.clear()


def test_public_sources_zip_endpoint_accepts_keyboard_config(minimal_avr_kb):
    app = FastAPI()
    app.include_router(keyboards.router, prefix='/api')
    client = TestClient(app)

    response = client.post(
        '/api/keyboards/sources/zip',
        json=minimal_avr_kb.model_dump(by_alias=True),
    )

    assert response.status_code == 200, response.text
    assert response.headers['content-type'] == 'application/zip'
    with zipfile.ZipFile(io.BytesIO(response.content)) as zf:
        names = set(zf.namelist())
    assert {'config.h', 'rules.mk', 'info.json', 'keyboard.c', 'keyboard.h', 'keymap.c'} <= names


def test_public_telemetry_visit_records_anonymous_user():
    app = FastAPI()
    app.include_router(telemetry_router.router, prefix='/api')
    client = TestClient(app)

    response = client.post(
        '/api/telemetry/visit',
        json={'visitorId': 'visitor-test-1234', 'event': 'app_load'},
    )

    assert response.status_code == 200, response.text
    data = response.json()
    assert data['userId'].startswith('anon_')

    summary = telemetry.summary()
    assert summary['uniqueAnonymousVisitors'] == 1
    visitor = summary['users'][0]
    assert visitor['userId'] == data['userId']
    assert visitor['email'] == ''
    assert visitor['name'] == ''
