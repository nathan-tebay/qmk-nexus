from __future__ import annotations

import logging
import os
import shutil
import socket
import subprocess
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
from jose import JWTError, jwt

import db as database
from auth import get_current_user
from codegen.generator import generate_all
from config import settings
from models import BuildStatus, User
from s3 import pull_user_db
from utils import jsonable_out, safe_name
from validation import sanitize_keyboard_config, validate_build_ready

logger = logging.getLogger('qmk-nexus.builds')

router = APIRouter(prefix='/builds', tags=['builds'])

_BUILDS_ROOT = Path('/tmp/tebay-builds')
_BUILDS_ROOT.mkdir(parents=True, exist_ok=True)

_AVR_MCUS = {'atmega32u4', 'atmega32u2', 'at90usb1286', 'atmega328p'}
_BUILD_TTL = 600  # seconds


# ── Build cookie (stateless, signed JWT) ─────────────────────────────────────

def _set_build_cookie(response: Response, build_id: str, keyboard_id: str, **extra) -> None:
    exp = datetime.now(timezone.utc) + timedelta(seconds=_BUILD_TTL)
    token = jwt.encode(
        {'build_id': build_id, 'keyboard_id': keyboard_id, 'exp': exp, **extra},
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
    response.delete_cookie('build_token', path='/api/builds',
                            secure=settings.is_prod, samesite='lax')


def _decode_build_cookie(build_token: str | None) -> dict | None:
    if not build_token:
        return None
    try:
        return jwt.decode(build_token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None


# ── Direct podman helpers (fallback when BUILD_PROXY_URL is not set) ──────────

DOCKER_IMAGE = 'qmk-nexus-builder'
BUILDER_CONTAINER_PORT = '8099'


def _podman_cmd() -> list[str]:
    host = os.environ.get('CONTAINER_HOST')
    if host:
        return ['podman', '--remote', f'--url={host}']
    return ['podman']


def _podman_env() -> dict:
    """Redirect XDG dirs to /tmp so rootless podman works inside a container."""
    base = dict(os.environ)
    if 'CONTAINER_HOST' not in base:
        base.setdefault('HOME', '/tmp')
        base.setdefault('XDG_CONFIG_HOME', '/tmp/.config')
        base.setdefault('XDG_DATA_HOME', '/tmp/.local/share')
        base.setdefault('XDG_RUNTIME_DIR', '/tmp/run-podman')
    return base


def _free_host_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def _spawn_direct(build_dir: Path, config) -> tuple[str, str]:
    """Returns (container_id, 'host:port')."""
    env = _podman_env()
    try:
        result = subprocess.run(
            _podman_cmd() + [
                'run', '-d',
                '-p', f'{_free_host_port()}:{BUILDER_CONTAINER_PORT}',
                '-v', f'{build_dir}:/build:z',
                '-e', f'TARGET_MCU={config.mcu}',
                '-e', f'KEYBOARD_NAME={safe_name(config.name)}',
                DOCKER_IMAGE,
            ],
            capture_output=True, text=True, check=True, env=env,
        )
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(exc.stderr.strip() or exc.stdout.strip() or str(exc)) from exc

    container_id = result.stdout.strip()

    try:
        port_out = subprocess.run(
            _podman_cmd() + ['port', container_id, BUILDER_CONTAINER_PORT],
            capture_output=True, text=True, check=True, env=env,
        )
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(f'port lookup failed: {exc.stderr.strip()}') from exc

    port = port_out.stdout.strip().rsplit(':', 1)[-1]
    return container_id, f'localhost:{port}'


def _kill_direct(container_id: str) -> None:
    try:
        subprocess.run(
            _podman_cmd() + ['rm', '-f', container_id],
            capture_output=True, check=True, env=_podman_env(),
        )
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
    config = sanitize_keyboard_config(config)

    config_errors = validate_build_ready(config)
    if config_errors:
        raise HTTPException(status_code=422, detail=config_errors)

    if config.source_mode != 'qmk_native' and config.mcu not in _AVR_MCUS:
        raise HTTPException(status_code=400, detail=f'MCU {config.mcu} not yet supported')

    build_id = str(uuid.uuid4())
    build_dir = _BUILDS_ROOT / build_id
    build_dir.mkdir(parents=True)
    build_dir.chmod(0o777)

    status = BuildStatus(id=build_id, keyboard_id=keyboard_id, status='building', log=['Build started'])

    try:
        generate_all(config, build_dir)
        (build_dir / 'src').chmod(0o777)
        status.log.append('Code generation complete')
    except Exception as exc:
        logger.exception('Codegen failed for build %s', build_id)
        status.status = 'failed'
        status.error = f'Codegen error: {exc}'
        status.log.append(status.error)
        shutil.rmtree(build_dir, ignore_errors=True)
        return jsonable_out(status)

    proxy_url = settings.build_proxy_url.rstrip('/')
    if proxy_url:
        # ── Proxy mode: delegate to build proxy (server.py) on the host ──────
        try:
            async with httpx.AsyncClient() as client:
                try:
                    health = await client.get(f'{proxy_url}/builds', timeout=3)
                    health.raise_for_status()
                except httpx.HTTPError as exc:
                    raise RuntimeError(
                        f'Build proxy unavailable at {proxy_url}. Restart it with ./run.sh build-proxy.'
                    ) from exc
                r = await client.post(
                    f'{proxy_url}/builds',
                    json={
                        'build_id': build_id,
                        'env': {
                            'TARGET_MCU': config.mcu,
                            'KEYBOARD_NAME': safe_name(config.name),
                        },
                    },
                    timeout=10,
                )
                r.raise_for_status()
            _set_build_cookie(response, build_id, keyboard_id, mode='proxy', proxy_url=proxy_url)
            status.log.append('Build queued on proxy')
        except Exception as exc:
            logger.exception('Proxy dispatch failed for build %s', build_id)
            status.status = 'failed'
            status.error = f'Proxy error: {exc}'
            status.log.append(status.error)
            shutil.rmtree(build_dir, ignore_errors=True)
    else:
        # ── Direct mode: spawn builder container locally ───────────────────
        try:
            container_id, endpoint = _spawn_direct(build_dir, config)
            _set_build_cookie(response, build_id, keyboard_id,
                              mode='direct', endpoint=endpoint, container_id=container_id)
            status.log.append('Container started')
        except Exception as exc:
            logger.exception('Container spawn failed for build %s', build_id)
            status.status = 'failed'
            status.error = f'Spawn error: {exc}'
            status.log.append(status.error)
            shutil.rmtree(build_dir, ignore_errors=True)

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

    mode = payload.get('mode', 'direct')

    if mode == 'proxy':
        proxy_url = payload['proxy_url'].rstrip('/')
        try:
            async with httpx.AsyncClient() as client:
                r = await client.get(f'{proxy_url}/builds/{build_id}/status', timeout=5)
                r.raise_for_status()
                raw = r.json()
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f'Build proxy unreachable: {exc}')

        container = raw.get('container') or {}
        status = BuildStatus(
            id=build_id,
            keyboard_id=payload.get('keyboard_id', ''),
            status=container.get('status') or raw.get('status', 'building'),
            log=container.get('log', []),
            artifact_available=container.get('artifact_available', False),
            error=raw.get('error'),
        )
    else:
        endpoint = payload['endpoint']
        try:
            async with httpx.AsyncClient() as client:
                r = await client.get(f'http://{endpoint}/status', timeout=5)
                r.raise_for_status()
                raw = r.json()
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f'Container unreachable: {exc}')

        status = BuildStatus(
            id=build_id,
            keyboard_id=payload.get('keyboard_id', ''),
            status=raw.get('status', 'building'),
            log=raw.get('log', []),
            artifact_available=raw.get('artifact_available', False),
            error=raw.get('error'),
        )

    return jsonable_out(status)


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

    mode = payload.get('mode', 'direct')
    build_dir = _BUILDS_ROOT / build_id

    if mode == 'proxy':
        proxy_url = payload['proxy_url'].rstrip('/')
        try:
            async with httpx.AsyncClient() as client:
                r = await client.get(f'{proxy_url}/builds/{build_id}/artifact', timeout=30)
                if r.status_code == 404:
                    raise HTTPException(status_code=400, detail='Artifact not ready')
                r.raise_for_status()
                content = r.content
                cd = r.headers.get('content-disposition', 'attachment; filename="firmware.bin"')
        except HTTPException:
            raise
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f'Build proxy unreachable: {exc}')

        _clear_build_cookie(response)
        # Proxy owns the container lifecycle; just clean up our local src dir
        shutil.rmtree(build_dir, ignore_errors=True)
    else:
        endpoint = payload['endpoint']
        container_id = payload.get('container_id', '')
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
        if container_id:
            _kill_direct(container_id)
        shutil.rmtree(build_dir, ignore_errors=True)

    return StreamingResponse(
        iter([content]),
        media_type='application/octet-stream',
        headers={'Content-Disposition': cd},
    )
