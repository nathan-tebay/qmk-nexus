# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Unified QMK keyboard firmware editor — modernized replacement (not iteration) of QMK tooling. Three-stage workflow: Layout+Wiring → Keymap/Layers → Features+Build. Desktop-only, no mobile.

## Commands

**Frontend** (from `frontend/`):
```bash
npm install
npm run dev          # dev server on :3000
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

**Full stack** (from `docker/`):
```bash
docker compose up             # frontend + backend
docker compose --profile build build builder  # build the compiler image
```

## Architecture

### Stack
- **Frontend**: React 18 + TypeScript + Vite, Konva.js (canvas), Zustand (state), CSS Modules
- **Backend**: FastAPI + Mangum (Lambda-compatible), Pydantic v2
- **Auth**: Google OAuth → JWT (httpOnly). GitHub OAuth planned.
- **Storage**: Per-user SQLite on S3 (no global DB). Build artifacts ephemeral (download only, not stored).
- **Build**: Custom Dockerfile — vendored QMK C core + own Python codegen + direct `avr-gcc`/`arm-none-eabi-gcc`. No QMK CLI dependency.
- **Deploy target**: AWS Lambda + S3 + CloudFront

### Three Stages
Each stage is a full-screen view under `frontend/src/stages/`:

| Stage | Path | Purpose |
|-------|------|---------|
| Layout + Wiring | `stages/layout/` | Konva canvas: place/resize/rotate keys, assign matrix row/col, MCU pin mapping, LED wiring |
| Keymap / Layers | `stages/keymap/` | Click key → assign keycode, layer management, tap-dance, combos, macros |
| Features + Build | `stages/build/` | Feature module toggles, USB metadata, MCU selector, compile trigger, poll status, download |

### State Management
Single `useKeyboardStore` (Zustand) in `frontend/src/store/keyboard.ts` holds the full keyboard config. `useAuthStore` in `store/auth.ts` holds user/JWT. Both are persisted to localStorage.

### Backend Structure
```
backend/
  main.py          # FastAPI app + Mangum Lambda handler
  config.py        # Pydantic Settings (env-driven)
  auth.py          # JWT creation + get_current_user dependency
  models.py        # Pydantic models (KeyboardConfig, BuildStatus, etc.)
  routers/
    auth.py        # Google OAuth flow, /api/auth/google*
    keyboards.py   # CRUD for keyboard configs (S3 SQLite — Phase 2)
    builds.py      # Build trigger + poll, /api/builds/{id}/status
  codegen/         # Python code generator (Phase 6)
    keyboard_c.py  # → keyboard.c
    keymap_c.py    # → keymap.c
    rules.py       # → Makefile
  analysis/        # QMK keyboard pattern scanner (Phase 4)
```

### Firmware Strategy
- **Vendor** from QMK C: USB HID stack (lufa/chibios), matrix scanning, layer/keycode processing, RGB drivers
- **Replace**: QMK Python tooling, `rules.mk`/`config.h` system, keyboard definition format, keymap C codegen
- **Modularize**: Feature modules first (`rgb_matrix`, `encoder`, `oled`, `split`, `backlight`). MCU HAL layer later.
- All vendored QMK code credited to original authors.

### Build Pipeline (Phase 5+)
```
POST /api/builds/{keyboard_id}
  → Pull user SQLite from S3
  → codegen/ writes keyboard.c + keymap.c + Makefile to tempdir
  → Docker container (qmk-nexus-builder) mounts tempdir
  → avr-gcc or arm-none-eabi-gcc compiles directly
  → Client polls /api/builds/{id}/status every 2s
  → .hex/.bin returned as download response, not stored
```

### QMK Keyboard Index (Phase 9)
Mirrored from QMK `keyboards/` to S3 via `scripts/sync_index.py`. Backend serves search/browse. Used for "import existing keyboard" flow in Stage 1.

## Dev vs Prod Storage
`s3.py` checks `settings.is_prod`. In dev (`ENVIRONMENT=development`), SQLite files are stored in `/tmp/qmk-nexus-dbs/<user_id>.sqlite` — no AWS needed. In prod, pulled/pushed to S3 per request.

## Phase Tracker
See project memory for full phase checklist. Current: **Phase 2 (Auth) complete**.

Next: **Phase 6 — Python Codegen** (complete — already done in Phase 5). **Phase 7 — Stage 2: Keymap/Layers** is next.

## Key Conventions
- All API routes prefixed `/api/`
- Frontend proxies `/api` → `:8000` via Vite config
- CSS Modules for all component styles (no global classes except CSS vars in `index.css`)
- Pydantic v2 — use `model_config = SettingsConfigDict(...)` not `class Config`
- No password auth — OAuth only
