import sys
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parents[2] / 'scripts'
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from build_qmk_index import _preserve_existing_keymap
from convert_keymaps import parse_keymap_c
import build_qmk_index


def test_parse_zima_style_default_keymap(tmp_path):
    keymap_c = tmp_path / 'keymap.c'
    keymap_c.write_text('''
#include QMK_KEYBOARD_H

const uint16_t PROGMEM keymaps[][MATRIX_ROWS][MATRIX_COLS] = {
    [0] = LAYOUT_ortho_4x3(
        KC_MUTE, TG(1), TG(2),
        KC_P7,   KC_P8, KC_P9,
        KC_P4,   KC_P5, KC_P6,
        KC_P1,   KC_P2, KC_P3
    ),
    [1] = LAYOUT_ortho_4x3(
        QK_BOOT, _______, XXXXXXX,
        AU_ON,   AU_OFF,  XXXXXXX,
        CK_TOGG, XXXXXXX, CK_UP,
        CK_RST,  XXXXXXX, CK_DOWN
    )
};
''')

    parsed = parse_keymap_c(keymap_c)

    assert parsed == {
        'layout': 'LAYOUT_ortho_4x3',
        'layers': [
            ['KC_MUTE', 'TG(1)', 'TG(2)', 'KC_P7', 'KC_P8', 'KC_P9', 'KC_P4', 'KC_P5', 'KC_P6', 'KC_P1', 'KC_P2', 'KC_P3'],
            ['QK_BOOT', '_______', 'XXXXXXX', 'AU_ON', 'AU_OFF', 'XXXXXXX', 'CK_TOGG', 'XXXXXXX', 'CK_UP', 'CK_RST', 'XXXXXXX', 'CK_DOWN'],
        ],
    }


def test_build_index_does_not_preserve_null_default_keymap(tmp_path, monkeypatch):
    keyboard_file = tmp_path / 'splitkb' / 'zima.json'
    keyboard_file.parent.mkdir(parents=True)
    keyboard_file.write_text('{"_default_keymap":null}')
    monkeypatch.setattr(build_qmk_index, 'KB_DATA_DIR', tmp_path)

    data = {}
    _preserve_existing_keymap('splitkb/zima', data)

    assert '_default_keymap' not in data
