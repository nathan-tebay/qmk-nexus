import json

from codegen.generator import generate_all, generate_sources
from codegen.keymap_c import generate_keymap_c
from models import KeyboardConfig, KeyDef, Layer
from validation import validate_build_ready


def _native_config() -> KeyboardConfig:
    return KeyboardConfig(
        name='Moonlander',
        mcu='stm32f303',
        usb_vid='0x3297',
        usb_pid='0x1969',
        keys=[
            KeyDef(id='k0', row=0, col=0, x=0, y=0),
            KeyDef(id='k1', row=0, col=1, x=1, y=0),
        ],
        layers=[Layer(id='layer0', name='Base', keycodes={'k0': 'KC_A', 'k1': 'KC_B'})],
        layout_macro='LAYOUT_moonlander',
        source_mode='qmk_native',
        upstream_keyboard='zsa/moonlander',
        upstream_files={
            'keyboards/zsa/moonlander/keyboard.json': '{"keyboard_name":"Moonlander"}',
            'keyboards/zsa/moonlander/rules.mk': 'CUSTOM_MATRIX = lite\nSRC += matrix.c\n',
            'keyboards/zsa/moonlander/matrix.c': 'void matrix_init_custom(void) {}\n',
            'drivers/gpio/mcp23018.c': 'void mcp23018_init(void) {}\n',
        },
    )


def test_native_qmk_build_ready_skips_generated_pin_requirements():
    config = _native_config()

    assert validate_build_ready(config) == []


def test_native_qmk_keymap_uses_imported_layout_macro():
    text = generate_keymap_c(_native_config())

    assert 'LAYOUT_moonlander(' in text
    assert 'KC_A, KC_B' in text


def test_native_qmk_sources_emit_manifest_and_overlay(tmp_path):
    config = _native_config()

    files = generate_sources(config)
    manifest = json.loads(files['qmk_native.json'])

    assert manifest == {'keyboard': 'zsa/moonlander', 'keymap': 'nexus'}
    assert set(files) == {'qmk_native.json', 'keymap.c'}

    generate_all(config, tmp_path)

    assert (tmp_path / 'src' / 'qmk_native.json').exists()
    assert (tmp_path / 'src' / 'keymap.c').exists()
    assert (tmp_path / 'upstream_overlay' / 'keyboards' / 'zsa' / 'moonlander' / 'rules.mk').exists()
    assert (tmp_path / 'upstream_overlay' / 'drivers' / 'gpio' / 'mcp23018.c').exists()
