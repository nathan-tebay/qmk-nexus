import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest

from models import ColPin, ComboEntry, EncoderElement, KeyboardConfig, KeyDef, Layer, MacroEntry, MacroStep, MatrixPin, OledElement


def pytest_addoption(parser):
    parser.addoption('--snapshot-update', action='store_true', default=False, help='Regenerate golden files')


def pytest_configure(config):
    import tests.test_codegen as _tc
    _tc.UPDATE = config.getoption('--snapshot-update', default=False)


def _key(id: str, row: int | None, col: int | None, x: float, y: float,
         w: float = 1.0, h: float = 1.0, led_index: int | None = None) -> KeyDef:
    return KeyDef(id=id, row=row, col=col, x=x, y=y, w=w, h=h, led_index=led_index)


@pytest.fixture
def minimal_avr_kb() -> KeyboardConfig:
    return KeyboardConfig(
        id='test-avr',
        name='Test AVR',
        mcu='atmega32u4',
        usb_vid='0xFEED',
        usb_pid='0x0001',
        manufacturer='Tebay',
        keys=[
            _key('k0', 0, 0, 0, 0),
            _key('k1', 0, 1, 1, 0),
            _key('k2', 1, 0, 0, 1),
            _key('k3', 1, 1, 1, 1),
        ],
        row_pins=[MatrixPin(row=0, pin='B0'), MatrixPin(row=1, pin='B1')],
        col_pins=[ColPin(col=0, pin='D0'), ColPin(col=1, pin='D1')],
        layers=[Layer(id='layer0', name='Base', keycodes={'k0': 'KC_A', 'k1': 'KC_B', 'k2': 'KC_C', 'k3': 'KC_D'})],
        features={'nkro': True, 'bootmagic': True, 'extrakey': True},
    )


@pytest.fixture
def split_rgb_kb() -> KeyboardConfig:
    return KeyboardConfig(
        id='test-split',
        name='Test Split',
        mcu='atmega32u4',
        usb_vid='0xFEED',
        usb_pid='0x0002',
        manufacturer='Tebay',
        soft_serial_pin='D2',
        keys=[
            _key('k0', 0, 0, 0, 0, led_index=0),
            _key('k1', 0, 1, 1, 0, led_index=1),
            _key('k2', 1, 0, 0, 1, led_index=2),
            _key('k3', 1, 1, 1, 1, led_index=3),
        ],
        row_pins=[MatrixPin(row=0, pin='B0'), MatrixPin(row=1, pin='B1')],
        col_pins=[ColPin(col=0, pin='D0'), ColPin(col=1, pin='D1')],
        layers=[Layer(id='layer0', name='Base', keycodes={'k0': 'KC_A', 'k1': 'KC_B'})],
        features={'split_keyboard': True, 'rgb_matrix': True, 'nkro': True},
    )


@pytest.fixture
def rp2040_oled_kb() -> KeyboardConfig:
    return KeyboardConfig(
        id='test-rp2040',
        name='Test RP2040',
        mcu='rp2040',
        usb_vid='0xFEED',
        usb_pid='0x0003',
        manufacturer='Tebay',
        keys=[
            _key('k0', 0, 0, 0, 0),
            _key('k1', 0, 1, 1, 0),
            _key('k2', 0, 2, 2, 0),
            _key('k3', 1, 0, 0, 1),
            _key('k4', 1, 1, 1, 1),
            _key('k5', 1, 2, 2, 1),
        ],
        row_pins=[MatrixPin(row=0, pin='GP0'), MatrixPin(row=1, pin='GP1')],
        col_pins=[ColPin(col=0, pin='GP2'), ColPin(col=1, pin='GP3'), ColPin(col=2, pin='GP4')],
        layers=[Layer(id='layer0', name='Base', keycodes={'k0': 'KC_Q', 'k1': 'KC_W', 'k2': 'KC_E'})],
        features={'oled': True, 'encoder': True, 'nkro': True, 'extrakey': True},
    )


@pytest.fixture
def advanced_features_kb() -> KeyboardConfig:
    """Exercises combos, leader_key, dynamic_macro, indicators, debounce, key_lock, wpm."""
    return KeyboardConfig(
        id='test-advanced',
        name='Test Advanced',
        mcu='atmega32u4',
        usb_vid='0xFEED',
        usb_pid='0x0004',
        manufacturer='Tebay',
        keys=[
            _key('k0', 0, 0, 0, 0),
            _key('k1', 0, 1, 1, 0),
            _key('k2', 1, 0, 0, 1),
            _key('k3', 1, 1, 1, 1),
        ],
        row_pins=[MatrixPin(row=0, pin='B0'), MatrixPin(row=1, pin='B1')],
        col_pins=[ColPin(col=0, pin='D0'), ColPin(col=1, pin='D1')],
        layers=[
            Layer(id='layer0', name='Base', keycodes={'k0': 'KC_A', 'k1': 'KC_B', 'k2': 'KC_TRNS', 'k3': 'KC_D'}),
            Layer(id='layer1', name='Fn',   keycodes={'k0': 'KC_TRNS', 'k1': 'KC_TRNS', 'k2': 'KC_C', 'k3': 'KC_TRNS'}),
        ],
        features={
            'combo': True, 'leader_key': True, 'dynamic_macro': True,
            'indicators': True, 'debounce': True, 'key_lock': True, 'wpm': True,
        },
        feature_configs={
            'debounce':       {'DEBOUNCE': '8', 'DEBOUNCE_TYPE': 'sym_eager_pr'},
            'leader_key':     {'LEADER_TIMEOUT': '400', 'LEADER_PER_KEY_TIMING': 'yes'},
            'dynamic_macro':  {'DYNAMIC_MACRO_SIZE': '256'},
            'indicators':     {'LED_CAPS_LOCK_PIN': 'B2', 'LED_NUM_LOCK_PIN': 'B3', 'LED_PIN_ON_STATE': '0'},
            'combo':          {'COMBO_TERM': '50'},
        },
        combos=[
            # Combo 1: k0+k1 (base layer keys) → KC_ESC
            ComboEntry(id='c0', keys=['k0', 'k1'], output='KC_ESC'),
            # Combo 2: k2 resolves via layer 1 (base is TRNS) → exercises layer scan
            ComboEntry(id='c1', keys=['k2', 'k3'], output='QK_LEAD'),
        ],
    )


@pytest.fixture
def macros_kb() -> KeyboardConfig:
    """Two macros: one mixes string + delay + tap; another uses register/unregister mod-hold."""
    return KeyboardConfig(
        id='test-macros',
        name='Test Macros',
        mcu='atmega32u4',
        usb_vid='0xFEED', usb_pid='0x0005', manufacturer='Tebay',
        keys=[
            _key('k0', 0, 0, 0, 0),
            _key('k1', 0, 1, 1, 0),
            _key('k2', 1, 0, 0, 1),
            _key('k3', 1, 1, 1, 1),
        ],
        row_pins=[MatrixPin(row=0, pin='B0'), MatrixPin(row=1, pin='B1')],
        col_pins=[ColPin(col=0, pin='D0'), ColPin(col=1, pin='D1')],
        layers=[Layer(id='layer0', name='Base', keycodes={
            'k0': 'M(0)', 'k1': 'M(1)', 'k2': 'KC_A', 'k3': 'KC_B',
        })],
        macros=[
            MacroEntry(id='m0', name='Email', steps=[
                MacroStep(type='string', text='hi "world"\n'),
                MacroStep(type='delay', ms=50),
                MacroStep(type='tap', keycode='KC_ENT'),
            ]),
            MacroEntry(id='m1', name='ShiftA', steps=[
                MacroStep(type='down', keycode='KC_LSFT'),
                MacroStep(type='tap', keycode='KC_A'),
                MacroStep(type='up', keycode='KC_LSFT'),
            ]),
        ],
    )


@pytest.fixture
def undefined_key_kb() -> KeyboardConfig:
    """Keyboard with one key missing matrix assignment — should be excluded from LAYOUT."""
    return KeyboardConfig(
        id='test-undef',
        name='Test Undef',
        mcu='atmega32u4',
        keys=[
            _key('k0', 0, 0, 0, 0),
            _key('k1', 0, 1, 1, 0),
            _key('undef', None, None, 2, 0),
        ],
        layers=[Layer(id='layer0', name='Base', keycodes={})],
    )


# ── Real-world board fixtures ────────────────────────────────────────────────

def _enc(id: str) -> EncoderElement:
    return EncoderElement(id=id, x=0.0, y=0.0)


def _oled(id: str) -> OledElement:
    return OledElement(id=id, x=0.0, y=0.0)


@pytest.fixture
def unicorne_kb() -> KeyboardConfig:
    """boardsource/unicorne — RP2040, split, pointing device, encoder, RGB matrix, OLED, audio."""
    keys = [
        _key(f'k{r}{c}', r, c, float(c), float(r), led_index=r * 6 + c)
        for r in range(4) for c in range(6)
    ]
    keycodes = {f'k{r}{c}': 'KC_TRNS' for r in range(4) for c in range(6)}
    return KeyboardConfig(
        id='unicorne',
        name='Unicorne',
        mcu='rp2040',
        usb_vid='0xFEED', usb_pid='0x1300', manufacturer='Boardsource',
        soft_serial_pin='GP1',
        row_pins=[MatrixPin(row=i, pin=f'GP{29 - i}') for i in range(4)],
        col_pins=[ColPin(col=i, pin=f'GP{6 + i}') for i in range(6)],
        keys=keys,
        layers=[Layer(id='layer0', name='Base', keycodes=keycodes)],
        features={
            'split_keyboard': True, 'rgb_matrix': True, 'oled': True,
            'audio': True, 'encoder': True, 'pointing_device': True, 'nkro': True,
        },
        feature_configs={
            'split_keyboard': {'SPLIT_TRANSPORT': 'serial', 'SERIAL_DRIVER': 'vendor'},
            'pointing_device': {'POINTING_DEVICE_DRIVER': 'pmw3360', 'POINTING_DEVICE_CS_PIN': 'GP17'},
        },
        encoders=[_enc('enc0')],
        oleds=[_oled('oled0')],
        encoder_keycodes={'layer0:enc0:cw': 'KC_VOLU', 'layer0:enc0:ccw': 'KC_VOLD'},
    )


@pytest.fixture
def evo70_r2_kb() -> KeyboardConfig:
    """custommk/evo70_r2 — STM32F411, encoder, OLED, audio, backlight, rgblight."""
    keys = [_key(f'k{r}{c}', r, c, float(c), float(r)) for r in range(5) for c in range(5)]
    keycodes = {f'k{r}{c}': 'KC_TRNS' for r in range(5) for c in range(5)}
    return KeyboardConfig(
        id='evo70-r2',
        name='EVO70 R2',
        mcu='stm32f411',
        usb_vid='0xFEED', usb_pid='0x1301', manufacturer='custommk',
        row_pins=[MatrixPin(row=i, pin=p) for i, p in enumerate(['A4', 'A5', 'B3', 'C11', 'C12'])],
        col_pins=[ColPin(col=i, pin=p) for i, p in enumerate(['A3', 'A2', 'A1', 'A0', 'B11'])],
        keys=keys,
        layers=[Layer(id='layer0', name='Base', keycodes=keycodes)],
        features={
            'encoder': True, 'oled': True, 'audio': True,
            'backlight': True, 'rgblight': True, 'nkro': True,
        },
        feature_configs={
            'audio': {'AUDIO_PIN': 'C13'},
            'backlight': {'BACKLIGHT_PIN': 'B6', 'BACKLIGHT_LEVELS': '5'},
            'rgblight': {'RGBLIGHT_DI_PIN': 'B15', 'RGBLIGHT_LED_COUNT': '14'},
        },
        encoders=[_enc('enc0')],
        oleds=[_oled('oled0')],
        encoder_keycodes={'layer0:enc0:cw': 'KC_VOLU', 'layer0:enc0:ccw': 'KC_VOLD'},
    )


@pytest.fixture
def macropad_rp2040_kb() -> KeyboardConfig:
    """adafruit/macropad — RP2040, encoder, RGB matrix, OLED, audio (pwm_hardware)."""
    keys = [
        _key(f'k{r}{c}', r, c, float(c), float(r), led_index=r * 3 + c)
        for r in range(4) for c in range(3)
    ]
    keycodes = {f'k{r}{c}': 'KC_TRNS' for r in range(4) for c in range(3)}
    return KeyboardConfig(
        id='macropad-rp2040',
        name='Macropad RP2040',
        mcu='rp2040',
        usb_vid='0x239A', usb_pid='0x8106', manufacturer='Adafruit',
        row_pins=[MatrixPin(row=i, pin=f'GP{4 + i}') for i in range(4)],
        col_pins=[ColPin(col=i, pin=f'GP{8 + i}') for i in range(3)],
        keys=keys,
        layers=[Layer(id='layer0', name='Base', keycodes=keycodes)],
        features={'encoder': True, 'rgb_matrix': True, 'oled': True, 'audio': True, 'nkro': True},
        feature_configs={'audio': {'AUDIO_DRIVER': 'pwm_hardware'}},
        encoders=[_enc('enc0')],
        oleds=[_oled('oled0')],
        encoder_keycodes={'layer0:enc0:cw': 'KC_VOLU', 'layer0:enc0:ccw': 'KC_VOLD'},
    )


@pytest.fixture
def sofle_pico_kb() -> KeyboardConfig:
    """sofle_pico — RP2040, split, encoder, RGB matrix, OLED."""
    keys = [
        _key(f'k{r}{c}', r, c, float(c), float(r), led_index=r * 6 + c)
        for r in range(5) for c in range(6)
    ]
    keycodes = {f'k{r}{c}': 'KC_TRNS' for r in range(5) for c in range(6)}
    return KeyboardConfig(
        id='sofle-pico',
        name='Sofle Pico',
        mcu='rp2040',
        usb_vid='0xFEED', usb_pid='0x1302', manufacturer='josefadamcik',
        soft_serial_pin='GP0',
        row_pins=[MatrixPin(row=i, pin=f'GP{4 + i}') for i in range(5)],
        col_pins=[ColPin(col=i, pin=p) for i, p in enumerate(['GP21', 'GP23', 'GP20', 'GP22', 'GP26', 'GP29'])],
        keys=keys,
        layers=[Layer(id='layer0', name='Base', keycodes=keycodes)],
        features={'split_keyboard': True, 'rgb_matrix': True, 'oled': True, 'encoder': True, 'nkro': True},
        feature_configs={
            'split_keyboard': {'SPLIT_TRANSPORT': 'serial', 'SERIAL_DRIVER': 'vendor'},
        },
        encoders=[_enc('enc0')],
        oleds=[_oled('oled0')],
        encoder_keycodes={'layer0:enc0:cw': 'KC_VOLU', 'layer0:enc0:ccw': 'KC_VOLD'},
    )


@pytest.fixture
def preonic_rev3_kb() -> KeyboardConfig:
    """preonic/rev3 — STM32F303, encoder, audio, console, rgblight."""
    keys = [_key(f'k{r}{c}', r, c, float(c), float(r)) for r in range(5) for c in range(5)]
    keycodes = {f'k{r}{c}': 'KC_TRNS' for r in range(5) for c in range(5)}
    return KeyboardConfig(
        id='preonic-rev3',
        name='Preonic Rev3',
        mcu='stm32f303',
        usb_vid='0x4B42', usb_pid='0x6061', manufacturer='OLKB',
        row_pins=[MatrixPin(row=i, pin=p) for i, p in enumerate(['A10', 'B0', 'B7', 'B6', 'C6'])],
        col_pins=[ColPin(col=i, pin=p) for i, p in enumerate(['A7', 'B1', 'B3', 'B4', 'B5'])],
        keys=keys,
        layers=[Layer(id='layer0', name='Base', keycodes=keycodes)],
        features={
            'encoder': True, 'audio': True, 'console': True,
            'rgblight': True, 'nkro': True, 'bootmagic': True,
        },
        feature_configs={
            'audio': {'AUDIO_PIN': 'C6'},
            'rgblight': {'RGBLIGHT_DI_PIN': 'A1', 'RGBLIGHT_LED_COUNT': '2'},
        },
        encoders=[_enc('enc0')],
        encoder_keycodes={'layer0:enc0:cw': 'KC_VOLU', 'layer0:enc0:ccw': 'KC_VOLD'},
    )


@pytest.fixture
def rocketboard16_kb() -> KeyboardConfig:
    """rocketboard_16 — STM32F103, encoder, OLED, rgblight, console."""
    keys = [_key(f'k{r}{c}', r, c, float(c), float(r)) for r in range(3) for c in range(6)]
    keycodes = {f'k{r}{c}': 'KC_TRNS' for r in range(3) for c in range(6)}
    return KeyboardConfig(
        id='rocketboard-16',
        name='Rocketboard-16',
        mcu='stm32f103',
        usb_vid='0xFEED', usb_pid='0x1303', manufacturer='Rocketboard',
        row_pins=[MatrixPin(row=i, pin=p) for i, p in enumerate(['A1', 'A0', 'B12'])],
        col_pins=[ColPin(col=i, pin=p) for i, p in enumerate(['A2', 'A3', 'A4', 'A5', 'A6', 'A7'])],
        keys=keys,
        layers=[Layer(id='layer0', name='Base', keycodes=keycodes)],
        features={'encoder': True, 'oled': True, 'rgblight': True, 'console': True, 'nkro': True},
        feature_configs={
            'rgblight': {'RGBLIGHT_DI_PIN': 'B8', 'RGBLIGHT_LED_COUNT': '8'},
        },
        encoders=[_enc('enc0')],
        oleds=[_oled('oled0')],
        encoder_keycodes={'layer0:enc0:cw': 'KC_VOLU', 'layer0:enc0:ccw': 'KC_VOLD'},
    )


@pytest.fixture
def zima_kb() -> KeyboardConfig:
    """splitkb/zima — atmega32u4, encoder, OLED, audio, rgblight."""
    keys = [_key(f'k{r}{c}', r, c, float(c), float(r)) for r in range(2) for c in range(6)]
    keycodes = {f'k{r}{c}': 'KC_TRNS' for r in range(2) for c in range(6)}
    return KeyboardConfig(
        id='zima',
        name='Zima',
        mcu='atmega32u4',
        usb_vid='0x6564', usb_pid='0x0001', manufacturer='splitkb',
        row_pins=[MatrixPin(row=0, pin='D4'), MatrixPin(row=1, pin='C6')],
        col_pins=[ColPin(col=i, pin=p) for i, p in enumerate(['D7', 'E6', 'B4', 'B5', 'B6', 'D6'])],
        keys=keys,
        layers=[Layer(id='layer0', name='Base', keycodes=keycodes)],
        features={'encoder': True, 'oled': True, 'audio': True, 'rgblight': True, 'nkro': True},
        feature_configs={
            'audio': {'AUDIO_PIN': 'C5'},
            'rgblight': {'RGBLIGHT_DI_PIN': 'B3', 'RGBLIGHT_LED_COUNT': '6'},
        },
        encoders=[_enc('enc0')],
        oleds=[_oled('oled0')],
        encoder_keycodes={'layer0:enc0:cw': 'KC_VOLU', 'layer0:enc0:ccw': 'KC_VOLD'},
    )
