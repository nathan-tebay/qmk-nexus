import io
import json
import zipfile

import aws_builds
from models import KeyboardConfig


class _Body:
    def __init__(self, data: bytes):
        self.data = data

    def read(self):
        return self.data


class _Paginator:
    def __init__(self, pages):
        self.pages = pages

    def paginate(self, **_kwargs):
        return self.pages


class _FakeS3:
    def __init__(self):
        self.objects = {}
        self.deleted = []

    def get_paginator(self, _name):
        return _Paginator([{'Contents': [{'Key': 'builds/user/kb/build/old.txt'}]}])

    def delete_objects(self, Bucket, Delete):
        self.deleted.extend(item['Key'] for item in Delete['Objects'])

    def put_object(self, Bucket, Key, Body, ContentType=None):
        self.objects[(Bucket, Key)] = (Body, ContentType)

    def get_object(self, Bucket, Key):
        body, _content_type = self.objects[(Bucket, Key)]
        return {'Body': _Body(body)}


class _FakeECS:
    def __init__(self):
        self.kwargs = None

    def run_task(self, **kwargs):
        self.kwargs = kwargs
        return {'tasks': [{'taskArn': 'arn:aws:ecs:task/123'}]}


def test_stage_build_bundle_clears_prefix_and_uploads_source_zip(monkeypatch, tmp_path):
    fake_s3 = _FakeS3()
    monkeypatch.setattr(aws_builds, '_s3_client', lambda: fake_s3)
    monkeypatch.setattr(aws_builds.settings, 's3_bucket', 'bucket')

    (tmp_path / 'src').mkdir()
    (tmp_path / 'src' / 'keymap.c').write_text('KC_A')
    (tmp_path / 'upstream_overlay' / 'keyboards').mkdir(parents=True)
    (tmp_path / 'upstream_overlay' / 'keyboards' / 'rules.mk').write_text('CUSTOM_MATRIX = lite')

    bundle = aws_builds.stage_build_bundle(
        user_id='user/1',
        keyboard_id='kb',
        build_id='build',
        build_dir=tmp_path,
        config=KeyboardConfig(name='Test Board'),
    )

    assert fake_s3.deleted == ['builds/user/kb/build/old.txt']
    assert bundle['prefix'] == 'builds/user_1/kb/build/'
    source_body, source_type = fake_s3.objects[('bucket', bundle['source_key'])]
    assert source_type == 'application/zip'
    with zipfile.ZipFile(io.BytesIO(source_body)) as zf:
        assert sorted(zf.namelist()) == [
            'src/keymap.c',
            'upstream_overlay/keyboards/rules.mk',
        ]

    status = json.loads(fake_s3.objects[('bucket', bundle['status_key'])][0])
    assert status['status'] == 'queued'
    assert status['source_key'] == bundle['source_key']


def test_run_fargate_build_passes_s3_bundle_to_ecs(monkeypatch):
    fake_ecs = _FakeECS()
    monkeypatch.setattr(aws_builds, '_ecs_client', lambda: fake_ecs)
    monkeypatch.setattr(aws_builds.settings, 'ecs_cluster', 'cluster')
    monkeypatch.setattr(aws_builds.settings, 'ecs_task_definition', 'task-def')
    monkeypatch.setattr(aws_builds.settings, 'ecs_container_name', 'builder')
    monkeypatch.setattr(aws_builds.settings, 'ecs_subnets', 'subnet-1,subnet-2')
    monkeypatch.setattr(aws_builds.settings, 'ecs_security_groups', 'sg-1')
    monkeypatch.setattr(aws_builds.settings, 'ecs_assign_public_ip', 'DISABLED')
    monkeypatch.setattr(aws_builds.settings, 'aws_region', 'us-east-1')

    task_arn = aws_builds.run_fargate_build(
        {'bucket': 'bucket', 'prefix': 'builds/u/k/b/', 'source_key': 'builds/u/k/b/source/source.zip'},
        KeyboardConfig(name='My Board', mcu='atmega32u4'),
    )

    assert task_arn == 'arn:aws:ecs:task/123'
    assert fake_ecs.kwargs['launchType'] == 'FARGATE'
    assert fake_ecs.kwargs['networkConfiguration']['awsvpcConfiguration']['subnets'] == ['subnet-1', 'subnet-2']
    env = {
        item['name']: item['value']
        for item in fake_ecs.kwargs['overrides']['containerOverrides'][0]['environment']
    }
    assert env['BUILD_MODE'] == 'fargate'
    assert env['BUILD_S3_BUCKET'] == 'bucket'
    assert env['BUILD_SOURCE_KEY'] == 'builds/u/k/b/source/source.zip'
    assert env['KEYBOARD_NAME'] == 'my_board'
