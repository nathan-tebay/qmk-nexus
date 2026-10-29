# Landing + Demo Workflow Update (Historical, Superseded)

Implemented 2026-05-16 from `/home/ntebay/Downloads/qmknexus-app-layout-updates.md`.

Historical changes included a public landing page, `/demo` route, reusable demo keyboard config, `isDemo`/`setDemoMode` store flags, demo badge, and demo build/source-ZIP guards.

## Superseded
Later on 2026-05-16, user disliked demo mode and requested removal. `qmk-nexus/demo_mode_removed_2026_05_16` supersedes all demo-route/demo-mode instructions here.

Current guidance:
- Keep public landing/workflow improvements if still present.
- Do not restore `/demo`, demo config loader, View Demo buttons, demo badges, `isDemo`, or demo build/export guards unless user explicitly asks.
- Anonymous/visitor workflow remains separate and current.

Original verification passed in `frontend/`: `npm run typecheck`, `npm run lint`, `npm run build`; existing Vite/envman warnings only.