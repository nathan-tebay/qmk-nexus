# QMK Nexus — Suggested Commands

## Frontend
From `frontend/`:
```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm run build
```

## Backend
From `backend/`:
```bash
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --port 8000
pytest
pytest --snapshot-update
pytest tests/test_configurator_import.py -q
```

## Full stack / builder
From repo root:
```bash
./run.sh up
./run.sh frontend
./run.sh backend
./run.sh build-proxy
./run.sh builder
./run.sh down
```

## Deploy
Only when user explicitly asks:
```bash
scripts/deploy_aws.sh --all
scripts/deploy_aws.sh --backend
scripts/deploy_aws.sh --builder
scripts/aws-setup.sh
```

## Notes
- Use Podman, not Docker CLI, for all container work.
- Existing shell startup may print envman read-only warnings in sandbox; treat as noise if command itself succeeds.
- Frontend build may emit known Vite chunk/dynamic-import warnings; report if still present.