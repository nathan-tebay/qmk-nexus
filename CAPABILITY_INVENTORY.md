# Nexus runtime capability inventory (TEB-14)

`baseline/capabilities.json` is the machine-readable source of truth for this milestone. Regenerate it with `python3 scripts/build_capability_inventory.py`. It contains one base row for each of the 3,717 imported board paths and module rows for the three available AVR candidates. A missing board/module/configuration tuple is **unsupported**. No row is supported yet. `experimental` on a candidate means selected for investigation, not flash or USB success.

## Evidence and boundaries

- The board catalog is `backend/data/qmk_index.json`; imported definitions are under `backend/data/keyboards/`. Importability does not establish Nexus runtime capability.
- `frontend/src/stages/build/modules.ts` exposes 21 feature toggles. `backend/models.py` stores their configuration; `backend/codegen/rules_mk.py`, `config_h.py`, and `keymap_c.py` translate many of them into QMK output. The editor also exposes layers, keycodes, macros, combos, tap dances, encoders, OLED elements, and trackballs. These are candidate requirements, not independent runtime implementations.
- Driver choices shown in the editor include RGB matrix `IS31FL3731/33/35/36/37/38`, `IS31FL3741/42/43/44/45/46`, `WS2812`; pointing devices `pmw3360`, `pmw3389`, `adns9800`, `cirque_pinnacle_spi/i2c`, `pimoroni_trackball`, `custom`; OLED `SSD1306`, `SH1106`, `ST7567`; split transport `serial`, `i2c`, `uart`; and debounce `sym_defer_g`, `sym_eager_pr`, `asym_eager_defer_pk`, `sym_defer_pr`. The exact option arrays and defaults are in `modules.ts`. Every variant is unsupported for the new runtime until tested.
- `_mcu.py` lists generated QMK targets. A listed MCU establishes only a codegen mapping. Neither that list nor the imported corpus implies independent firmware support.

## First validation targets

| Candidate | Catalog evidence | Hardware/revision | Status |
| --- | --- | --- | --- |
| AVR: `ergodox_ez/base` | atmega32u4, Halfkay bootloader; `backend/data/keyboards/ergodox_ez/base.json` | Nathan reports an Ergodox EZ; exact PCB revision, bootloader, and flashing access unconfirmed | Experimental; no flash/USB check |
| AVR: `hotdox` | atmega32u4, Atmel DFU; `backend/data/keyboards/hotdox.json` | Nathan reports Hotdox v1; catalog-path match and exact PCB revision unconfirmed | Experimental; no flash/USB check |
| AVR: `hotdox76v2` | atmega32u4, Atmel DFU, serial split; `backend/data/keyboards/hotdox76v2.json` | Nathan reports Hotdox v2; catalog-path match and exact PCB revision unconfirmed | Experimental; no flash/USB check |
| ARM: `sawnsprojects/okayu/stm32f103` | STM32F103, STM32duino; corresponding imported JSON | No physical STM32F103 board was identified in Nathan's answer | Unsupported; no physical target selected |

The AVR paths are provisional matches to Nathan's named hardware, not confirmed PCB revisions. His answer did not identify an ARM board. The firmware task can start its portable AVR implementation against `atmega32u4`, but must keep capability status unsupported until flash, enumeration, matrix, split transport where applicable, and HID checks pass on a named revision.

## Queries

```bash
python3 scripts/build_capability_inventory.py
python3 - <<'PY'
import json
x=json.load(open('baseline/capabilities.json'))
print(len(x['rows']), {s: sum(r['status']==s for r in x['rows']) for s in ('supported','experimental','unsupported')})
PY
```
