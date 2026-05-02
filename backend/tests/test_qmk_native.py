import json
import sys
import types

from codegen.generator import generate_all, generate_sources
from codegen.keymap_c import generate_keymap_c
from models import ColPin, KeyboardConfig, KeyDef, Layer, MatrixPin
from validation import validate_build_ready


if 'fastapi' not in sys.modules:
    fastapi = types.ModuleType('fastapi')

    class _APIRouter:
        def __init__(self, *args, **kwargs):
            pass

        def get(self, *args, **kwargs):
            def decorator(func):
                return func
            return decorator

        def post(self, *args, **kwargs):
            def decorator(func):
                return func
            return decorator

    class _HTTPException(Exception):
        def __init__(self, status_code: int, detail: str):
            self.status_code = status_code
            self.detail = detail

    def _query(default='', **_kwargs):
        return default

    fastapi.APIRouter = _APIRouter
    fastapi.HTTPException = _HTTPException
    fastapi.Query = _query
    sys.modules['fastapi'] = fastapi

from routers.qmk import _convert_to_config


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


def test_native_qmk_build_ready_allows_upstream_feature_combinations():
    config = _native_config().model_copy(update={
        'features': {'rgb_matrix': True, 'backlight': True},
    })

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


def test_import_custom_lite_matrix_uses_native_qmk_fallback():
    config = _convert_to_config('ergodox_ez/base', {
        'keyboard_name': 'ErgoDox EZ',
        'processor': 'atmega32u4',
        'matrix_pins': {'custom_lite': True},
        'layouts': {
            'LAYOUT_ergodox': {
                'layout': [
                    {'matrix': [0, 0], 'x': 0, 'y': 0},
                    {'matrix': [9, 0], 'x': 1, 'y': 0},
                ],
            },
        },
        '_nexus': {
            'source_mode': 'qmk_native',
            'upstream_keyboard': 'ergodox_ez/base',
            'upstream_files': {'keyboards/ergodox_ez/base/keyboard.json': '{}'},
        },
    })

    assert config.source_mode == 'qmk_native'
    assert config.upstream_keyboard == 'ergodox_ez/base'
    assert config.features['split_keyboard'] is True
    assert validate_build_ready(config) == []


def test_import_custom_matrix_without_overlay_defaults_to_qmk_json():
    """Custom matrix keyboards without an explicit `_nexus` block now fall
    through to ``qmk_json`` — pin scanning is delegated to the QMK tree."""
    config = _convert_to_config('vendor/custom', {
        'keyboard_name': 'Custom Matrix',
        'matrix_pins': {'custom': True},
        'layouts': {
            'LAYOUT_custom': {
                'layout': [{'matrix': [0, 0], 'x': 0, 'y': 0}],
            },
        },
    })

    errors = validate_build_ready(config)

    assert config.source_mode == 'qmk_json'
    assert config.upstream_keyboard == 'vendor/custom'
    assert errors == []


def test_import_tolerates_null_matrix_pins_before_native_fallback():
    config = _convert_to_config('keychron/example', {
        'keyboard_name': 'Native With Null Pins',
        'matrix_pins': {'custom': True, 'rows': [None], 'cols': [None]},
        'layouts': {
            'LAYOUT': {
                'layout': [{'matrix': [0, 0], 'x': 0, 'y': 0}],
            },
        },
        '_nexus': {
            'source_mode': 'qmk_native',
            'upstream_keyboard': 'keychron/example',
            'upstream_files': {'keyboards/keychron/example/keyboard.json': '{}'},
        },
    })

    assert config.source_mode == 'qmk_native'
    assert config.row_pins == []
    assert config.col_pins == []
    assert validate_build_ready(config) == []


def test_import_resolves_default_keymap_layout_alias():
    config = _convert_to_config('whitefacemountain/ampersand', {
        'keyboard_name': 'Ampersand',
        'matrix_pins': {'rows': ['B0'], 'cols': ['B1']},
        'layout_aliases': {'LAYOUT_all': 'LAYOUT_split_bars'},
        'layouts': {
            'LAYOUT_single_bar': {
                'layout': [{'matrix': [0, 0], 'x': 0, 'y': 0}],
            },
            'LAYOUT_split_bars': {
                'layout': [
                    {'matrix': [0, 0], 'x': 0, 'y': 0},
                    {'matrix': [0, 1], 'x': 1, 'y': 0},
                ],
            },
        },
        '_default_keymap': {
            'layout': 'LAYOUT_all',
            'layers': [['KC_A', 'KC_B']],
        },
    })

    assert config.layout_macro == 'LAYOUT_all'
    assert len(config.keys) == 2
    assert config.layers[0].keycodes == {
        config.keys[0].id: 'KC_A',
        config.keys[1].id: 'KC_B',
    }


def test_import_does_not_infer_split_for_full_large_matrix():
    keys = [KeyDef(id=f'k{i}', row=i, col=0, x=0, y=i) for i in range(9)]
    config = KeyboardConfig(
        keys=keys,
        row_pins=[MatrixPin(row=i, pin=f'B{i}') for i in range(9)],
        col_pins=[ColPin(col=0, pin='D0')],
    )

    imported = _convert_to_config('labyrinth75', {
        'keyboard_name': 'Large Single PCB',
        'matrix_pins': {
            'rows': [pin.pin for pin in config.row_pins],
            'cols': ['D0'],
        },
        'layouts': {
            'LAYOUT': {
                'layout': [
                    {'matrix': [key.row, key.col], 'x': key.x, 'y': key.y}
                    for key in keys
                ],
            },
        },
    })

    assert imported.features.get('split_keyboard') is not True


def test_import_split_matrix_edges_do_not_cross_physical_halves():
    imported = _convert_to_config('split/example', {
        'keyboard_name': 'Split Example',
        'matrix_pins': {'rows': ['B0', 'B1'], 'cols': ['D0', 'D1']},
        'split': {'enabled': True},
        'layouts': {
            'LAYOUT': {
                'layout': [
                    {'matrix': [0, 0], 'x': 0, 'y': 0},
                    {'matrix': [1, 0], 'x': 0, 'y': 1},
                    {'matrix': [0, 1], 'x': 1, 'y': 0},
                    {'matrix': [1, 1], 'x': 1, 'y': 1},
                    {'matrix': [2, 0], 'x': 8, 'y': 0},
                    {'matrix': [3, 0], 'x': 8, 'y': 1},
                    {'matrix': [2, 1], 'x': 9, 'y': 0},
                    {'matrix': [3, 1], 'x': 9, 'y': 1},
                ],
            },
        },
    })

    by_id = {key.id: key for key in imported.keys}
    col_edges = [edge for edge in imported.matrix_edges if edge.type == 'col']

    assert col_edges
    assert all(
        abs(by_id[edge.from_].x - by_id[edge.to].x) <= 1
        for edge in col_edges
    )


def test_import_extracts_rgb_matrix_i2c_pins_from_upstream_config():
    config = _convert_to_config('vendor/is31', {
        'keyboard_name': 'IS31 Board',
        'features': {'rgb_matrix': True},
        'matrix_pins': {'rows': ['B0'], 'cols': ['B1']},
        'rgb_matrix': {'driver': 'is31fl3731', 'layout': [{'matrix': [0, 0]}]},
        'layouts': {
            'LAYOUT': {
                'layout': [{'matrix': [0, 0], 'x': 0, 'y': 0}],
            },
        },
        '_nexus': {
            'upstream_files': {
                'keyboards/vendor/is31/config.h': (
                    '#define RGB_MATRIX_I2C_SDA B8\n'
                    '#define RGB_MATRIX_I2C_SCL B9\n'
                ),
            },
        },
    })

    assert config.feature_configs['rgb_matrix']['RGB_MATRIX_I2C_SDA'] == 'B8'
    assert config.feature_configs['rgb_matrix']['RGB_MATRIX_I2C_SCL'] == 'B9'


def test_import_extracts_custom_matrix_pins_from_native_sources():
    matrix_c = '''
static matrix_row_t read_cols(uint8_t row) {
  matrix_row_t cols0 = expander_read_cols();
  matrix_row_t cols1 = (PINC&(1<<PC6) ? 0 : (1<<(0+7))) |
                       (PIND&(1<<PD3) ? 0 : (1<<(1+7))) |
                       (PINB&(1<<PB0) ? 0 : (1<<(6+7))) ;
  return cols0 | cols1;
}
static void select_row(uint8_t row) {
  switch (row) {
  case 2:
    gpio_set_pin_output(F5);
    gpio_write_pin_low(F5);
    break;
  case 0:
    gpio_set_pin_output(F7);
    gpio_write_pin_low(F7);
    break;
  case 1:
    gpio_set_pin_output(F6);
    gpio_write_pin_low(F6);
    break;
  }
}
'''
    expander_c = '''
uint8_t expander_read_cols(void) {
    uint8_t data = 0;
    expander_read(MCP23017_B0_GPIOA, &data);
    return data;
}
void expander_config(void) {
  expander_write(MCP23017_B0_IODIRA, 0x07);
}
'''
    config = _convert_to_config('vendor/custom_matrix', {
        'keyboard_name': 'Custom Matrix',
        'processor': 'atmega32u4',
        'matrix_pins': {'custom': True},
        'layouts': {
            'LAYOUT': {
                'layout': [
                    {'matrix': [row, col], 'x': col, 'y': row}
                    for row in range(3)
                    for col in range(14)
                ],
            },
        },
        '_nexus': {
            'source_mode': 'qmk_native',
            'upstream_keyboard': 'vendor/custom_matrix',
            'upstream_files': {
                'keyboards/vendor/custom_matrix/matrix.c': matrix_c,
                'keyboards/vendor/custom_matrix/expander.c': expander_c,
            },
        },
    })

    assert [pin.pin for pin in config.row_pins] == ['F7', 'F6', 'F5']
    assert [pin.pin for pin in config.col_pins] == ['MCP_A0', 'MCP_A1', 'MCP_A2', 'C6', 'D3', 'B0']
