Production API warning `builder_qmk_commit not set in production` fixed at deploy tooling level.

Changes:
- `scripts/deploy_aws.sh` reads `backend/data/qmk_meta.json` `qmk_commit` into `BUILDER_QMK_COMMIT` by default.
- Backend deploy now preserves Lambda env and sets `BUILDER_QMK_COMMIT`, so startup mismatch checks no longer skip after deploy.
- Builder deploy now passes `--build-arg QMK_FIRMWARE_REF=$QMK_FIRMWARE_REF`, defaulting to same meta commit.
- Added CLI overrides: `--builder-qmk-commit` and `--qmk-firmware-ref`.
- `scripts/aws-setup.sh` includes `BUILDER_QMK_COMMIT` in created Lambda env / docs / save-env.
- `docker/builder/Dockerfile` now fetches QMK by ref with `git fetch`, records actual HEAD in `/qmk_firmware/.qmk_commit`.
- `docker/builder/build.sh` logs actual recorded commit via `.qmk_commit` unless `QMK_COMMIT` env overrides.

Verification:
- `bash -n scripts/deploy_aws.sh scripts/aws-setup.sh docker/builder/build.sh docker/builder/entrypoint.sh docker/builder/api.sh` passed.
- `./scripts/deploy_aws.sh --backend --dry-run` shows setting Lambda `BUILDER_QMK_COMMIT=ba9642c83dc78050c7e9764c6dcb128076aef691`.
- `./scripts/deploy_aws.sh --builder --dry-run` shows builder build arg `QMK_FIRMWARE_REF=ba9642c83dc78050c7e9764c6dcb128076aef691`.
- `./scripts/aws-setup.sh ... --create-lambda --dry-run` shows `BUILDER_QMK_COMMIT` in env.
- `git diff --check` for changed shell/docker files passed.
