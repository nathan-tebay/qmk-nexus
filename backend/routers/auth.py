import secrets
from urllib.parse import urlencode, urlparse

import httpx
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse

from auth import clear_auth_cookies, get_current_user, set_auth_cookies
from config import settings
from dynamo import create_refresh_token, revoke_refresh_token, verify_refresh_token
from models import User
import telemetry

router = APIRouter(prefix='/auth', tags=['auth'])

GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'


def _forwarded_header_value(request: Request, name: str) -> str | None:
    value = request.headers.get(name)
    if not value:
        return None
    return value.split(',', 1)[0].strip()


def _external_origin(request: Request) -> str:
    forwarded_host = _forwarded_header_value(request, 'x-forwarded-host')
    if forwarded_host:
        forwarded_proto = _forwarded_header_value(request, 'x-forwarded-proto')
        proto = forwarded_proto or request.url.scheme
        return f'{proto}://{forwarded_host}'
    return str(request.base_url).rstrip('/')


def _callback_url(request: Request) -> str:
    api_origin = settings.api_base_url.rstrip('/') if settings.is_prod else _external_origin(request)
    return f'{api_origin}/api/auth/google/callback'


def _frontend_callback_url(request: Request) -> str:
    if settings.is_prod:
        return f'{settings.frontend_url.rstrip("/")}/auth/callback'
    origin = _external_origin(request)
    expected_port = urlparse(settings.frontend_url).port
    if expected_port and not origin.endswith(f':{expected_port}'):
        origin = settings.frontend_url.rstrip('/')
    return f'{origin}/auth/callback'


@router.get('/google')
async def google_login(request: Request):
    state = secrets.token_urlsafe(32)
    params = urlencode({
        'client_id': settings.google_client_id,
        'redirect_uri': _callback_url(request),
        'response_type': 'code',
        'scope': 'openid email profile',
        'access_type': 'offline',
        'state': state,
    })
    redirect = RedirectResponse(f'{GOOGLE_AUTH_URL}?{params}')
    redirect.set_cookie(
        'oauth_state', state,
        httponly=True, secure=settings.is_prod, samesite='lax', max_age=300, path='/',
    )
    return redirect


@router.get('/google/callback')
async def google_callback(
    request: Request,
    code: str,
    state: str,
    oauth_state: str | None = Cookie(default=None),
):
    if not oauth_state or not secrets.compare_digest(state, oauth_state):
        raise HTTPException(status_code=400, detail='Invalid OAuth state')

    async with httpx.AsyncClient() as client:
        token_res = await client.post(GOOGLE_TOKEN_URL, data={
            'code': code,
            'client_id': settings.google_client_id,
            'client_secret': settings.google_client_secret,
            'redirect_uri': _callback_url(request),
            'grant_type': 'authorization_code',
        })
        if token_res.status_code != 200:
            raise HTTPException(status_code=400, detail='Google token exchange failed')

        userinfo_res = await client.get(
            GOOGLE_USERINFO_URL,
            headers={'Authorization': f'Bearer {token_res.json()["access_token"]}'},
        )
        if userinfo_res.status_code != 200:
            raise HTTPException(status_code=400, detail='Failed to fetch Google user info')

        info = userinfo_res.json()

    user = User(
        id=f'google_{info["sub"]}',
        email=info['email'],
        name=info.get('name', info['email']),
        avatar_url=info.get('picture'),
    )
    telemetry.record_user_seen(user)

    # Create refresh token first; if this fails, no auth cookies are set yet.
    refresh_token = create_refresh_token(user)

    redirect = RedirectResponse(_frontend_callback_url(request))
    redirect.delete_cookie('oauth_state', path='/', secure=settings.is_prod, samesite='lax')
    set_auth_cookies(redirect, user)
    redirect.set_cookie(
        'refresh_token', refresh_token,
        httponly=True, secure=settings.is_prod, samesite='lax',
        max_age=60 * 60 * 24 * 30, path='/api/auth',
    )
    return redirect


@router.get('/me', response_model=User)
async def me(user: User = Depends(get_current_user)):
    telemetry.record_user_seen(user)
    return user


@router.post('/refresh')
async def refresh(response: Response, refresh_token: str | None = Cookie(default=None)):
    if not refresh_token:
        raise HTTPException(status_code=401, detail='No refresh token')

    user = verify_refresh_token(refresh_token)
    if not user:
        raise HTTPException(status_code=401, detail='Refresh token invalid or expired')

    telemetry.record_user_seen(user)
    revoke_refresh_token(refresh_token)
    new_refresh = create_refresh_token(user)

    set_auth_cookies(response, user)
    response.set_cookie(
        'refresh_token', new_refresh,
        httponly=True, secure=settings.is_prod, samesite='lax',
        max_age=60 * 60 * 24 * 30, path='/api/auth',
    )
    return {'ok': True}


@router.post('/logout')
async def logout(response: Response, refresh_token: str | None = Cookie(default=None)):
    if refresh_token:
        revoke_refresh_token(refresh_token)
    clear_auth_cookies(response)
    response.delete_cookie('refresh_token', path='/api/auth',
                           secure=settings.is_prod, samesite='lax')
    return {'ok': True}
