# Split Bootmagic handling

Reviewed 2026-05-16. QMK split keyboards can use separate right-half Bootmagic defines (`BOOTMAGIC_ROW_RIGHT`/`BOOTMAGIC_COLUMN_RIGHT`; older QMK also used `BOOTMAGIC_LITE_ROW_RIGHT`/`BOOTMAGIC_LITE_COLUMN_RIGHT`). QMK's split matrix uses global matrix row indices; right-half rows are typically offset by rows-per-half.

QMK Nexus now stores separate right-half Bootmagic config values (`BOOTMAGIC_LITE_ROW_RIGHT`, `BOOTMAGIC_LITE_COLUMN_RIGHT`) and the backend emits both old and current right-half define names for compatibility. The UI picker treats keys with row >= totalRows/2 as right-half when split is enabled and writes the right-half values instead of overwriting the left/default values.
