"""Codegen tests — E2, E3.

Golden files live in tests/goldens/.
To regenerate: pytest --snapshot-update
"""
import re
from pathlib import Path

import pytest

from codegen.keyboard_h import generate_keyboard_h
from codegen.keyboard_c import generate_keyboard_c
from codegen.keymap_c import generate_keymap_c
from codegen.config_h import generate_config_h
from codegen.rules_mk import generate_rules_mk
from models import KeyboardConfig

GOLDENS = Path(__file__).parent / 'goldens'
UPDATE = False  # set via --snapshot-update flag in conftest


def _golden(name: str) -> Path:
    return GOLDENS / name


def _check_or_update(name: str, actual: str) -> None:
    path = _golden(name)
    if UPDATE or not path.exists():
        path.write_text(actual)
        return
    expected = path.read_text()
    assert actual == expected, f'Snapshot mismatch for {name}. Run pytest --snapshot-update to refresh.'


# ── A7 regression: LAYOUT defined in .h only ──────────────────────────────────

def test_layout_only_in_header(minimal_avr_kb):
    h = generate_keyboard_h(minimal_avr_kb)
    c = generate_keyboard_c(minimal_avr_kb)
    assert '#define LAYOUT' in h, 'LAYOUT macro must be in keyboard.h'
    assert '#define LAYOUT' not in c, 'LAYOUT macro must NOT be in keyboard.c'


def test_layout_no_impl_reference(minimal_avr_kb):
    h = generate_keyboard_h(minimal_avr_kb)
    assert 'LAYOUT_impl' not in h, 'LAYOUT_impl reference must not appear in header'


# ── A8 regression: undefined-matrix keys excluded ─────────────────────────────

def test_undefined_keys_excluded_from_layout(undefined_key_kb):
    h = generate_keyboard_h(undefined_key_kb)
    assert 'undef' not in h, 'Undefined key id must not appear in LAYOUT params'


def test_undefined_keys_excluded_from_keymap(undefined_key_kb):
    c = generate_keymap_c(undefined_key_kb)
    assert 'undef' not in c, 'Undefined key id must not appear in keymap.c'


def test_layout_param_count_matches_defined_keys(minimal_avr_kb):
    h = generate_keyboard_h(minimal_avr_kb)
    match = re.search(r'#define LAYOUT\(([^)]+)\)', h)
    assert match, 'LAYOUT macro not found'
    params = [p.strip() for p in match.group(1).split(',')]
    defined_keys = [k for k in minimal_avr_kb.keys if k.row is not None and k.col is not None]
    assert len(params) == len(defined_keys)


# ── Snapshot tests ─────────────────────────────────────────────────────────────

@pytest.mark.parametrize('fixture,gen_fn,suffix', [
    ('minimal_avr_kb', generate_keyboard_h, 'minimal_avr.keyboard_h'),
    ('minimal_avr_kb', generate_keyboard_c, 'minimal_avr.keyboard_c'),
    ('minimal_avr_kb', generate_keymap_c, 'minimal_avr.keymap_c'),
    ('minimal_avr_kb', generate_config_h, 'minimal_avr.config_h'),
    ('minimal_avr_kb', generate_rules_mk, 'minimal_avr.rules_mk'),
    ('split_rgb_kb', generate_keyboard_h, 'split_rgb.keyboard_h'),
    ('split_rgb_kb', generate_keyboard_c, 'split_rgb.keyboard_c'),
    ('split_rgb_kb', generate_keymap_c, 'split_rgb.keymap_c'),
    ('split_rgb_kb', generate_config_h, 'split_rgb.config_h'),
    ('split_rgb_kb', generate_rules_mk, 'split_rgb.rules_mk'),
    ('rp2040_oled_kb', generate_keyboard_h, 'rp2040_oled.keyboard_h'),
    ('rp2040_oled_kb', generate_keyboard_c, 'rp2040_oled.keyboard_c'),
    ('rp2040_oled_kb', generate_keymap_c, 'rp2040_oled.keymap_c'),
    ('rp2040_oled_kb', generate_config_h, 'rp2040_oled.config_h'),
    ('rp2040_oled_kb', generate_rules_mk, 'rp2040_oled.rules_mk'),
])
def test_snapshot(request, fixture, gen_fn, suffix):
    kb: KeyboardConfig = request.getfixturevalue(fixture)
    output = gen_fn(kb)
    _check_or_update(suffix, output)
