import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest

from models import ColPin, KeyboardConfig, KeyDef, Layer, MatrixPin


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
