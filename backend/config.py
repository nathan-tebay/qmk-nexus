from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')

    google_client_id: str = ''
    google_client_secret: str = ''
    jwt_secret: str = 'dev-secret-change-in-prod'
    jwt_algorithm: str = 'HS256'

    s3_bucket: str = 'qmk-nexus'
    aws_region: str = 'us-east-1'

    frontend_url: str = 'http://localhost:3001'
    api_base_url: str = 'http://localhost:8000'

    # When set, builds are delegated to the local build proxy (server.py).
    # Run it with: ./run.sh build-proxy
    build_proxy_url: str = ''

    # Production build runner. Use "proxy" for the local/HTTP build proxy or
    # "ecs" to stage sources in S3 and invoke an ECS/Fargate task.
    build_runner: str = 'proxy'
    ecs_cluster: str = ''
    ecs_task_definition: str = ''
    ecs_container_name: str = 'qmk-nexus-builder'
    ecs_subnets: str = ''
    ecs_security_groups: str = ''
    ecs_assign_public_ip: str = 'DISABLED'

    builder_qmk_commit: str | None = None   # QMK commit baked into builder image
    qmk_version_mismatch: str = 'warn'      # 'warn' or 'error'

    admin_email: str = ''                   # Email required for /api/telemetry/summary access

    environment: str = 'development'

    @property
    def is_prod(self) -> bool:
        return self.environment == 'production'

    @model_validator(mode='after')
    def _check_prod_secret(self) -> 'Settings':
        if self.is_prod and self.jwt_secret == 'dev-secret-change-in-prod':
            raise ValueError('jwt_secret must be set in production')
        return self


settings = Settings()
