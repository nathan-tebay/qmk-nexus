from __future__ import annotations

import logging
import os
import subprocess
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from jose import JWTError, jwt

import db as database
from auth import get_current_user
from codegen.generator import generate_all
from config import settings
from models import BuildStatus, User
from s3 import pull_user_db
from utils import jsonable_out, safe_name

logger = logging.getLogger('qmk-nexus.builds')

router = APIRouter(prefix='/builds', tags=['builds'])

DOCKER_IMAGE = 'qmk-nexus-builder'
_BUILDS_ROOT = Path('/tmp/tebay-builds')
_BUILDS_ROOT.mkdir(parents=True, exist_ok=True)

_AVR_MCUS = {'atmega32u4'}
_BUILD_TTL = 600  # seconds — matches container self-destruct


# ── Build cookie (stateless, signed JWT) ─────────────────────────────────────

def _set_build_cookie(response: Response, build_id: str, endpoint: str, keyboard_id: str) -> None:
    exp = datetime.now(timezone.utc) + timedelta(seconds=_BUILD_TTL)
    token = jwt.encode(
        {'build_id': build_id, 'endpoint': endpoint, 'keyboard_id': keyboard_id, 'exp': exp},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    response.set_cookie(
        'build_token', token,
        httponly=True,
        secure=settings.is_prod,
        samesite='lax',
        max_age=_BUILD_TTL,
        path='/api/builds',
    )


def _clear_build_cookie(response: Response) -> None:
    response.delete_cookie('build_token', path='/api/builds')


def _decode_build_cookie(build_token: str | None) -> dict | None:
    if not build_token:
        return None
    try:
        return jwt.decode(build_token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None


# ── Container helpers ─────────────────────────────────────────────────────────

def _podman_cmd() -> list[str]:
    host = os.environ.get('CONTAINER_HOST')
    if host:
        return ['podman', '--remote', f'--url={host}']
    return ['podman']


def _spawn_local(build_dir: Path, config) -> tuple[str, str]:
    """Returns (container_id, 'host:port')."""
    try:
        result = subprocess.run(
            _podman_cmd() + [
                'run', '-d',
                '-p', '0:8080',
                '-v', f'{build_dir}:/build:Z',
                '-e', f'TARGET_MCU={config.mcu}',
                '-e', f'KEYBOARD_NAME={safe_name(config.name)}',
                DOCKER_IMAGE,
            ],
            capture_output=True, text=True, check=True,
        )
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(exc.stderr.strip() or exc.stdout.strip() or str(exc)) from exc

    container_id = result.stdout.strip()

    try:
        port_out = subprocess.run(
            _podman_cmd() + ['port', container_id, '8080'],
            capture_output=True, text=True, check=True,
        )
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(f'port lookup failed: {exc.stderr.strip()}') from exc

    port = port_out.stdout.strip().rsplit(':', 1)[-1]
    return container_id, f'localhost:{port}'


def _kill_container(container_id: str) -> None:
    try:
        subprocess.run(_podman_cmd() + ['rm', '-f', container_id],
                       capture_output=True, check=True)
    except Exception:
        pass


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post('/{keyboard_id}')
async def trigger_build(
    keyboard_id: str,
    response: Response,
    build_token: str | None = Cookie(default=None),
    user: User = Depends(get_current_user),
):
    if _decode_build_cookie(build_token):
        raise HTTPException(status_code=429, detail='A build is already running')

    db_path = pull_user_db(user.id)
    config = database.get_keyboard(db_path, keyboard_id)
    if not config:
        raise HTTPException(status_code=404, detail='Keyboard not found')

    if config.mcu not in _AVR_MCUS:
        raise HTTPException(status_code=400, detail=f'MCU {config.mcu} not yet supported')

    build_id = str(uuid.uuid4())
    build_dir = _BUILDS_ROOT / build_id
    build_dir.mkdir(parents=True)

    status = BuildStatus(id=build_id, keyboard_id=keyboard_id, status='building', log=['Build started'])

    try:
        generate_all(config, build_dir)
        status.log.append('Code generation complete')
    except Exception as exc:
        logger.exception('Codegen failed for build %s', build_id)
        status.status = 'failed'
        status.error = f'Codegen error: {exc}'
        status.log.append(status.error)
        return jsonable_out(status)

    try:
        container_id, endpoint = _spawn_local(build_dir, config)
        _set_build_cookie(response, build_id, endpoint, keyboard_id)
        status.log.append('Container started')
    except Exception as exc:
        logger.exception('Container spawn failed for build %s', build_id)
        status.status = 'failed'
        status.error = f'Spawn error: {exc}'
        status.log.append(status.error)

    return jsonable_out(status)


@router.get('/{build_id}/status')
async def get_build_status(
    build_id: str,
    build_token: str | None = Cookie(default=None),
    user: User = Depends(get_current_user),
):
    payload = _decode_build_cookie(build_token)
    if not payload or payload.get('build_id') != build_id:
        raise HTTPException(status_code=404, detail='No active build found')

    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(f'http://{payload["endpoint"]}/status', timeout=5)
            r.raise_for_status()
            return r.json()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f'Container unreachable: {exc}')


@router.get('/{build_id}/download')
async def download_artifact(
    build_id: str,
    response: Response,
    build_token: str | None = Cookie(default=None),
    user: User = Depends(get_current_user),
):
    payload = _decode_build_cookie(build_token)
    if not payload or payload.get('build_id') != build_id:
        raise HTTPException(status_code=404, detail='No active build found')

    endpoint = payload['endpoint']
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(f'http://{endpoint}/download', timeout=30)
            if r.status_code == 404:
                raise HTTPException(status_code=400, detail='Artifact not ready')
            r.raise_for_status()
            content = r.content
            cd = r.headers.get('content-disposition', 'attachment; filename="firmware.bin"')
    except HTTPException:
        raise
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f'Container unreachable: {exc}')

    _clear_build_cookie(response)

    return StreamingResponse(
        iter([content]),
        media_type='application/octet-stream',
        headers={'Content-Disposition': cd},
    )
