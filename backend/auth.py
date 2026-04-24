from datetime import datetime, timedelta, timezone

from fastapi import Cookie, Depends, HTTPException, Response, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt

from config import settings
from models import User

bearer = HTTPBearer(auto_error=False)

ACCESS_EXPIRE = timedelta(days=7)


def create_access_token(user: User) -> str:
    expire = datetime.now(timezone.utc) + ACCESS_EXPIRE
    return jwt.encode(
        {
            'sub': user.id,
            'email': user.email,
            'name': user.name,
            'avatar_url': user.avatar_url,
            'exp': expire,
            'type': 'access',
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )


def _decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])


def _user_from_payload(payload: dict) -> User:
    return User(
        id=payload['sub'],
        email=payload['email'],
        name=payload['name'],
        avatar_url=payload.get('avatar_url'),
    )


def set_auth_cookies(response: Response, user: User) -> None:
    access = create_access_token(user)
    response.set_cookie(
        'access_token',
        access,
        httponly=True,
        secure=settings.is_prod,
        samesite='lax',
        max_age=int(ACCESS_EXPIRE.total_seconds()),
        path='/',
    )


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie('access_token', path='/',
                            secure=settings.is_prod, samesite='lax')


def get_current_user(
    access_token: str | None = Cookie(default=None),
    bearer_creds: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> User:
    token = access_token or (bearer_creds.credentials if bearer_creds else None)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Not authenticated')
    try:
        payload = _decode_access_token(token)
        return _user_from_payload(payload)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid or expired token')
