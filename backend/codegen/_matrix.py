from __future__ import annotations
from models import KeyboardConfig, KeyDef


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
