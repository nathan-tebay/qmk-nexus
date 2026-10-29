# Anonymous Access + Source Download + Telemetry (2026-05-15)

Implemented optional login flow:
- `/layout`, `/keymap`, `/build` no longer require auth; `/admin` still requires login/admin.
- Login page has "Continue without login" and explains browser-local draft persistence limits.
- Header shows Sign in for anonymous users; logout clears auth/build state only and preserves `keyboard-store` draft.
- Anonymous Save/User Keyboards UI explains sign-in requirement; current draft still persists via `keyboard-store` localStorage.
- Hosted Build Firmware is disabled when anonymous; Download QMK Files uses public source ZIP endpoint.

Backend additions:
- `POST /api/keyboards/sources/zip` accepts a `KeyboardConfig`, validates build readiness, returns generated QMK source ZIP unauthenticated.
- `POST /api/telemetry/visit` records anonymous visitors as `anon_<sha256-prefix>` with empty email/name.
- Telemetry summary includes `uniqueAnonymousVisitors` and `uniqueAuthenticatedUsers`.
- QMK Configurator import has unauth preview endpoint `/api/keyboards/import/configurator/preview`; existing import returns unsaved config when unauthenticated.

Frontend additions:
- Random `qmk-nexus-visitor-id` in localStorage; anonymous app load and anonymous source download send telemetry.
- Account build history is hidden for anonymous users.

Verification:
- `npm run typecheck` passed.
- `npm run lint` passed.
- `timeout 60s pytest backend/tests/test_codegen.py backend/tests/test_validation.py backend/tests/test_telemetry.py backend/tests/test_configurator_import.py backend/tests/test_anonymous_access.py -q` passed: 94 tests, 1 existing pytest config warning.