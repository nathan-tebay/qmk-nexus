from __future__ import annotations

import io
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from config import settings
from models import KeyboardConfig
from naming import safe_name

BUILD_PREFIX_ROOT = 'builds'
BUILD_SOURCE_NAME = 'source/source.zip'
BUILD_STATUS_NAME = 'status/status.json'


def _s3_client():
    import boto3
    return boto3.client('s3', region_name=settings.aws_region)


def _ecs_client():
    import boto3
    return boto3.client('ecs', region_name=settings.aws_region)


def build_prefix(user_id: str, keyboard_id: str, build_id: str) -> str:
    safe_user = user_id.replace('/', '_')
    safe_keyboard = keyboard_id.replace('/', '_')
    return f'{BUILD_PREFIX_ROOT}/{safe_user}/{safe_keyboard}/{build_id}/'


def _zip_directory(root: Path) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(root.rglob('*')):
            if path.is_file():
                zf.write(path, path.relative_to(root).as_posix())
    return buf.getvalue()


def clear_build_prefix(bucket: str, prefix: str) -> None:
    s3 = _s3_client()
    paginator = s3.get_paginator('list_objects_v2')
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        objects = [{'Key': item['Key']} for item in page.get('Contents', [])]
        for i in range(0, len(objects), 1000):
            s3.delete_objects(Bucket=bucket, Delete={'Objects': objects[i:i + 1000]})


def put_build_status(bucket: str, prefix: str, status: dict[str, Any]) -> str:
    key = prefix + BUILD_STATUS_NAME
    body = json.dumps(status, separators=(',', ':'), default=str).encode('utf-8')
    _s3_client().put_object(
        Bucket=bucket,
        Key=key,
        Body=body,
        ContentType='application/json',
    )
    return key


def read_build_status(bucket: str, prefix: str) -> dict[str, Any]:
    obj = _s3_client().get_object(Bucket=bucket, Key=prefix + BUILD_STATUS_NAME)
    return json.loads(obj['Body'].read().decode('utf-8'))


def get_artifact(bucket: str, key: str) -> tuple[bytes, str]:
    obj = _s3_client().get_object(Bucket=bucket, Key=key)
    filename = key.rsplit('/', 1)[-1] or 'firmware.bin'
    return obj['Body'].read(), filename


def stage_build_bundle(
    *,
    user_id: str,
    keyboard_id: str,
    build_id: str,
    build_dir: Path,
    config: KeyboardConfig,
) -> dict[str, str]:
    bucket = settings.s3_bucket
    prefix = build_prefix(user_id, keyboard_id, build_id)
    source_key = prefix + BUILD_SOURCE_NAME

    clear_build_prefix(bucket, prefix)
    _s3_client().put_object(
        Bucket=bucket,
        Key=source_key,
        Body=_zip_directory(build_dir),
        ContentType='application/zip',
    )
    status_key = put_build_status(bucket, prefix, {
        'status': 'queued',
        'build_id': build_id,
        'keyboard_id': keyboard_id,
        'keyboard_name': config.name,
        'source_key': source_key,
        'artifact_key': None,
        'artifact_available': False,
        'log': ['Build queued'],
        'created_at': datetime.now(timezone.utc).isoformat(),
    })

    return {
        'bucket': bucket,
        'prefix': prefix,
        'source_key': source_key,
        'status_key': status_key,
    }


def _csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(',') if item.strip()]


def run_fargate_build(bundle: dict[str, str], config: KeyboardConfig) -> str:
    missing = [
        name for name, value in (
            ('ECS_CLUSTER', settings.ecs_cluster),
            ('ECS_TASK_DEFINITION', settings.ecs_task_definition),
            ('ECS_SUBNETS', settings.ecs_subnets),
        )
        if not value
    ]
    if missing:
        raise RuntimeError(f'Missing ECS build settings: {", ".join(missing)}')

    network_configuration: dict[str, Any] = {
        'awsvpcConfiguration': {
            'subnets': _csv(settings.ecs_subnets),
            'assignPublicIp': settings.ecs_assign_public_ip,
        },
    }
    security_groups = _csv(settings.ecs_security_groups)
    if security_groups:
        network_configuration['awsvpcConfiguration']['securityGroups'] = security_groups

    response = _ecs_client().run_task(
        cluster=settings.ecs_cluster,
        taskDefinition=settings.ecs_task_definition,
        launchType='FARGATE',
        networkConfiguration=network_configuration,
        overrides={
            'containerOverrides': [{
                'name': settings.ecs_container_name,
                'environment': [
                    {'name': 'BUILD_MODE', 'value': 'fargate'},
                    {'name': 'BUILD_S3_BUCKET', 'value': bundle['bucket']},
                    {'name': 'BUILD_S3_PREFIX', 'value': bundle['prefix']},
                    {'name': 'BUILD_SOURCE_KEY', 'value': bundle['source_key']},
                    {'name': 'TARGET_MCU', 'value': config.mcu},
                    {'name': 'KEYBOARD_NAME', 'value': safe_name(config.name)},
                    {'name': 'AWS_REGION', 'value': settings.aws_region},
                ],
            }],
        },
    )
    failures = response.get('failures') or []
    if failures:
        reason = failures[0].get('reason') or failures[0].get('arn') or 'unknown ECS failure'
        raise RuntimeError(f'ECS RunTask failed: {reason}')

    tasks = response.get('tasks') or []
    if not tasks:
        raise RuntimeError('ECS RunTask did not return a task ARN')
    return tasks[0]['taskArn']
