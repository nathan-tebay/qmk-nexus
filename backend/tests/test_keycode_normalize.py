"""Tests for backend/codegen/keycodes.py keycode alias normalization."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from codegen.keycodes import normalize_keycode, normalize_layer, normalize_layers


class TestNormalizeKeycode:
    def test_long_form_enter(self):
        assert normalize_keycode('KC_ENTER') == 'KC_ENT'

    def test_blank_to_trns(self):
        assert normalize_keycode('_______') == 'KC_TRNS'

    def test_xxxxxxx_to_no(self):
        assert normalize_keycode('XXXXXXX') == 'KC_NO'

    def test_already_normalized_ent(self):
        assert normalize_keycode('KC_ENT') == 'KC_ENT'

    def test_unknown_keycode_passthrough(self):
        assert normalize_keycode('CUSTOM_MACRO') == 'CUSTOM_MACRO'

    def test_empty_string(self):
        assert normalize_keycode('') == ''

    def test_escape_alias(self):
        assert normalize_keycode('KC_ESCAPE') == 'KC_ESC'

    def test_backspace_long(self):
        assert normalize_keycode('KC_BACKSPACE') == 'KC_BSPC'

    def test_bspace_alias(self):
        assert normalize_keycode('KC_BSPACE') == 'KC_BSPC'

    def test_delete_alias(self):
        assert normalize_keycode('KC_DELETE') == 'KC_DEL'

    def test_insert_alias(self):
        assert normalize_keycode('KC_INSERT') == 'KC_INS'

    def test_pgdown_alias(self):
        assert normalize_keycode('KC_PGDOWN') == 'KC_PGDN'

    def test_lshift_alias(self):
        assert normalize_keycode('KC_LSHIFT') == 'KC_LSFT'

    def test_rshift_alias(self):
        assert normalize_keycode('KC_RSHIFT') == 'KC_RSFT'

    def test_lctrl_alias(self):
        assert normalize_keycode('KC_LCTRL') == 'KC_LCTL'

    def test_rctrl_alias(self):
        assert normalize_keycode('KC_RCTRL') == 'KC_RCTL'

    def test_transparent_long(self):
        assert normalize_keycode('KC_TRANSPARENT') == 'KC_TRNS'

    def test_nokey_alias(self):
        assert normalize_keycode('KC_NOKEY') == 'KC_NO'

    def test_minus_alias(self):
        assert normalize_keycode('KC_MINUS') == 'KC_MINS'

    def test_equal_alias(self):
        assert normalize_keycode('KC_EQUAL') == 'KC_EQL'

    def test_space_alias(self):
        assert normalize_keycode('KC_SPACE') == 'KC_SPC'

    def test_kp_enter_alias(self):
        assert normalize_keycode('KC_KP_ENTER') == 'KC_PENT'

    def test_kp_0_alias(self):
        assert normalize_keycode('KC_KP_0') == 'KC_P0'

    def test_strips_whitespace(self):
        assert normalize_keycode('  KC_ENTER  ') == 'KC_ENT'

    def test_none_like_empty_string(self):
        # Empty string edge case
        assert normalize_keycode('') == ''

    def test_unknown_mod_tap_passthrough(self):
        assert normalize_keycode('MT(MOD_LSFT, KC_A)') == 'MT(MOD_LSFT, KC_A)'


class TestNormalizeLayer:
    def test_full_layer(self):
        layer = ['KC_ENTER', '_______', 'XXXXXXX', 'KC_A', 'CUSTOM']
        result = normalize_layer(layer)
        assert result == ['KC_ENT', 'KC_TRNS', 'KC_NO', 'KC_A', 'CUSTOM']

    def test_empty_layer(self):
        assert normalize_layer([]) == []

    def test_all_passthrough(self):
        layer = ['KC_A', 'KC_B', 'KC_C']
        assert normalize_layer(layer) == ['KC_A', 'KC_B', 'KC_C']


class TestNormalizeLayers:
    def test_multiple_layers(self):
        layers = [
            ['KC_ENTER', 'KC_ESCAPE'],
            ['_______', 'KC_A'],
            ['XXXXXXX', 'KC_LSHIFT'],
        ]
        result = normalize_layers(layers)
        assert result == [
            ['KC_ENT', 'KC_ESC'],
            ['KC_TRNS', 'KC_A'],
            ['KC_NO', 'KC_LSFT'],
        ]

    def test_empty_layers(self):
        assert normalize_layers([]) == []

    def test_single_layer(self):
        layers = [['KC_BACKSPACE', 'KC_DELETE']]
        result = normalize_layers(layers)
        assert result == [['KC_BSPC', 'KC_DEL']]
