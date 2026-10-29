# QMK Download Zip Import

Extended `POST /api/keyboards/import/configurator` in `backend/routers/keyboards.py` to accept either raw QMK Configurator JSON or ZIP downloads. ZIP parsing searches `.json` entries for a payload containing `keyboard`, `layout`, and `layers`, preferring a single `keymap.json` when multiple candidate files exist. Upload limit: 1 MB archive, 256 KB JSON entry, with zip-uncompressed limit guarding zip bombs.

Frontend `LoadKeyboardModal.tsx` file picker now accepts `.json,.zip,application/json,application/zip` and labels the importer as JSON or ZIP.

Tests added in `backend/tests/test_configurator_import.py` for ZIP success and ZIP-without-keymap 422. Verification: `timeout 20s pytest backend/tests/test_configurator_import.py -q -vv` passed 15 tests; `npm run typecheck` passed.