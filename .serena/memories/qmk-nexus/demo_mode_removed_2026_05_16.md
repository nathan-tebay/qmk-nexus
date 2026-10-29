# Demo Mode Removed (2026-05-16)

User disliked demo mode and asked to remove it.

## Removed frontend demo functionality
- Removed `/demo` route and demo config loader from `App.tsx`.
- Removed `frontend/src/demoKeyboard.ts`.
- Removed demo entry points/buttons from landing page, login page, app header, and empty layout welcome screen.
- Removed `isDemo` / `setDemoMode` Zustand store API and all build/export guards driven by demo mode.
- Removed demo-only build warnings, source ZIP disablement, feature-stage notice, badge/button styles, and related unused CSS.

## Verification
- From `frontend/`: `npm run typecheck && npm run lint && npm run build` passed.
- Build still shows existing Vite warnings about dynamic/static auth import and large chunks.

## Notes
- Anonymous/visitor functionality remains; only demo keyboard/demo mode was removed.
- Some affected files were already untracked/modified before this task due prior landing/features work; status reflects that broader in-progress work.