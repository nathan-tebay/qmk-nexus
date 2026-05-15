# QMK Nexus — Project History & Build Plan

Originally developed as `tebay-qmk`, renamed to `qmk-nexus`. Unified QMK keyboard firmware editor — modernized replacement (not iteration) of QMK tooling.

## Stack (locked)
- Frontend: React 18 + TypeScript + Vite + Konva.js + Zustand
- Backend: FastAPI + Mangum (Lambda-compatible)
- Auth: Google OAuth → httpOnly cookie JWT (15-min access + 30-day refresh in DynamoDB)
- DB: SQLite per-user on S3; DynamoDB for build state + refresh tokens
- Build: Custom builder image — vendored QMK C core + own Python codegen + direct avr-gcc/arm-gcc
- Deploy: AWS Lambda + S3 + CloudFront + ECS Fargate (builds)

## 3-Stage Workflow
1. Layout + Wiring (Konva canvas — place keys, assign matrix row/col, pin assignment, LED wiring)
2. Keymap / Layers (click key → keycode, layer management, tap-dance, combos, macros)
3. Features + Build (feature module toggles, USB metadata, MCU selector, compile, poll, download)

## Completed Phases
- Phase 1–8: All core stages complete (Scaffold → Auth → Layout → QMK Analysis → Firmware Core → Codegen → Keymap → Features+Build)
- Remediation Pass (2026-04-18): All 34 findings addressed — Pydantic camelCase aliases, httpOnly cookies, OAuth CSRF, rate limiting, snapshot tests, etc.
- QMK keyboard import + index complete
- QMK-native board support complete
- AWS deployment complete
- Admin telemetry dashboard complete

## Remaining Work
- GitHub OAuth (not yet implemented)
- Tap-dance / combo / macro sequence editor UI (toggles exist, codegen stubs; no config UI)
- Frontend test suite (no Vitest/Jest setup)
- CI/CD pipeline (no `.github/workflows/`)

## Key Design Decisions
- QMK only (no Kiibohd)
- No artifact storage — user downloads .hex immediately, ephemeral build
- Desktop only — no mobile support
- GitHub OAuth added later (Google first)
- ARM builds gated in UI + backend until firmware support added
