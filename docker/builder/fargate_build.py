#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import boto3

BUILD_ROOT = Path('/build')
LOG_PATH = Path('/tmp/build_log')


def _env(name: str) -> str:
    value = os.environ.get(name, '')
    if not value:
        raise RuntimeError(f'{name} is required')
    return value


def _s3():
    return boto3.client('s3', region_name=os.environ.get('AWS_REGION'))


def _status_key(prefix: str) -> str:
    return prefix.rstrip('/') + '/status/status.json'


def _put_status(bucket: str, prefix: str, payload: dict) -> None:
    payload.setdefault('updated_at', datetime.now(timezone.utc).isoformat())
    _s3().put_object(
        Bucket=bucket,
        Key=_status_key(prefix),
        Body=json.dumps(payload, separators=(',', ':'), default=str).encode('utf-8'),
        ContentType='application/json',
    )


def _read_log() -> list[str]:
    if not LOG_PATH.exists():
        return []
    return LOG_PATH.read_text(errors='replace').splitlines()


def _prepare_build_dir() -> None:
    BUILD_ROOT.mkdir(parents=True, exist_ok=True)
    for child in BUILD_ROOT.iterdir():
        if child.name == 'output':
            continue
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()
    (BUILD_ROOT / 'output').mkdir(exist_ok=True)


def _download_sources(bucket: str, source_key: str) -> None:
    source_zip = Path('/tmp/source.zip')
    _s3().download_file(bucket, source_key, str(source_zip))
    _prepare_build_dir()
    with zipfile.ZipFile(source_zip) as zf:
        zf.extractall(BUILD_ROOT)


def _upload_artifact(bucket: str, prefix: str) -> str | None:
    output = BUILD_ROOT / 'output'
    artifacts = sorted(
        [
            *output.glob('*.hex'),
            *output.glob('*.bin'),
            *output.glob('*.uf2'),
        ]
    )
    if not artifacts:
        return None
    artifact = artifacts[0]
    key = prefix.rstrip('/') + f'/output/{artifact.name}'
    _s3().upload_file(str(artifact), bucket, key)
    return key


def main() -> int:
    bucket = _env('BUILD_S3_BUCKET')
    prefix = _env('BUILD_S3_PREFIX')
    source_key = _env('BUILD_SOURCE_KEY')
    build_id = prefix.rstrip('/').rsplit('/', 1)[-1]

    try:
        _put_status(bucket, prefix, {
            'status': 'running',
            'build_id': build_id,
            'source_key': source_key,
            'artifact_key': None,
            'artifact_available': False,
            'log': ['Downloading build source'],
        })
        _download_sources(bucket, source_key)
        _put_status(bucket, prefix, {
            'status': 'running',
            'build_id': build_id,
            'source_key': source_key,
            'artifact_key': None,
            'artifact_available': False,
            'log': ['Build source downloaded', 'Starting QMK build'],
        })

        LOG_PATH.write_text('')
        with LOG_PATH.open('w') as log:
            proc = subprocess.run(['/usr/local/bin/build.sh'], stdout=log, stderr=subprocess.STDOUT)

        artifact_key = _upload_artifact(bucket, prefix) if proc.returncode == 0 else None
        _put_status(bucket, prefix, {
            'status': 'success' if proc.returncode == 0 else 'failed',
            'build_id': build_id,
            'source_key': source_key,
            'artifact_key': artifact_key,
            'artifact_available': bool(artifact_key),
            'log': _read_log(),
            'error': None if proc.returncode == 0 else 'QMK build failed',
        })
        return proc.returncode
    except Exception as exc:
        try:
            _put_status(bucket, prefix, {
                'status': 'failed',
                'build_id': build_id,
                'source_key': source_key,
                'artifact_key': None,
                'artifact_available': False,
                'log': _read_log(),
                'error': str(exc),
            })
        except Exception:
            pass
        print(f'[fargate] ERROR: {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
