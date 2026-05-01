import telemetry
from dynamo import _builds_mem
from models import BuildStatus, User


def setup_function():
    _builds_mem.clear()


def test_summary_counts_unique_users_and_final_build_statuses():
    user = User(id='google_1', email='one@example.test', name='One')
    telemetry.record_user_seen(user)
    telemetry.record_user_seen(user)
    telemetry.record_user_seen(User(id='google_2', email='two@example.test', name='Two'))

    telemetry.record_build_final(
        BuildStatus(id='build-1', keyboard_id='kb-1', status='success', artifact_available=True),
        user.id,
    )
    telemetry.record_build_final(
        BuildStatus(id='build-2', keyboard_id='kb-2', status='failed', error='nope'),
        user.id,
    )
    telemetry.record_build_final(
        BuildStatus(id='build-3', keyboard_id='kb-3', status='building'),
        user.id,
    )

    summary = telemetry.summary()

    assert summary['uniqueUsers'] == 2
    assert {item['email'] for item in summary['users']} == {'one@example.test', 'two@example.test'}
    assert summary['builds']['total'] == 2
    assert summary['builds']['byFinalStatus'] == {'failed': 1, 'success': 1}
    assert {item['buildId'] for item in summary['builds']['completed']} == {'build-1', 'build-2'}


def test_final_build_records_are_idempotent_per_build_id():
    user = User(id='google_1', email='one@example.test', name='One')
    status = BuildStatus(id='build-1', keyboard_id='kb-1', status='failed', error='first')

    telemetry.record_user_seen(user)
    telemetry.record_build_final(status, user.id)
    telemetry.record_build_final(status.model_copy(update={'error': 'second'}), user.id)

    summary = telemetry.summary()

    assert summary['builds']['total'] == 1
    assert summary['builds']['byFinalStatus']['failed'] == 1
