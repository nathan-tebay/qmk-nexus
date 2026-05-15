import secrets
from dataclasses import dataclass, field
from typing import Callable, Awaitable
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


# ---------------------------------------------------------------------------
# Provider abstraction
# ---------------------------------------------------------------------------

@dataclass
class OAuthProvider:
    name: str
    auth_url: str
    token_url: str
    scope: str
    fetch_user: Callable[['httpx.AsyncClient', str], Awaitable[User]]
    extra_auth_params: dict = field(default_factory=dict)
    token_extra_headers: dict = field(default_factory=dict)

    @property
    def client_id(self) -> str:
        return getattr(settings, f'{self.name}_client_id')

    @property
    def client_secret(self) -> str:
        return getattr(settings, f'{self.name}_client_secret')


async def _fetch_google_user(client: httpx.AsyncClient, access_token: str) -> User:
    res = await client.get(
        'https://www.googleapis.com/oauth2/v3/userinfo',
        headers={'Authorization': f'Bearer {access_token}'},
    )
    if res.status_code != 200:
        raise HTTPException(status_code=400, detail='Failed to fetch Google user info')
    info = res.json()
    return User(
        id=f'google_{info["sub"]}',
        email=info['email'],
        name=info.get('name', info['email']),
        avatar_url=info.get('picture'),
    )


async def _fetch_github_user(client: httpx.AsyncClient, access_token: str) -> User:
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Accept': 'application/vnd.github+json',
    }
    res = await client.get('https://api.github.com/user', headers=headers)
    if res.status_code != 200:
        raise HTTPException(status_code=400, detail='Failed to fetch GitHub user info')
    info = res.json()

    email = info.get('email')
    if not email:
        email_res = await client.get('https://api.github.com/user/emails', headers=headers)
        if email_res.status_code == 200:
            primary = next(
                (e['email'] for e in email_res.json() if e.get('primary') and e.get('verified')),
                None,
            )
            email = primary

    if not email:
        raise HTTPException(status_code=400, detail='GitHub account has no accessible email')

    avatar = info.get('avatar_url')
    return User(
        id=f'github_{info["id"]}',
        email=email,
        name=info.get('name') or info.get('login', email),
        avatar_url=avatar,
    )


async def _fetch_discord_user(client: httpx.AsyncClient, access_token: str) -> User:
    res = await client.get(
        'https://discord.com/api/users/@me',
        headers={'Authorization': f'Bearer {access_token}'},
    )
    if res.status_code != 200:
        raise HTTPException(status_code=400, detail='Failed to fetch Discord user info')
    info = res.json()

    avatar_hash = info.get('avatar')
    avatar_url = (
        f'https://cdn.discordapp.com/avatars/{info["id"]}/{avatar_hash}.png'
        if avatar_hash else None
    )
    return User(
        id=f'discord_{info["id"]}',
        email=info['email'],
        name=info.get('global_name') or info.get('username', info['email']),
        avatar_url=avatar_url,
    )


PROVIDERS: dict[str, OAuthProvider] = {
    'google': OAuthProvider(
        name='google',
        auth_url='https://accounts.google.com/o/oauth2/v2/auth',
        token_url='https://oauth2.googleapis.com/token',
        scope='openid email profile',
        extra_auth_params={'access_type': 'offline'},
        fetch_user=_fetch_google_user,
    ),
    'github': OAuthProvider(
        name='github',
        auth_url='https://github.com/login/oauth/authorize',
        token_url='https://github.com/login/oauth/access_token',
        scope='read:user user:email',
        token_extra_headers={'Accept': 'application/json'},
        fetch_user=_fetch_github_user,
    ),
    'discord': OAuthProvider(
        name='discord',
        auth_url='https://discord.com/oauth2/authorize',
        token_url='https://discord.com/api/oauth2/token',
        scope='identify email',
        fetch_user=_fetch_discord_user,
    ),
}


# ---------------------------------------------------------------------------
# URL helpers
# ---------------------------------------------------------------------------

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


def _callback_url(request: Request, provider: str) -> str:
    api_origin = settings.api_base_url.rstrip('/') if settings.is_prod else _external_origin(request)
    return f'{api_origin}/api/auth/{provider}/callback'


def _frontend_callback_url(request: Request) -> str:
    if settings.is_prod:
        return f'{settings.frontend_url.rstrip("/")}/auth/callback'
    origin = _external_origin(request)
    expected_port = urlparse(settings.frontend_url).port
    if expected_port and not origin.endswith(f':{expected_port}'):
        origin = settings.frontend_url.rstrip('/')
    return f'{origin}/auth/callback'


# ---------------------------------------------------------------------------
# Shared OAuth flow helpers
# ---------------------------------------------------------------------------

async def _oauth_login(provider_name: str, request: Request) -> RedirectResponse:
    provider = PROVIDERS[provider_name]
    state = secrets.token_urlsafe(32)
    params = urlencode({
        'client_id': provider.client_id,
        'redirect_uri': _callback_url(request, provider_name),
        'response_type': 'code',
        'scope': provider.scope,
        'state': state,
        **provider.extra_auth_params,
    })
    redirect = RedirectResponse(f'{provider.auth_url}?{params}')
    redirect.set_cookie(
        'oauth_state', state,
        httponly=True, secure=settings.is_prod, samesite='lax', max_age=300, path='/',
    )
    return redirect


async def _oauth_callback(
    provider_name: str,
    request: Request,
    code: str,
    state: str,
    oauth_state: str | None,
) -> RedirectResponse:
    if not oauth_state or not secrets.compare_digest(state, oauth_state):
        raise HTTPException(status_code=400, detail='Invalid OAuth state')

    provider = PROVIDERS[provider_name]
    async with httpx.AsyncClient() as client:
        token_res = await client.post(
            provider.token_url,
            data={
                'code': code,
                'client_id': provider.client_id,
                'client_secret': provider.client_secret,
                'redirect_uri': _callback_url(request, provider_name),
                'grant_type': 'authorization_code',
            },
            headers=provider.token_extra_headers,
        )
        if token_res.status_code != 200:
            raise HTTPException(status_code=400, detail=f'{provider_name} token exchange failed')

        user = await provider.fetch_user(client, token_res.json()['access_token'])

    telemetry.record_user_seen(user)
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


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get('/google')
async def google_login(request: Request):
    return await _oauth_login('google', request)


@router.get('/google/callback')
async def google_callback(
    request: Request,
    code: str,
    state: str,
    oauth_state: str | None = Cookie(default=None),
):
    return await _oauth_callback('google', request, code, state, oauth_state)


@router.get('/github')
async def github_login(request: Request):
    return await _oauth_login('github', request)


@router.get('/github/callback')
async def github_callback(
    request: Request,
    code: str,
    state: str,
    oauth_state: str | None = Cookie(default=None),
):
    return await _oauth_callback('github', request, code, state, oauth_state)


@router.get('/discord')
async def discord_login(request: Request):
    return await _oauth_login('discord', request)


@router.get('/discord/callback')
async def discord_callback(
    request: Request,
    code: str,
    state: str,
    oauth_state: str | None = Cookie(default=None),
):
    return await _oauth_callback('discord', request, code, state, oauth_state)


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
