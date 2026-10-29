Implemented frontend firmware size estimator and warning flow.

Files:
- `frontend/src/utils/firmwareSizeEstimate.ts`: conservative local estimate with MCU flash budgets, feature costs, layers, key count, RGB LED counts, OLED count/logo bytes, encoder count, combos, macros, and custom files.
- `frontend/src/stages/build/useBuildValidation.ts`: exposes `firmwareSize` on build validation.
- `frontend/src/stages/build/BuildStage.tsx`: summary row for estimated firmware size.
- `frontend/src/stages/build/BuildPanel.tsx`: warning notice for near/over/unknown estimates without blocking build.
- `frontend/src/components/Layout.tsx`: intercepts top stage nav when leaving `/keymap`; shows modal if estimate is near/over; continue anyway allowed.

Verification:
- `npm run typecheck` passed.
- `npm run build` passed; existing Vite chunk warnings only.
