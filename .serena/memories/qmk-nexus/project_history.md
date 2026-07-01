# QMK Nexus — Project History & Build Plan

Originally developed as `tebay-qmk`, renamed to `qmk-nexus`. Unified QMK keyboard firmware editor — modernized replacement, not an iteration, of QMK tooling.

## Stack
- Frontend: React 18 + TypeScript + Vite + Konva.js + Zustand.
- Backend: FastAPI + Mangum (Lambda-compatible), Pydantic v2.
- Auth: Google OAuth → httpOnly cookie JWT (currently 7-day access token in code) + 30-day refresh token in DynamoDB; GitHub OAuth not yet implemented.
- DB/storage: SQLite per-user on S3 in prod; dev uses `/tmp/qmk-nexus-dbs`; DynamoDB for build state + refresh tokens.
- Build: Custom builder image with vendored QMK C core + own Python codegen + direct avr-gcc/arm-none-eabi-gcc; no QMK CLI dependency.
- Deploy: AWS Lambda + S3 + CloudFront + ECS Fargate for builds.

## Workflow
1. Layout + Wiring — Konva canvas: place keys, assign matrix row/col, pin assignment, LED wiring, peripherals.
2. Keymap / Layers — click key → keycode, layer management, encoder actions, OLED content.
3. Features + Build — feature toggles, USB metadata, MCU selector, compile, poll, download.

## Completed
- Core stages complete: Layout/Wiring, Keymap/Layers, Features/Build.
- Google OAuth/JWT auth complete.
- QMK keyboard import + index complete.
- QMK-native board support complete.
- AWS deployment complete.
- Admin telemetry dashboard complete.
- Anonymous access/source ZIP path complete.
- Demo mode was removed on 2026-05-16.

## Remaining / Known gaps
- GitHub OAuth.
- Tap-dance / combo / macro sequence editor UI (toggles and codegen stubs exist; no config UI).
- Frontend test suite (no Vitest/Jest setup).
- CI/CD pipeline (no `.github/workflows/`).

## Key Design Decisions
- QMK only; no Kiibohd.
- Artifacts streamed/downloaded, not retained as durable server artifacts.
- Desktop-focused; no mobile support target.
- Use Podman for all local container commands, even if docs mention Docker compatibility.
- Do not deploy, push, or update GitHub metadata unless user explicitly asks.