import secrets
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from fastapi.responses import RedirectResponse

from auth import clear_auth_cookies, get_current_user, set_auth_cookies
from config import settings
from dynamo import create_refresh_token, revoke_refresh_token, verify_refresh_token
from models import User

router = APIRouter(prefix='/auth', tags=['auth'])

GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'


@router.get('/google')
async def google_login():
    state = secrets.token_urlsafe(32)
    params = urlencode({
        'client_id': settings.google_client_id,
        'redirect_uri': f'{settings.api_base_url}/api/auth/google/callback',
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
    response: Response,
    code: str,
    state: str,
    oauth_state: str | None = Cookie(default=None),
):
    if not oauth_state or not secrets.compare_digest(state, oauth_state):
        raise HTTPException(status_code=400, detail='Invalid OAuth state')
    response.delete_cookie('oauth_state', path='/')

    async with httpx.AsyncClient() as client:
        token_res = await client.post(GOOGLE_TOKEN_URL, data={
            'code': code,
            'client_id': settings.google_client_id,
            'client_secret': settings.google_client_secret,
            'redirect_uri': f'{settings.api_base_url}/api/auth/google/callback',
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

    redirect = RedirectResponse(f'{settings.frontend_url}/auth/callback')
    set_auth_cookies(redirect, user)
    refresh_token = create_refresh_token(user)
    redirect.set_cookie(
        'refresh_token', refresh_token,
        httponly=True, secure=settings.is_prod, samesite='lax',
        max_age=60 * 60 * 24 * 30, path='/api/auth',
    )
    return redirect


@router.get('/me', response_model=User)
async def me(user: User = Depends(get_current_user)):
    return user


@router.post('/refresh')
async def refresh(response: Response, refresh_token: str | None = Cookie(default=None)):
    if not refresh_token:
        raise HTTPException(status_code=401, detail='No refresh token')

    user = verify_refresh_token(refresh_token)
    if not user:
        raise HTTPException(status_code=401, detail='Refresh token invalid or expired')

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
