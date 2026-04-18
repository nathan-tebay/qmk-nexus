import sys
from pathlib import Path

# Ensure backend root is on the path
sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
import tests.test_codegen as _tc


def pytest_addoption(parser):
    parser.addoption('--snapshot-update', action='store_true', default=False, help='Regenerate golden files')


def pytest_configure(config):
    _tc.UPDATE = config.getoption('--snapshot-update', default=False)
from models import KeyboardConfig, KeyDef, Layer, MatrixPin, ColPin


def _key(id: str, row: int, col: int, x: float, y: float, w: float = 1.0, h: float = 1.0) -> KeyDef:
    return KeyDef(id=id, row=row, col=col, x=x, y=y, w=w, h=h)


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
    keys = [
        _key('k0', 0, 0, 0, 0, led_index=0) if False else _key('k0', 0, 0, 0, 0),
        _key('k1', 0, 1, 1, 0),
        _key('k2', 1, 0, 0, 1),
        _key('k3', 1, 1, 1, 1),
    ]
    # Add led_index manually since _key doesn't support it
    keys[0] = KeyDef(id='k0', row=0, col=0, x=0, y=0, w=1, h=1, led_index=0)
    keys[1] = KeyDef(id='k1', row=0, col=1, x=1, y=0, w=1, h=1, led_index=1)
    keys[2] = KeyDef(id='k2', row=1, col=0, x=0, y=1, w=1, h=1, led_index=2)
    keys[3] = KeyDef(id='k3', row=1, col=1, x=1, y=1, w=1, h=1, led_index=3)
    return KeyboardConfig(
        id='test-split',
        name='Test Split',
        mcu='atmega32u4',
        usb_vid='0xFEED',
        usb_pid='0x0002',
        manufacturer='Tebay',
        soft_serial_pin='D2',
        keys=keys,
        row_pins=[MatrixPin(row=0, pin='B0'), MatrixPin(row=1, pin='B1')],
        col_pins=[ColPin(col=0, pin='D0'), ColPin(col=1, pin='D1')],
        layers=[Layer(id='layer0', name='Base', keycodes={'k0': 'KC_A', 'k1': 'KC_B'})],
        features={'split_keyboard': True, 'rgb_matrix': True, 'nkro': True},
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
            KeyDef(id='undef', row=None, col=None, x=2, y=0),
        ],
        layers=[Layer(id='layer0', name='Base', keycodes={})],
    )
