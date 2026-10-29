# Key Count Limit

As of 2026-05-16, QMK Nexus enforces a maximum of 250 physical keys per keyboard config.

Implementation points:
- Backend `validation.MAX_KEY_COUNT` rejects configs over 250 in `validate_keyboard_config`.
- QMK index import and Configurator import preview/import reject imports over 250 before loading/saving.
- Frontend `MAX_KEY_COUNT` in `validateKeyboardConfig.ts` blocks save/build validation over 250.
- Layout add-key buttons disable at the limit; paste truncates to available slots; import/load buttons disable for known over-limit keyboards.
