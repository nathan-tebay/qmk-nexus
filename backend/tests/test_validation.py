from codegen.generator import generate_all
from codegen.keycodes import TRIVIAL_KEYCODES
from codegen.keyboard_c import generate_keyboard_c
from models import ColPin, EncoderElement, KeyboardConfig, KeyDef, Layer, MatrixPin, OledElement
from validation import _FEATURE_ALIASES
from validation import sanitize_keyboard_config, validate_build_ready, validate_keyboard_config


def test_feature_aliases_match_frontend_contract():
    assert _FEATURE_ALIASES == {
        'extrakey': 'extrakeys',
        'mousekey': 'mousekeys',
    }


def test_trivial_keycodes_include_configurator_no_key_alias():
    assert TRIVIAL_KEYCODES == frozenset({'KC_TRNS', 'KC_NO', 'XXXXXXX', ''})


def test_sanitize_keyboard_config_drops_unsupported_encoder_press_binding():
    config = KeyboardConfig(
        layers=[Layer(id='layer0', name='Base', keycodes={})],
        encoders=[EncoderElement(id='enc0')],
        encoder_keycodes={
            'layer0:enc0:cw': 'KC_VOLU',
            'layer0:enc0:ccw': 'KC_VOLD',
            'layer0:enc0:press': 'KC_MUTE',
        },
    )

    sanitized = sanitize_keyboard_config(config)

    assert sanitized.encoder_keycodes == {
        'layer0:enc0:cw': 'KC_VOLU',
        'layer0:enc0:ccw': 'KC_VOLD',
    }


def test_validate_keyboard_config_rejects_multiple_oleds_without_split():
    config = KeyboardConfig(
        layers=[Layer(id='layer0', name='Base', keycodes={})],
        features={'oled': True, 'split_keyboard': False},
        oleds=[OledElement(id='oled0'), OledElement(id='oled1')],
    )

    errors = validate_keyboard_config(config)

    assert errors == ['Multiple OLEDs are only supported when Split Keyboard is enabled.']


def test_sanitize_keyboard_config_normalizes_feature_aliases_and_trims_stale_pins():
    config = KeyboardConfig(
        layers=[Layer(id='layer0', name='Base', keycodes={})],
        keys=[KeyDef(id='key0', x=0, y=0, row=0, col=0)],
        row_pins=[MatrixPin(row=0, pin='D0'), MatrixPin(row=3, pin='D3')],
        col_pins=[ColPin(col=0, pin='D1'), ColPin(col=3, pin='D4')],
        features={'extrakey': True, 'mousekey': True},
        feature_configs={'mousekey': {'MOUSEKEY_DELAY': ' 500 '}},
    )

    sanitized = sanitize_keyboard_config(config)

    assert sanitized.features['extrakeys'] is True
    assert sanitized.features['mousekeys'] is True
    assert sanitized.row_pins == [MatrixPin(row=0, pin='D0')]
    assert sanitized.col_pins == [ColPin(col=0, pin='D1')]
    assert sanitized.feature_configs == {'mousekeys': {'MOUSEKEY_DELAY': '500'}}


def test_validate_keyboard_config_rejects_unsafe_codegen_values():
    config = KeyboardConfig(
        usb_vid='0xFEED\n',
        layers=[Layer(id='layer0', name='Base', keycodes={'key0': 'KC_A;'})],
        keys=[KeyDef(id='key0', x=0, y=0, row=0, col=0)],
        row_pins=[MatrixPin(row=0, pin='D0, D1')],
        features={'rgb_matrix': True},
        feature_configs={'rgb_matrix': {'RGB_MATRIX_MAXIMUM_BRIGHTNESS': '255;'}},
    )

    errors = validate_keyboard_config(config)

    assert 'USB vendor ID must be a 16-bit hex value like 0xFEED.' in errors
    assert 'row pin 0 must be a QMK pin identifier.' in errors
    assert 'Layer 0 keycode for key0 contains unsupported characters.' in errors
    assert 'rgb_matrix.RGB_MATRIX_MAXIMUM_BRIGHTNESS must be a non-negative integer.' in errors


def test_validate_keyboard_config_rejects_incompatible_features():
    config = KeyboardConfig(
        layers=[Layer(id='layer0', name='Base', keycodes={})],
        features={'rgb_matrix': True, 'backlight': True},
    )

    errors = validate_keyboard_config(config)

    assert 'RGB Matrix and Backlight are incompatible.' in errors


def test_validate_single_key_requires_two_pins():
    config = KeyboardConfig(
        keys=[KeyDef(id='only', x=0, y=0)],
        layers=[Layer(id='layer0', name='Base', keycodes={})],
        row_pins=[MatrixPin(row=0, pin='B0')],
    )

    errors = validate_keyboard_config(config)

    assert 'Single-key keyboards require column pin 0.' in errors


def test_validate_build_ready_requires_pins_for_used_matrix_rows_and_columns():
    config = KeyboardConfig(
        keys=[
            KeyDef(id='k0', x=0, y=0, row=0, col=0),
            KeyDef(id='k1', x=1, y=0, row=0, col=1),
            KeyDef(id='k2', x=0, y=1, row=1, col=0),
        ],
        layers=[Layer(id='layer0', name='Base', keycodes={})],
        row_pins=[MatrixPin(row=0, pin='B0')],
        col_pins=[ColPin(col=0, pin='D0')],
    )

    errors = validate_build_ready(config)

    assert 'Matrix row pins missing assignments: 1.' in errors
    assert 'Matrix column pins missing assignments: 1.' in errors


def test_validate_keyboard_config_allows_saving_incomplete_matrix_drafts():
    config = KeyboardConfig(
        keys=[KeyDef(id='k0', x=0, y=0, row=0, col=0)],
        layers=[Layer(id='layer0', name='Base', keycodes={})],
    )

    assert validate_keyboard_config(config) == []


def test_generate_all_sanitizes_keyboard_name_for_written_files(tmp_path):
    config = KeyboardConfig(
        name='../Bad Name',
        layers=[Layer(id='layer0', name='Base', keycodes={})],
    )

    generate_all(config, tmp_path)

    src = tmp_path / 'src'
    assert (src / 'bad_name.c').exists()
    assert (src / 'bad_name.h').exists()
    assert all(path.parent == src for path in src.iterdir())


def test_generate_keyboard_c_escapes_layer_names_and_dispatches_split_oleds():
    config = KeyboardConfig(
        layers=[Layer(id='layer0', name='Base "A"\nB', keycodes={})],
        features={'oled': True, 'split_keyboard': True},
        oleds=[
            OledElement(id='oled0', active_blocks=['layer_name']),
            OledElement(id='oled1', active_blocks=['master_slave']),
        ],
    )

    c = generate_keyboard_c(config)

    assert 'if (is_keyboard_master()) {' in c
    assert '} else {' in c
    assert 'PSTR("Base \\"A\\" B")' in c
    assert 'case 0: oled_write_P' in c
