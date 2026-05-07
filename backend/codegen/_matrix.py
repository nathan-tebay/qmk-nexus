from __future__ import annotations
import re
from models import KeyboardConfig, KeyDef

# QMK's JSON schema only accepts standard MCU GPIO pin names.
# GPIO expander aliases (e.g. MCP_A0) are C macros — including them in
# keyboard.json causes fatal schema rejection; and defining them in config.h
# MATRIX_COL_PINS causes QMK's data merge to pull them into matrix_pins.cols
# where they also fail validation. Skip both when any pin is a macro alias.
_JSON_SAFE_PIN = re.compile(
    r'^[A-Z][0-9]+$'           # AVR style: B6, C5
    r'|^GPIO[A-Z0-9_]+$'       # ChibiOS: GPIOB_PIN6
    r'|^GP[0-9]+$'             # RP2040: GP25
    r'|^PAL_LINE\(.+\)$'       # ChibiOS PAL_LINE macro
)


def pins_json_safe(pins: list[str]) -> bool:
    """Return True only if every non-empty pin in the list is a standard GPIO identifier."""
    return all(_JSON_SAFE_PIN.match(p) for p in pins if p.strip())


def is_single_key_direct(config: KeyboardConfig) -> bool:
    """A one-key board can be generated as a 1x1 matrix without wiring edges."""
    if len(config.keys) != 1:
        return False
    key = config.keys[0]
    return key.row is None and key.col is None and bool(config.row_pins) and bool(config.col_pins)


def matrix_keys(config: KeyboardConfig) -> list[KeyDef]:
    """Keys with row/col assigned, sorted by (row, col). Undefined keys excluded."""
    if is_single_key_direct(config):
        return [config.keys[0].model_copy(update={'row': 0, 'col': 0})]
    defined = [k for k in config.keys if k.row is not None and k.col is not None]
    return sorted(defined, key=lambda k: (k.row, k.col))  # type: ignore[arg-type]


def matrix_rows(config: KeyboardConfig) -> int:
    rows = [k.row for k in config.keys if k.row is not None]
    return max(rows) + 1 if rows else len(config.row_pins)


def matrix_cols(config: KeyboardConfig) -> int:
    cols = [k.col for k in config.keys if k.col is not None]
    return max(cols) + 1 if cols else len(config.col_pins)


def keys_by_matrix(keys: list[KeyDef]) -> dict[tuple[int, int], str]:
    return {
        (k.row, k.col): k.id
        for k in keys
        if k.row is not None and k.col is not None
    }


def resolve_rgb_led_count(config: KeyboardConfig) -> int:
    rgb = (config.feature_configs or {}).get('rgb_matrix', {})
    explicit = rgb.get('RGB_MATRIX_LED_COUNT')
    if explicit:
        try:
            return int(explicit)
        except ValueError:
            pass

    led_keys = [k for k in config.keys if k.led_index is not None]
    if led_keys:
        return len(led_keys)
    return len([k for k in config.keys if k.row is not None])
