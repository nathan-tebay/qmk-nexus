# QMK Download File Import UI

Added frontend UI in `frontend/src/stages/layout/LoadKeyboardModal.tsx` to import downloaded QMK Configurator JSON keymap files from the QMK Keyboards tab. It uses existing backend endpoint `POST /api/keyboards/import/configurator`, saves a new keyboard, loads it into Zustand, and clears active build state. Added `api.postForm` in `frontend/src/api/client.ts` so FormData uploads do not force JSON Content-Type, and `qmkApi.importConfiguratorFile` in `frontend/src/api/keyboards.ts`.

Verification: `npm run typecheck` in frontend passed; `timeout 20s pytest backend/tests/test_configurator_import.py -q` passed (13 tests).