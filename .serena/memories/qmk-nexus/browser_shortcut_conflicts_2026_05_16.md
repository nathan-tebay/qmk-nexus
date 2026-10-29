# Browser Shortcut Conflict Handling (2026-05-16)

Implemented frontend keymap picker handling for browser-reserved shortcuts.

## Changed
- `frontend/src/stages/keymap/KeycodePicker.tsx`
  - Added shortcut capture mode using window `keydown` capture listener while active.
  - Converts captured physical shortcuts to QMK strings, e.g. `Ctrl+W` -> `LCTL(KC_W)`, `Alt+Left` -> `LALT(KC_LEFT)`.
  - Warns on known browser/OS conflicts: Ctrl browser commands, Alt history navigation, OS-key shortcuts, reserved function/media keys.
  - Adds manual QMK entry fallback that assigns any non-empty code string directly.
  - Intercepts known risky shortcuts in search inputs to prevent tab close/reload/navigation and offers captured assignment.
- `frontend/src/stages/keymap/KeycodePicker.module.css`
  - Added styles for capture panel, warnings, preview, and manual entry.

## Verification
- From `frontend/`: `npm run typecheck && npm run lint && npm run build` passed.
- Build still shows existing Vite warnings about dynamic/static auth import and chunk size.

## Notes
- No backend/schema changes. Assigned keycodes remain plain QMK strings.
- Manual entry remains necessary because browsers/OS may still intercept some shortcuts before the page receives them.