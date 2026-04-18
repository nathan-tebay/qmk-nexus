from __future__ import annotations

import logging
import subprocess
import uuid
from pathlib import Path

logger = logging.getLogger('tebay-qmk.builds')

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

import db as database
from auth import get_current_user
from codegen.generator import generate_all
import dynamo
from models import BuildStatus, User
from s3 import pull_user_db
from utils import jsonable_out, safe_name

router = APIRouter(prefix='/builds', tags=['builds'])

DOCKER_IMAGE = 'tebay-qmk-builder'
_BUILDS_ROOT = Path('/tmp/tebay-builds')
_BUILDS_ROOT.mkdir(parents=True, exist_ok=True)

_AVR_MCUS = {'atmega32u4'}


def _run_docker_build(config, build_dir: Path) -> tuple[bool, list[str]]:
    log: list[str] = []
    result = subprocess.run(
        [
            'docker', 'run', '--rm',
            '-v', f'{build_dir}:/build',
            '-e', f'TARGET_MCU={config.mcu}',
            '-e', f'KEYBOARD_NAME={safe_name(config.name)}',
            DOCKER_IMAGE,
        ],
        capture_output=True,
        text=True,
        timeout=300,
    )
    if result.stdout:
        log.extend(result.stdout.splitlines())
    if result.stderr:
        log.extend(f'[stderr] {line}' for line in result.stderr.splitlines())
    return result.returncode == 0, log


def _find_artifact(build_dir: Path) -> Path | None:
    output = build_dir / 'output'
    if not output.exists():
        return None
    for ext in ('*.hex', '*.uf2', '*.bin'):
        matches = list(output.glob(ext))
        if matches:
            return matches[0]
    return None


@router.post('/{keyboard_id}')
async def trigger_build(keyboard_id: str, user: User = Depends(get_current_user)):
    db_path = pull_user_db(user.id)
    config = database.get_keyboard(db_path, keyboard_id)
    if not config:
        raise HTTPException(status_code=404, detail='Keyboard not found')

    if config.mcu not in _AVR_MCUS:
        raise HTTPException(status_code=400, detail=f'MCU {config.mcu} not yet supported for builds')

    active = dynamo.active_builds_for_user(user.id)
    if active:
        raise HTTPException(status_code=429, detail='A build is already running for your account')

    build_id = str(uuid.uuid4())
    build_dir = _BUILDS_ROOT / build_id
    build_dir.mkdir(parents=True)

    status = BuildStatus(
        id=build_id,
        keyboard_id=keyboard_id,
        status='building',
        log=['Build started'],
    )
    # store user_id for rate limiting (not in model, inject into raw dict)
    dynamo.put_build(status)
    dynamo._builds_mem[build_id]['user_id'] = user.id  # dev shortcut

    try:
        generate_all(config, build_dir)
        status.log.append('Code generation complete')
        dynamo.update_build_fields(build_id, log=status.log)
    except Exception as exc:
        logger.exception('Codegen failed for build %s', build_id)
        status.status = 'failed'
        status.error = f'Codegen error: {exc}'
        status.log.append(status.error)
        dynamo.update_build_fields(build_id, status='failed', error=status.error, log=status.log)
        return jsonable_out(status)

    try:
        success, docker_log = _run_docker_build(config, build_dir)
        status.log.extend(docker_log)

        if success:
            artifact = _find_artifact(build_dir)
            status.status = 'success'
            status.artifact_path = str(artifact) if artifact else None
            status.artifact_available = artifact is not None
            status.log.append('Build complete')
        else:
            status.status = 'failed'
            status.error = 'Compiler returned non-zero exit code'
            status.log.append(status.error)

    except subprocess.TimeoutExpired:
        status.status = 'failed'
        status.error = 'Build timed out after 300s'
        status.log.append(status.error)
    except FileNotFoundError:
        status.status = 'failed'
        status.error = 'Docker not available — is the Docker daemon running?'
        status.log.append(status.error)
    except Exception as exc:
        logger.exception('Build error for build %s', build_id)
        status.status = 'failed'
        status.error = f'Build error: {exc}'
        status.log.append(status.error)

    dynamo.update_build_fields(
        build_id,
        status=status.status,
        log=status.log,
        error=status.error,
        artifact_path=status.artifact_path,
        artifact_available=status.artifact_available,
    )
    return jsonable_out(status)


@router.get('/{build_id}/status')
async def get_build_status(build_id: str, user: User = Depends(get_current_user)):
    raw = dynamo.get_build(build_id)
    if not raw:
        raise HTTPException(status_code=404, detail='Build not found')
    status = BuildStatus.model_validate(raw)
    return jsonable_out(status)


@router.get('/{build_id}/download')
async def download_artifact(build_id: str, user: User = Depends(get_current_user)):
    raw = dynamo.get_build(build_id)
    if not raw:
        raise HTTPException(status_code=404, detail='Build not found')

    artifact_path = raw.get('artifact_path')
    if raw.get('status') != 'success' or not artifact_path:
        raise HTTPException(status_code=400, detail='Artifact not available')

    artifact = Path(artifact_path)
    if not artifact.exists():
        raise HTTPException(status_code=404, detail='Artifact file missing')

    return FileResponse(
        path=str(artifact),
        filename=artifact.name,
        media_type='application/octet-stream',
    )
