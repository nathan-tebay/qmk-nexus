# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Unified QMK keyboard firmware editor — modernized replacement (not iteration) of QMK tooling. Three-stage workflow: Layout+Wiring → Keymap/Layers → Features+Build. Desktop-only, no mobile.

## Commands

**Frontend** (from `frontend/`):
```bash
npm install
npm run dev          # dev server on :3001
npm run build        # production build
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
```

**Backend** (from `backend/`):
```bash
pip install -r requirements.txt
cp .env.example .env  # fill in credentials
uvicorn main:app --reload --port 8000
```

**Full stack** (from repo root via `run.sh`):
```bash
./run.sh dev          # podman compose up frontend + backend
./run.sh build-proxy  # start local build proxy on :8088
./run.sh up           # background stack + auto-start build proxy
./run.sh builder      # build the qmk-nexus-builder image
./run.sh down         # stop everything + kill proxy
```

**Tests** (from `backend/`):
```bash
pytest                        # run all tests
pytest --snapshot-update      # regenerate golden files
```

**Deploy** (from `scripts/`):
```bash
./deploy_aws.sh --all         # build + push + deploy all Lambda functions
./deploy_aws.sh --backend     # backend Lambda only
./deploy_aws.sh --builder     # builder ECS image only
```

## Architecture

### Stack
- **Frontend**: React 18 + TypeScript + Vite (port 3001), Konva.js (canvas), Zustand (state), CSS Modules
- **Backend**: FastAPI + Mangum (Lambda-compatible), Pydantic v2
- **Auth**: Google OAuth → JWT (httpOnly cookie, 7-day) + refresh token (30-day, DynamoDB-backed). GitHub OAuth not yet implemented.
- **Storage**: Per-user SQLite on S3 (no global DB). Dev: `/tmp/qmk-nexus-dbs/<user_id>.sqlite`. Build artifacts ephemeral (stream-download only).
- **Build**: Custom builder image — vendored QMK C core + own Python codegen + direct `avr-gcc`/`arm-none-eabi-gcc`. No QMK CLI dependency.
- **Deploy target**: AWS Lambda + S3 + CloudFront + ECS Fargate (for builds)

### Three Stages
Each stage is a full-screen view under `frontend/src/stages/`:

| Stage | Path | Status | Purpose |
|-------|------|--------|---------|
| Layout + Wiring | `stages/layout/` | Complete | Konva canvas: place/resize/rotate keys, assign matrix row/col edges, MCU pin mapping, LED wiring, peripheral placement |
| Keymap / Layers | `stages/keymap/` | Complete | Click key → assign keycode, layer management, encoder CW/CCW keycodes, OLED content blocks |
| Features + Build | `stages/build/` | Complete | 15 feature module toggles, USB metadata, MCU selector, compile trigger, poll status, download artifact |

### State Management
- `useKeyboardStore` (Zustand + localStorage persist) in `frontend/src/store/keyboard.ts` — full `KeyboardConfig`, selection state, active layer. Union-Find for matrix row/col derivation. LED chain traversal for LED indices.
- `useAuthStore` (`store/auth.ts`) — user object + JWT state
- `useBuildStore` (`store/build.ts`) — active build ID + status (persists across page refresh)
- `useKeyboardSync` (`store/useKeyboardSync.ts`) — `save()`/`load()` wrappers over API

### Backend Structure
```
backend/
  main.py          # FastAPI app + Mangum Lambda handler
  config.py        # Pydantic Settings (env-driven)
  auth.py          # JWT creation + get_current_user dependency
  models.py        # All Pydantic models (KeyboardConfig, BuildStatus, etc.)
  db.py            # SQLite CRUD (per-user keyboard storage)
  dynamo.py        # DynamoDB: build state + refresh token storage
  s3.py            # Per-user SQLite on S3; dev uses /tmp
  aws_builds.py    # S3 build staging + ECS Fargate launch
  telemetry.py     # User/build analytics (DynamoDB in prod)
  validation.py    # Input sanitization + build-ready checks
  naming.py        # safe_name() utility
  routers/
    auth.py        # /api/auth/* — Google OAuth, refresh, logout
    keyboards.py   # /api/keyboards/* — CRUD + source file upload/reset
    builds.py      # /api/builds/* — trigger, poll status, download artifact
    qmk.py         # /api/qmk/* — index search + keyboard import
    telemetry.py   # /api/telemetry/summary (admin only)
  codegen/
    generator.py   # Orchestrator: generate_sources() + generate_all()
    keyboard_c.py  # → {kb}.c (matrix scan init, OLED callbacks)
    keyboard_h.py  # → {kb}.h (include guards, LAYOUT passthrough)
    config_h.py    # → config.h (MATRIX pins, feature #defines)
    rules_mk.py    # → rules.mk (MCU, feature flags)
    keymap_c.py    # → keymap.c (layer arrays, encoder_map, enums)
    info_json.py   # → keyboard.json/info.json (key positions + matrix)
    _matrix.py     # Shared: matrix_keys(), matrix_rows(), matrix_cols()
    _mcu.py        # Shared: MCU_ARCH, MCU_QMK_NAME, MCU_BOOTLOADER maps
    validator.py   # Upload allowlist + size limits
  analysis/        # Offline QMK feature scanner (not a live route)
  tests/           # pytest test suite with golden snapshots
```

### Build Pipeline
Three runtime modes selected by environment config:

```
POST /api/builds/{keyboard_id}
  → Pull user SQLite from S3 (or /tmp in dev)
  → codegen/ generates all source files to tempdir
  → One of three build modes:
      Proxy mode  (BUILD_PROXY_URL set): POST to server.py → Podman container
      Direct mode (fallback):            spawn Podman container via subprocess
      ECS mode    (build_runner=ecs):    stage ZIP to S3 → Fargate RunTask
  → avr-gcc or arm-none-eabi-gcc compiles directly
  → Client polls /api/builds/{id}/status every 2s (build cookie on client)
  → .hex/.bin streamed as download response, not stored
```

QMK-native builds (`source_mode='qmk_native'`): only `qmk_native.json` + `keymap.c` generated; builder overlays upstream files from S3 onto the QMK source tree.

Supported MCUs for generated path: `atmega32u4`, `atmega32u2`, `at90usb1286`, `atmega328p`, `stm32f072`, `stm32f103`, `stm32f303`, `mk20dx256`, `rp2040`.

### QMK Keyboard Index
Built from local QMK checkout via `scripts/build_qmk_index.py` → `backend/data/qmk_index.json` + per-keyboard blobs in `backend/data/keyboards/`. Backend serves `/api/qmk/search` + `/api/qmk/import/{path}`. Import handles custom matrix pin extraction (regex-based C source parsing), split inference, LED indices from rgb_matrix layout, and default keymap import.

## Dev vs Prod Storage
`s3.py` checks `settings.is_prod`. In dev (`ENVIRONMENT=development`), SQLite files are stored in `/tmp/qmk-nexus-dbs/<user_id>.sqlite` — no AWS needed. In prod, pulled/pushed to S3 per request. DynamoDB used for refresh tokens and build state in prod; in-memory dicts in dev.

## Implementation Status

All core phases are complete:

| Area | Status |
|------|--------|
| Stage 1 — Layout + Wiring | Complete |
| Stage 2 — Keymap / Layers | Complete |
| Stage 3 — Features + Build | Complete |
| Google OAuth + JWT auth | Complete |
| Keyboard CRUD + S3 storage | Complete |
| Python codegen (all 6 files) | Complete |
| Build pipeline (proxy + ECS) | Complete |
| QMK keyboard import + index | Complete |
| QMK-native board support | Complete |
| AWS deployment (Lambda + Fargate) | Complete |
| Admin telemetry dashboard | Complete |

**Not yet implemented:**
- GitHub OAuth
- Tap-dance / combo / macro sequence editor UI (toggles exist, codegen stubs exist; no config UI)
- Frontend test suite (no Vitest/Jest setup)
- CI/CD pipeline (no `.github/workflows/`)

## Key Conventions
- All API routes prefixed `/api/`
- Frontend proxies `/api` → `:8000` via Vite config (`vite.config.ts`); `xfwd: true` for OAuth redirect detection
- CSS Modules for all component styles (no global classes except CSS vars in `index.css`)
- Pydantic v2 — use `model_config = SettingsConfigDict(...)` not `class Config`
- All models use camelCase alias generator (`to_camel`) for JSON serialization
- No password auth — OAuth only
- `podman` not `docker` for all container commands
- Golden snapshot tests in `backend/tests/goldens/`; regenerate with `pytest --snapshot-update`
