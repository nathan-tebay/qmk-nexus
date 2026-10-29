# QMK Nexus — Current State Guardrail

Use this memory when older dated qmk-nexus task notes conflict.

## Product/runtime
- Browser-based QMK firmware editor: visual Layout/Matrix, Keymap, Features, Build workflow.
- Stack: React 18 + TypeScript + Vite/Konva/Zustand; FastAPI/Mangum; AWS Lambda/S3/CloudFront/ECS builder.
- QMK-only; no Kiibohd.
- Desktop-focused; no mobile support target.
- Anonymous access is supported for layout/keymap/build pages, with hosted firmware build disabled for anonymous users and public QMK source ZIP download available.

## Demo mode
- Demo keyboard/demo route was removed on 2026-05-16 by explicit user feedback.
- Ignore older `landing_demo_workflow_2026_05_16` instructions that mention `/demo`, demo badges, demo build guards, or View Demo buttons.
- Anonymous/visitor workflow remains; demo mode does not.

## Features page / toggles
- `/features` is a distinct FeatureStage; Build is focused on metadata/readiness/build.
- Feature toggle input handling now includes conditional fields and repeated-per-count fields in current code.
- Split + RGB matrix remain user-priority defaults for keyboard work.

## Build/firmware rules
- Maximum physical keys per keyboard config: 250.
- Native QMK keymap generation must preserve upstream layout argument order for qmk-native boards.
- Firmware size warnings are advisory and should not block builds unless validation separately fails.
- ARM builds remain gated until firmware support is implemented.

## Deployment/safety
- Do not deploy, push, or edit GitHub repo metadata unless user explicitly asks.
- Use Podman, not Docker CLI.
- Prefer focused verification: frontend `npm run typecheck`, `npm run lint`, `npm run build`; backend targeted pytest; `git diff --check`.