from __future__ import annotations

import re
from pathlib import PurePosixPath

from codegen.validator import validate_upload
from models import KeyboardConfig, Layer

_MAX_UPSTREAM_FILES = 200
_MAX_UPSTREAM_KEY_LEN = 256

_VALID_ENCODER_DIRS = frozenset({'cw', 'ccw'})
_FEATURE_ALIASES = {
    'extrakey': 'extrakeys',
    'mousekey': 'mousekeys',
}

_HEX16_RE = re.compile(r'^0x[0-9A-Fa-f]{4}$')
_HEX_BYTE_RE = re.compile(r'^0x[0-9A-Fa-f]{2}$')
_C_IDENTIFIER_RE = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*$')
_MAKE_ATOM_RE = re.compile(r'^[A-Za-z0-9_+.-]+$')
_FEATURE_KEY_RE = re.compile(r'^[A-Z0-9_]+$')
_KEYCODE_RE = re.compile(r'^[A-Za-z0-9_(),| +.-]+$')
_QMK_PATH_RE = re.compile(r'^[A-Za-z0-9_./-]+$')
_CONTROL_RE = re.compile(r'[\x00-\x1f\x7f]')

_NUMERIC_KEYS = frozenset({
    'RGB_MATRIX_LED_COUNT',
    'RGB_MATRIX_MAXIMUM_BRIGHTNESS',
    'RGBLIGHT_LED_COUNT',
    'RGBLIGHT_LIMIT_VAL',
    'ENCODER_COUNT',
    'ENCODER_RESOLUTION',
    'OLED_BRIGHTNESS',
    'OLED_TIMEOUT',
    'BACKLIGHT_LEVELS',
    'BOOTMAGIC_LITE_ROW',
    'BOOTMAGIC_LITE_COLUMN',
    'MOUSEKEY_DELAY',
    'MOUSEKEY_INTERVAL',
    'MOUSEKEY_MAX_SPEED',
    'TAPPING_TERM',
    'COMBO_TERM',
})

_YES_NO_KEYS = frozenset({
    'RGB_MATRIX_SLEEP',
    'FORCE_NKRO',
    'SPLIT_IS_MASTER',
    'SPLIT_USB_DETECT',
    'SPLIT_TRANSPORT_MIRROR',
    'SPLIT_LAYER_STATE_ENABLE',
    'SPLIT_LED_STATE_ENABLE',
    'SPLIT_MODS_ENABLE',
    'SPLIT_RGB_MATRIX_ENABLE',
    'POINTING_DEVICE_ROTATION_90',
    'POINTING_DEVICE_INVERT_X',
    'POINTING_DEVICE_INVERT_Y',
    'BACKLIGHT_BREATHING',
    'AUDIO_CLICKY',
})

_IDENTIFIER_VALUE_KEYS = frozenset({
    'RGB_MATRIX_DRIVER',
    'RGB_MATRIX_DEFAULT_MODE',
    'RGBLIGHT_DEFAULT_MODE',
    'POINTING_DEVICE_DRIVER',
})

_DISPLAY_SIZES = frozenset({'64_32', '64_48', '128_32', '128_64'})
_SPLIT_TRANSPORTS = frozenset({'serial', 'i2c', 'uart'})


def canonical_feature_id(feature_id: str) -> str:
    return _FEATURE_ALIASES.get(feature_id, feature_id)


def _normalize_features(features: dict[str, bool]) -> dict[str, bool]:
    normalized: dict[str, bool] = {}
    for feature_id, enabled in (features or {}).items():
        canonical = canonical_feature_id(feature_id)
        normalized[canonical] = bool(enabled) or normalized.get(canonical, False)
    return normalized


def _normalize_nested_config(configs: dict[str, dict[str, str]]) -> dict[str, dict[str, str]]:
    normalized: dict[str, dict[str, str]] = {}
    for feature_id, values in (configs or {}).items():
        canonical = canonical_feature_id(feature_id)
        entry = dict(normalized.get(canonical, {}))
        for key, value in (values or {}).items():
            text = str(value).strip()
            if text:
                entry[key] = text
        normalized[canonical] = entry
    return normalized


def _matrix_extent(config: KeyboardConfig, attr: str) -> int | None:
    values = [getattr(k, attr) for k in config.keys if getattr(k, attr) is not None]
    return max(values) + 1 if values else None


def _trim_matrix_pins(config: KeyboardConfig) -> tuple[list, list]:
    row_count = _matrix_extent(config, 'row')
    col_count = _matrix_extent(config, 'col')
    row_pins = list(config.row_pins or [])
    col_pins = list(config.col_pins or [])
    if row_count is not None:
        row_pins = [p for p in row_pins if 0 <= p.row < row_count]
    if col_count is not None:
        col_pins = [p for p in col_pins if 0 <= p.col < col_count]
    return row_pins, col_pins


def _sanitize_layers(config: KeyboardConfig) -> list[Layer]:
    key_ids = {key.id for key in config.keys}
    layers: list[Layer] = []
    for layer in config.layers:
        keycodes: dict[str, str] = {}
        for key_id, code in (layer.keycodes or {}).items():
            text = str(code).strip()
            if key_id in key_ids and text:
                keycodes[key_id] = text
        layers.append(layer.model_copy(update={'keycodes': keycodes}))
    return layers


def sanitize_keyboard_config(config: KeyboardConfig) -> KeyboardConfig:
    """Drop stale or unsupported derived config that the current generator cannot use."""
    features = _normalize_features(config.features or {})
    feature_configs = _normalize_nested_config(config.feature_configs or {})
    feature_input_values = _normalize_nested_config(config.feature_input_values or {})
    row_pins, col_pins = _trim_matrix_pins(config)
    layers = _sanitize_layers(config)

    layer_ids = {layer.id for layer in config.layers}
    encoder_ids = {encoder.id for encoder in config.encoders}

    encoder_keycodes: dict[str, str] = {}
    for key, value in (config.encoder_keycodes or {}).items():
        value = str(value).strip()
        if not value:
            continue
        parts = key.split(':')
        if len(parts) != 3:
            continue
        layer_id, encoder_id, direction = parts
        if layer_id not in layer_ids or encoder_id not in encoder_ids:
            continue
        if direction not in _VALID_ENCODER_DIRS:
            continue
        encoder_keycodes[key] = value

    return config.model_copy(update={
        'features': features,
        'feature_configs': feature_configs,
        'feature_input_values': feature_input_values,
        'row_pins': row_pins,
        'col_pins': col_pins,
        'layers': layers,
        'encoder_keycodes': encoder_keycodes,
    })


def _has_control_chars(value: str) -> bool:
    return bool(_CONTROL_RE.search(value))


def _validate_pin(label: str, value: str, errors: list[str]) -> None:
    if not _C_IDENTIFIER_RE.fullmatch(value):
        errors.append(f'{label} must be a QMK pin identifier.')


def _validate_uint(label: str, value: str, errors: list[str], *, maximum: int = 1_000_000) -> None:
    if not value.isdigit():
        errors.append(f'{label} must be a non-negative integer.')
        return
    if int(value) > maximum:
        errors.append(f'{label} must be <= {maximum}.')


def _validate_keycode(label: str, value: str, errors: list[str]) -> None:
    if not _KEYCODE_RE.fullmatch(value):
        errors.append(f'{label} contains unsupported characters.')


def _is_pin_config_key(key: str) -> bool:
    return (
        key.endswith('_PIN')
        or key.endswith('_SDA')
        or key.endswith('_SCL')
        or re.match(r'^ENCODER_PAD_[AB]_\d+$', key) is not None
    )


def _validate_feature_config_value(feature_id: str, key: str, value: str, errors: list[str]) -> None:
    label = f'{feature_id}.{key}'
    if not _FEATURE_KEY_RE.fullmatch(key):
        errors.append(f'{label} is not a supported config key.')
        return
    if _has_control_chars(value):
        errors.append(f'{label} contains control characters.')
        return

    if _is_pin_config_key(key):
        _validate_pin(label, value, errors)
    elif key in _NUMERIC_KEYS:
        max_value = 16 if key == 'ENCODER_COUNT' else 1_000_000
        _validate_uint(label, value, errors, maximum=max_value)
    elif key in _YES_NO_KEYS:
        if value not in ('yes', 'no'):
            errors.append(f'{label} must be yes or no.')
    elif key == 'SPLIT_TRANSPORT':
        if value not in _SPLIT_TRANSPORTS:
            errors.append(f'{label} must be one of {", ".join(sorted(_SPLIT_TRANSPORTS))}.')
    elif key in _IDENTIFIER_VALUE_KEYS:
        if not _C_IDENTIFIER_RE.fullmatch(value):
            errors.append(f'{label} must be an identifier.')
    elif re.match(r'^OLED_I2C_ADDRESS_\d+$', key):
        if not _HEX_BYTE_RE.fullmatch(value):
            errors.append(f'{label} must be a hex byte like 0x3C.')
    elif re.match(r'^OLED_DISPLAY_SIZE_\d+$', key):
        if value not in _DISPLAY_SIZES:
            errors.append(f'{label} must be one of {", ".join(sorted(_DISPLAY_SIZES))}.')
    elif not _MAKE_ATOM_RE.fullmatch(value):
        errors.append(f'{label} contains unsupported characters.')


def validate_keyboard_config(config: KeyboardConfig) -> list[str]:
    errors: list[str] = []
    if _has_control_chars(config.name or ''):
        errors.append('Keyboard name contains control characters.')
    if _has_control_chars(config.manufacturer or ''):
        errors.append('Manufacturer contains control characters.')
    if not _MAKE_ATOM_RE.fullmatch((config.mcu or '').lower()):
        errors.append('MCU contains unsupported characters.')
    if config.layout_macro and not _C_IDENTIFIER_RE.fullmatch(config.layout_macro):
        errors.append('Layout macro must be a C identifier.')
    if config.source_mode not in ('generated', 'qmk_native', 'qmk_json'):
        errors.append('Source mode must be generated, qmk_native, or qmk_json.')
    if config.upstream_keyboard and (
        '..' in config.upstream_keyboard
        or config.upstream_keyboard.startswith('/')
        or not _QMK_PATH_RE.fullmatch(config.upstream_keyboard)
    ):
        errors.append('Upstream keyboard path contains unsupported characters.')
    if not _HEX16_RE.fullmatch(config.usb_vid or ''):
        errors.append('USB vendor ID must be a 16-bit hex value like 0xFEED.')
    if not _HEX16_RE.fullmatch(config.usb_pid or ''):
        errors.append('USB product ID must be a 16-bit hex value like 0x0000.')

    for key in config.keys:
        if key.row is not None and key.row < 0:
            errors.append(f'Key {key.id} has a negative row.')
        if key.col is not None and key.col < 0:
            errors.append(f'Key {key.id} has a negative column.')
    if len(config.keys) == 1 and config.keys[0].row is None and config.keys[0].col is None:
        if not any(p.row == 0 and p.pin.strip() for p in config.row_pins):
            errors.append('Single-key keyboards require row pin 0.')
        if not any(p.col == 0 and p.pin.strip() for p in config.col_pins):
            errors.append('Single-key keyboards require column pin 0.')
    for pin in config.row_pins:
        if pin.row < 0:
            errors.append('Matrix row pins cannot use negative row indices.')
        _validate_pin(f'row pin {pin.row}', pin.pin, errors)
    for pin in config.col_pins:
        if pin.col < 0:
            errors.append('Matrix column pins cannot use negative column indices.')
        _validate_pin(f'column pin {pin.col}', pin.pin, errors)

    oled_count = len(config.oleds or [])
    split_enabled = bool(config.features.get('split_keyboard'))

    if split_enabled:
        if oled_count > 2:
            errors.append('At most 2 OLEDs are supported on split keyboards.')
    elif oled_count > 1:
        errors.append('Multiple OLEDs are only supported when Split Keyboard is enabled.')

    if (
        config.source_mode != 'qmk_native'
        and config.features.get('rgb_matrix')
        and config.features.get('backlight')
    ):
        errors.append('RGB Matrix and Backlight are incompatible.')

    for layer_idx, layer in enumerate(config.layers):
        if _has_control_chars(layer.name or ''):
            errors.append(f'Layer {layer_idx} name contains control characters.')
        for key_id, keycode in (layer.keycodes or {}).items():
            _validate_keycode(f'Layer {layer_idx} keycode for {key_id}', keycode, errors)

    for binding, keycode in (config.encoder_keycodes or {}).items():
        _validate_keycode(f'Encoder binding {binding}', keycode, errors)

    for feature_id, values in (config.feature_configs or {}).items():
        if not config.features.get(feature_id):
            continue
        for key, value in (values or {}).items():
            _validate_feature_config_value(feature_id, key, value, errors)

    for oled in config.oleds or []:
        if oled.startup_duration < 0 or oled.idle_timeout < 0:
            errors.append('OLED timers must be non-negative.')
        if oled.logo_bytes and any(b < 0 or b > 255 for b in oled.logo_bytes):
            errors.append('OLED logo bytes must be in the range 0-255.')
        if oled.content_mode == 'custom' and oled.custom_code:
            custom_errors = validate_upload({'keyboard.c': oled.custom_code})
            errors.extend(f'oled custom code: {e}' for e in custom_errors)

    if config.custom_files:
        errors.extend(validate_upload(config.custom_files))

    if config.upstream_files:
        if len(config.upstream_files) > _MAX_UPSTREAM_FILES:
            errors.append(
                f'upstream_files has {len(config.upstream_files)} entries; max is {_MAX_UPSTREAM_FILES}.'
            )
        for rel_path in config.upstream_files:
            if not isinstance(rel_path, str) or not rel_path:
                errors.append('upstream_files keys must be non-empty strings.')
                continue
            if len(rel_path) > _MAX_UPSTREAM_KEY_LEN:
                errors.append(f'upstream_files key exceeds {_MAX_UPSTREAM_KEY_LEN} chars.')
                continue
            if (
                rel_path.startswith('/')
                or '\x00' in rel_path
                or _has_control_chars(rel_path)
                or '..' in PurePosixPath(rel_path).parts
                or '\\' in rel_path
            ):
                errors.append(f'upstream_files key {rel_path!r} contains unsupported path segments.')

    return errors


def validate_build_ready(config: KeyboardConfig) -> list[str]:
    """Checks required before emitting QMK source for compile/download."""
    errors = validate_keyboard_config(config)

    if config.source_mode == 'qmk_native':
        if not config.upstream_keyboard:
            errors.append('QMK-native builds require an upstream keyboard path.')
        if not config.upstream_files:
            errors.append('QMK-native builds require upstream source files.')
        return errors

    if config.source_mode == 'qmk_json':
        if not config.upstream_keyboard:
            errors.append('QMK-json builds require an upstream keyboard path.')
        return errors

    row_count = _matrix_extent(config, 'row')
    col_count = _matrix_extent(config, 'col')
    is_single_key_direct = (
        len(config.keys) == 1
        and config.keys[0].row is None
        and config.keys[0].col is None
    )

    if is_single_key_direct:
        return errors

    split_enabled = bool(config.features.get('split_keyboard'))

    expected_rows = row_count or 0
    expected_cols = col_count or 0
    if split_enabled and row_count and len(config.row_pins) < row_count and row_count % 2 == 0:
        expected_rows = row_count // 2
    if split_enabled and col_count and len(config.col_pins) < col_count and col_count % 2 == 0:
        expected_cols = col_count // 2

    if expected_rows:
        assigned_rows = {p.row for p in config.row_pins if p.pin.strip()}
        missing_rows = [str(row) for row in range(expected_rows) if row not in assigned_rows]
        if missing_rows:
            errors.append(f'Matrix row pins missing assignments: {", ".join(missing_rows)}.')

    if expected_cols:
        assigned_cols = {p.col for p in config.col_pins if p.pin.strip()}
        missing_cols = [str(col) for col in range(expected_cols) if col not in assigned_cols]
        if missing_cols:
            errors.append(f'Matrix column pins missing assignments: {", ".join(missing_cols)}.')

    return errors
