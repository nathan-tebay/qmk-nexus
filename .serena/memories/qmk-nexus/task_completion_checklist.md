# QMK Nexus — Task Completion Checklist

For coding changes:

1. Do not commit, push, deploy, or edit GitHub repo metadata unless user explicitly asks.
2. Use Podman for container work; do not suggest Docker CLI.
3. Run focused checks for changed area:
   - Frontend: `npm run typecheck`, `npm run lint`, and `npm run build` for UI/schema changes.
   - Backend: targeted `pytest ... -q`; full `pytest` for cross-cutting backend/codegen/auth changes.
   - Shell scripts: `bash -n <touched scripts>`.
   - Lambda proxy JS: `node --check` and `node --test` for related files.
4. Run `git diff --check` after edits.
5. For generated QMK/codegen changes, update/verify golden snapshots intentionally.
6. For qmk-native keymap work, preserve upstream layout argument order.
7. For feature-toggle work, verify conditional and repeated fields still work.
8. For visual/UI behavior, also state when browser manual review is needed.
9. Report known warnings separately from new failures.