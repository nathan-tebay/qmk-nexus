# Features Page Split (2026-05-16)

Follow-up to landing/workflow update.

Changes:
- Added `frontend/src/stages/build/FeatureStage.tsx` and `FeatureStage.module.css`.
- `/features` renders a distinct Features page with feature summary, validation issues, and `FeatureToggles`.
- Removed Features accordion from `BuildStage`; Build page is focused on metadata, build instructions, readiness, and firmware build.
- Removed `Settings` link from workspace header because no distinct settings page exists and mapping it to Build was confusing.
- `/settings` may remain as stale-link compatibility/redirect behavior if present.

## Superseded detail
Any original feature-stage demo notice was removed later with demo mode on 2026-05-16. Do not reintroduce demo notices.

Verification passed in `frontend/`: `npm run typecheck`, `npm run lint`, `npm run build`. Known output: existing envman read-only shell warnings and Vite chunk/dynamic import warnings.