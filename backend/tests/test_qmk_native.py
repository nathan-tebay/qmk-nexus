import json
import sys
import types

from codegen.generator import generate_all, generate_sources
from codegen.keymap_c import generate_keymap_c
from models import ColPin, KeyboardConfig, KeyDef, Layer, MatrixEdge, MatrixPin
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


def test_layout_only_import_preserves_qmk_data_but_generates_nexus_source():
    config = _convert_to_config('vendor/board', {
        'keyboard_name': 'Vendor Board',
        'manufacturer': 'Vendor',
        'processor': 'rp2040',
        'usb': {'vid': '0x1234', 'pid': '0x5678'},
        'matrix_pins': {'rows': ['B0'], 'cols': ['B1', 'B2']},
        'features': {'rgb_matrix': True, 'split_keyboard': True},
        'encoder': {'rotary': [{'pin_a': 'D1', 'pin_b': 'D2'}]},
        'layouts': {
            'LAYOUT_vendor': {
                'layout': [
                    {'matrix': [0, 0], 'x': 0, 'y': 0},
                    {'matrix': [0, 1], 'x': 1, 'y': 0},
                ],
            },
        },
        '_default_keymap': {
            'layout': 'LAYOUT_vendor',
            'layers': [['KC_A', 'KC_B']],
            'encoders': [[{'ccw': 'KC_VOLD', 'cw': 'KC_VOLU'}]],
        },
    }, layout_only=True)

    assert config.source_mode == 'generated'
    assert config.upstream_keyboard == 'vendor/board'
    assert config.upstream_files == {}
    assert 'LAYOUT_vendor' in config.upstream_layouts
    assert config.layout_macro == 'LAYOUT_vendor'
    assert config.mcu == 'rp2040'
    assert config.usb_vid == '0x1234'
    assert config.usb_pid == '0x5678'
    assert config.manufacturer == 'Vendor'
    assert config.row_pins == [MatrixPin(row=0, pin='B0')]
    assert config.col_pins == [ColPin(col=0, pin='B1'), ColPin(col=1, pin='B2')]
    assert config.matrix_edges == [
        MatrixEdge(from_=config.keys[0].id, to=config.keys[1].id, type='row'),
    ]
    assert len(config.encoders) == 1
    assert [(key.row, key.col, key.led_index) for key in config.keys] == [
        (0, 0, None),
        (0, 1, None),
    ]
    assert config.layers[0].keycodes == {
        config.keys[0].id: 'KC_A',
        config.keys[1].id: 'KC_B',
    }
    assert config.features['rgb_matrix'] is True
    assert config.features['split_keyboard'] is True
    assert config.features['encoder'] is True
    assert config.feature_configs['encoder']['ENCODER_COUNT'] == '1'
    assert config.feature_configs['encoder']['ENCODER_PAD_A_0'] == 'D1'
    assert config.feature_configs['encoder']['ENCODER_PAD_B_0'] == 'D2'
    assert config.encoder_keycodes == {
        f'{config.layers[0].id}:{config.encoders[0].id}:ccw': 'KC_VOLD',
        f'{config.layers[0].id}:{config.encoders[0].id}:cw': 'KC_VOLU',
    }


def test_import_st7565_split_keyboard_as_two_oled_elements():
    config = _convert_to_config('input_club/ergodox_infinity', {
        'keyboard_name': 'Infinity Ergodox (QMK)',
        'processor': 'mk20dx256',
        'features': {'st7565': True},
        'split': {'enabled': True},
        'layouts': {
            'LAYOUT_ergodox': {
                'layout': [
                    {'matrix': [0, 0], 'x': 0, 'y': 1},
                    {'matrix': [0, 1], 'x': 1, 'y': 1},
                    {'matrix': [4, 0], 'x': 8, 'y': 1},
                    {'matrix': [4, 1], 'x': 9, 'y': 1},
                ],
            },
        },
    }, layout_only=True)

    assert config.source_mode == 'generated'
    assert config.features['oled'] is True
    assert config.features['split_keyboard'] is True
    assert len(config.oleds) == 2
    assert config.oleds[0].active_blocks == ['layer_name', 'wpm']
    assert config.oleds[1].active_blocks == ['master_slave']
    assert config.feature_configs['oled']['OLED_COUNT'] == '2'
    assert config.feature_configs['oled']['OLED_DRIVER_0'] == 'ST7567'
    assert config.feature_configs['oled']['OLED_DRIVER_1'] == 'ST7567'
    assert config.feature_configs['oled']['OLED_DISPLAY_SIZE_0'] == '128_32'
    assert config.feature_configs['oled']['OLED_DISPLAY_SIZE_1'] == '128_32'


def test_import_pointing_device_as_trackball_element_with_inferred_driver():
    config = _convert_to_config('dlip/haritev2/dual_cirque', {
        'keyboard_name': 'haritev2',
        'processor': 'rp2040',
        'features': {'pointing_device': True},
        'layouts': {
            'LAYOUT': {
                'layout': [
                    {'matrix': [0, 0], 'x': 0, 'y': 0},
                    {'matrix': [0, 1], 'x': 1, 'y': 0},
                    {'matrix': [0, 2], 'x': 8, 'y': 0},
                    {'matrix': [0, 3], 'x': 9, 'y': 0},
                ],
            },
        },
    }, layout_only=True)

    assert config.source_mode == 'generated'
    assert config.features['pointing_device'] is True
    assert len(config.trackballs) == 2
    assert all(trackball.driver == 'cirque_pinnacle_spi' for trackball in config.trackballs)
    assert config.feature_configs['pointing_device']['POINTING_DEVICE_DRIVER'] == 'cirque_pinnacle_spi'


def test_import_normalizes_legacy_default_keymap_aliases():
    config = _convert_to_config('rocketboard_16', {
        'keyboard_name': 'rocketboard_16',
        'processor': 'stm32f103',
        'features': {'encoder': True},
        'encoder': {
            'rotary': [
                {'pin_a': 'A0', 'pin_b': 'A1'},
                {'pin_a': 'A2', 'pin_b': 'A3'},
            ],
        },
        'layouts': {
            'LAYOUT': {
                'layout': [
                    {'matrix': [0, 0], 'x': 0, 'y': 0},
                    {'matrix': [0, 1], 'x': 1, 'y': 0},
                ],
            },
        },
        '_default_keymap': {
            'layout': 'LAYOUT',
            'layers': [
                ['KC_A', 'KC_B'],
                ['KC_EXAM', '_______'],
            ],
        },
    }, layout_only=True)

    assert config.layers[1].keycodes == {config.keys[0].id: 'KC_EXLM'}
    keymap_c = generate_keymap_c(config)
    assert 'KC_EXAM' not in keymap_c
    assert 'KC_EXLM' in keymap_c
    assert '_______' not in keymap_c


def test_import_does_not_auto_enable_arm_audio_in_generated_mode():
    config = _convert_to_config('boardsource/unicorne', {
        'keyboard_name': 'unicorne',
        'processor': 'rp2040',
        'features': {'audio': True},
        'audio': {'driver': 'pwm_hardware'},
        'layouts': {
            'LAYOUT': {
                'layout': [
                    {'matrix': [0, 0], 'x': 0, 'y': 0},
                ],
            },
        },
    }, layout_only=True)

    assert config.features['audio'] is False
    assert 'AUDIO_ENABLE' not in generate_sources(config)['rules.mk']


def test_import_encoder_elements_from_default_keymap_encoder_count():
    config = _convert_to_config('handwired/erikpeyronson/erkbd', {
        'keyboard_name': 'erkbd',
        'processor': 'atmega32u4',
        'layouts': {
            'LAYOUT': {
                'layout': [
                    {'matrix': [0, 0], 'x': 0, 'y': 0},
                    {'matrix': [0, 1], 'x': 1, 'y': 0},
                ],
            },
        },
        '_default_keymap': {
            'layout': 'LAYOUT',
            'layers': [['KC_A', 'KC_B']],
            'encoders': [[
                {'ccw': 'KC_UP', 'cw': 'KC_DOWN'},
                {'ccw': 'KC_RIGHT', 'cw': 'KC_LEFT'},
            ]],
        },
    }, layout_only=True)

    assert len(config.encoders) == 2
    assert config.features['encoder'] is True
    assert config.feature_configs['encoder']['ENCODER_COUNT'] == '2'
    assert config.encoder_keycodes == {
        f'{config.layers[0].id}:{config.encoders[0].id}:ccw': 'KC_UP',
        f'{config.layers[0].id}:{config.encoders[0].id}:cw': 'KC_DOWN',
        f'{config.layers[0].id}:{config.encoders[1].id}:ccw': 'KC_RGHT',
        f'{config.layers[0].id}:{config.encoders[1].id}:cw': 'KC_LEFT',
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


def test_import_ergodox_style_col_edges_are_monotonic_in_x():
    # Ergodox-style: matrix "col" index spans a horizontal stripe of keys
    # across both halves with near-constant y. Edges within a half must
    # progress monotonically along x (no zigzag from y-tiebreaker sort).
    imported = _convert_to_config('ergodox/test', {
        'keyboard_name': 'Ergodox Test',
        'matrix_pins': {'custom_lite': True},
        'split': {'enabled': True},
        'layouts': {
            'LAYOUT': {
                'layout': [
                    # matrix col 0 = top physical row; 5 keys per half with
                    # tiny y variation that would scramble a (y, x) sort.
                    {'matrix': [0, 0], 'x': 0.0, 'y': 0.4},
                    {'matrix': [1, 0], 'x': 1.0, 'y': 0.1},
                    {'matrix': [2, 0], 'x': 2.0, 'y': 0.0},
                    {'matrix': [3, 0], 'x': 3.0, 'y': 0.1},
                    {'matrix': [4, 0], 'x': 4.0, 'y': 0.2},
                    {'matrix': [5, 0], 'x': 9.0, 'y': 0.2},
                    {'matrix': [6, 0], 'x': 10.0, 'y': 0.1},
                    {'matrix': [7, 0], 'x': 11.0, 'y': 0.0},
                    {'matrix': [8, 0], 'x': 12.0, 'y': 0.1},
                    {'matrix': [9, 0], 'x': 13.0, 'y': 0.4},
                    # second matrix col so the column group has > 1 col
                    {'matrix': [0, 1], 'x': 0.0, 'y': 1.4},
                    {'matrix': [4, 1], 'x': 4.0, 'y': 1.2},
                    {'matrix': [5, 1], 'x': 9.0, 'y': 1.2},
                    {'matrix': [9, 1], 'x': 13.0, 'y': 1.4},
                ],
            },
        },
    })

    by_id = {key.id: key for key in imported.keys}
    col_edges = [edge for edge in imported.matrix_edges if edge.type == 'col']
    assert col_edges
    # No col edge may cross the keyboard's physical midline.
    kb_center_x = (
        min(key.x for key in imported.keys)
        + max(key.x + key.w for key in imported.keys)
    ) / 2
    for edge in col_edges:
        fx = by_id[edge.from_].x + by_id[edge.from_].w / 2
        tx = by_id[edge.to].x + by_id[edge.to].w / 2
        assert (fx < kb_center_x) == (tx < kb_center_x)
    # Each col edge must step in a single x direction (no zigzag).
    for edge in col_edges:
        assert by_id[edge.to].x - by_id[edge.from_].x >= 0


def test_import_col_doubled_split_keeps_columns_continuous():
    # Hotdox v1 style: 6-row × 14-col matrix where col indices are doubled
    # across halves (cols 0-6 = left, cols 7-13 = right). Every col index
    # belongs to one physical side, so the row-half split must NOT cut
    # col edges in the middle of a single column.
    layout_keys = []
    for col in range(14):
        x = float(col) + (3.0 if col >= 7 else 0.0)  # gap between halves
        for row in range(6):
            layout_keys.append({'matrix': [row, col], 'x': x, 'y': float(row)})

    imported = _convert_to_config('hotdox/v1', {
        'keyboard_name': 'HotDox v1',
        'matrix_pins': {'custom': True},
        'split': {'enabled': True},
        'layouts': {'LAYOUT': {'layout': layout_keys}},
    })

    by_id = {key.id: key for key in imported.keys}
    edges_by_col: dict[int, list[tuple[int, int]]] = {}
    for edge in imported.matrix_edges:
        if edge.type != 'col':
            continue
        fk, tk = by_id[edge.from_], by_id[edge.to]
        assert fk.col == tk.col
        edges_by_col.setdefault(fk.col, []).append((fk.row, tk.row))

    for col in range(14):
        pairs = sorted(edges_by_col.get(col, []))
        assert pairs == [(0, 1), (1, 2), (2, 3), (3, 4), (4, 5)], \
            f'col {col} edges {pairs} — expected continuous 0→5 chain'


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


def test_import_extracts_moonlander_style_custom_matrix_columns():
    matrix_c = '''
static matrix_row_t read_cols_on_row(uint8_t row) {
    matrix_row_t cols = 0;
    cols |= gpio_read_pin(A0) ? 0 : (1 << 0);
    cols |= gpio_read_pin(A1) ? 0 : (1 << 1);
    cols |= gpio_read_pin(A2) ? 0 : (1 << 2);
    cols |= gpio_read_pin(A3) ? 0 : (1 << 3);
    cols |= gpio_read_pin(A6) ? 0 : (1 << 4);
    cols |= gpio_read_pin(A7) ? 0 : (1 << 5);
    cols |= gpio_read_pin(B0) ? 0 : (1 << 6);
    return cols;
}

static matrix_row_t read_cols_on_row_right(uint8_t row) {
    uint8_t rx = 0;
    mcp23018_read_pins(0x20, mcp23018_PORTB, &rx);
    return ~(rx & 0b00111111);
}

static void select_row(uint8_t row) {
  switch (row) {
  case 0: gpio_set_pin_output(B10); break;
  case 1: gpio_set_pin_output(B11); break;
  case 2: gpio_set_pin_output(B12); break;
  case 3: gpio_set_pin_output(B13); break;
  case 4: gpio_set_pin_output(B14); break;
  case 5: gpio_set_pin_output(B15); break;
  }
}
'''
    config = _convert_to_config('zsa/moonlander', {
        'keyboard_name': 'Moonlander',
        'processor': 'STM32F303',
        'matrix_pins': {'custom_lite': True},
        'layouts': {
            'LAYOUT_moonlander': {
                'layout': [
                    {'matrix': [row, col], 'x': col, 'y': row}
                    for row in range(6)
                    for col in range(7)
                ],
            },
        },
        '_nexus': {
            'source_mode': 'qmk_native',
            'upstream_keyboard': 'zsa/moonlander',
            'upstream_files': {'keyboards/zsa/moonlander/matrix.c': matrix_c},
        },
    })

    assert [pin.pin for pin in config.row_pins] == ['B10', 'B11', 'B12', 'B13', 'B14', 'B15']
    assert [pin.pin for pin in config.col_pins] == [
        'A0', 'A1', 'A2', 'A3', 'A6', 'A7', 'B0',
        'MCP_B0', 'MCP_B1', 'MCP_B2', 'MCP_B3', 'MCP_B4', 'MCP_B5',
    ]


def test_import_extracts_direct_matrix_pins():
    config = _convert_to_config('splitkb/zima', {
        'keyboard_name': 'Zima',
        'processor': 'atmega32u4',
        'matrix_pins': {
            'direct': [
                ['C6', 'D6', 'D5'],
                ['C7', 'F7', 'D4'],
                ['E6', 'F5', 'F6'],
                ['F0', 'F1', 'F4'],
            ],
        },
        'layouts': {
            'LAYOUT_ortho_4x3': {
                'layout': [
                    {'matrix': [row, col], 'x': col, 'y': row}
                    for row in range(4)
                    for col in range(3)
                ],
            },
        },
    })

    # Direct-pin matrices don't split into row/col pins — all data lives in direct_pins.
    assert config.row_pins == []
    assert config.col_pins == []
    assert config.direct_pins == [
        ['C6', 'D6', 'D5'],
        ['C7', 'F7', 'D4'],
        ['E6', 'F5', 'F6'],
        ['F0', 'F1', 'F4'],
    ]
