from urllib.parse import parse_qs, urlparse

from fastapi import FastAPI
from fastapi.testclient import TestClient

from routers import auth


def test_google_login_uses_forwarded_local_origin(monkeypatch):
    monkeypatch.setattr(auth.settings, 'environment', 'development')
    monkeypatch.setattr(auth.settings, 'google_client_id', 'client-id')

    app = FastAPI()
    app.include_router(auth.router, prefix='/api')
    client = TestClient(app)

    response = client.get(
        '/api/auth/google',
        headers={
            'x-forwarded-host': 'qmknexus.local:3001',
            'x-forwarded-proto': 'http',
        },
        follow_redirects=False,
    )

    assert response.status_code == 307
    assert 'oauth_state=' in response.headers['set-cookie']

    location = response.headers['location']
    query = parse_qs(urlparse(location).query)
    assert query['redirect_uri'] == ['http://qmknexus.local:3001/api/auth/google/callback']


def test_google_login_uses_configured_origin_in_production(monkeypatch):
    monkeypatch.setattr(auth.settings, 'environment', 'production')
    monkeypatch.setattr(auth.settings, 'api_base_url', 'https://api.example.test')
    monkeypatch.setattr(auth.settings, 'google_client_id', 'client-id')

    app = FastAPI()
    app.include_router(auth.router, prefix='/api')
    client = TestClient(app)

    response = client.get(
        '/api/auth/google',
        headers={
            'x-forwarded-host': 'qmknexus.local:3001',
            'x-forwarded-proto': 'http',
        },
        follow_redirects=False,
    )

    assert response.status_code == 307

    location = response.headers['location']
    query = parse_qs(urlparse(location).query)
    assert query['redirect_uri'] == ['https://api.example.test/api/auth/google/callback']
