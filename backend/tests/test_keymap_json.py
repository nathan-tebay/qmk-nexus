"""Tests for qmk_json source mode codegen + validator."""
import json

import pytest

from codegen.generator import generate_sources
from codegen.keymap_json import generate_keymap_json
from codegen.validator import validate_keymap_json
from models import ColPin, KeyboardConfig, KeyDef, Layer, MatrixPin


def _qmk_json_config(**overrides) -> KeyboardConfig:
    base = dict(
        id='qmkjson-test',
        name='Configurator Board',
        mcu='atmega32u4',
        keys=[
            KeyDef(id='k0', row=0, col=0, x=0, y=0),
            KeyDef(id='k1', row=0, col=1, x=1, y=0),
        ],
        row_pins=[MatrixPin(row=0, pin='B0')],
        col_pins=[ColPin(col=0, pin='D0'), ColPin(col=1, pin='D1')],
        layers=[
            Layer(id='layer0', name='Base', keycodes={'k0': 'KC_A', 'k1': 'KC_B'}),
        ],
        layout_macro='LAYOUT',
        source_mode='qmk_json',
        upstream_keyboard='vendor/board',
        upstream_layouts={
            'LAYOUT': {
                'layout': [
                    {'matrix': [0, 0], 'x': 0, 'y': 0},
                    {'matrix': [0, 1], 'x': 1, 'y': 0},
                ],
            },
        },
    )
    base.update(overrides)
    return KeyboardConfig(**base)


# ── generate_keymap_json ─────────────────────────────────────────────────────

def test_generate_keymap_json_skeleton_shape():
    config = _qmk_json_config()
    out = json.loads(generate_keymap_json(config))

    assert out['version'] == 1
    assert out['keyboard'] == 'vendor/board'
    assert out['keymap'] == 'nexus'
    assert out['layout'] == 'LAYOUT'
    assert out['author'] == ''
    assert out['notes'] == ''
    assert isinstance(out['layers'], list)
    assert 'documentation' in out


def test_generate_keymap_json_resolves_layout_alias():
    config = _qmk_json_config(
        layout_macro='LAYOUT_foo',
        layout_aliases={'LAYOUT_foo': 'LAYOUT_bar'},
        upstream_layouts={
            'LAYOUT_bar': {
                'layout': [
                    {'matrix': [0, 0], 'x': 0, 'y': 0},
                    {'matrix': [0, 1], 'x': 1, 'y': 0},
                ],
            },
        },
    )
    out = json.loads(generate_keymap_json(config))

    assert out['layout'] == 'LAYOUT_bar'


def test_generate_keymap_json_layer_length_matches_upstream_layout():
    config = _qmk_json_config()
    out = json.loads(generate_keymap_json(config))

    assert len(out['layers']) == 1
    assert len(out['layers'][0]) == 2
    assert out['layers'][0] == ['KC_A', 'KC_B']


def test_generate_keymap_json_fills_missing_keycodes_with_trans():
    config = _qmk_json_config(
        layers=[
            Layer(id='layer0', name='Base', keycodes={'k0': 'KC_A'}),
            Layer(id='layer1', name='Fn', keycodes={}),
        ],
    )
    out = json.loads(generate_keymap_json(config))

    assert out['layers'][0] == ['KC_A', 'KC_TRNS']
    assert out['layers'][1] == ['KC_TRNS', 'KC_TRNS']


def test_generate_keymap_json_falls_back_to_keys_order_without_upstream_layouts():
    config = _qmk_json_config(upstream_layouts={})
    out = json.loads(generate_keymap_json(config))

    assert out['layers'][0] == ['KC_A', 'KC_B']


def test_generate_keymap_json_uses_custom_keymap_name_and_metadata():
    config = _qmk_json_config(
        keymap_name='my_layout',
        author='nathan',
        notes='Hello world',
    )
    out = json.loads(generate_keymap_json(config))

    assert out['keymap'] == 'my_layout'
    assert out['author'] == 'nathan'
    assert out['notes'] == 'Hello world'


# ── validate_keymap_json ─────────────────────────────────────────────────────

def _valid_payload() -> dict:
    return {
        'version': 1,
        'keyboard': 'vendor/board',
        'keymap': 'nexus',
        'layout': 'LAYOUT',
        'layers': [['KC_A', 'KC_B'], ['KC_C', 'KC_D']],
    }


def test_validate_keymap_json_accepts_valid_payload():
    assert validate_keymap_json(_valid_payload()) == []


def test_validate_keymap_json_catches_missing_fields():
    payload = _valid_payload()
    del payload['keyboard']
    del payload['layers']
    errors = validate_keymap_json(payload)

    assert any('keyboard' in e for e in errors)
    assert any('layers' in e for e in errors)


def test_validate_keymap_json_catches_mismatched_layer_lengths():
    payload = _valid_payload()
    payload['layers'] = [['KC_A', 'KC_B'], ['KC_C']]
    errors = validate_keymap_json(payload)

    assert any('same length' in e for e in errors)


def test_validate_keymap_json_catches_empty_layers():
    payload = _valid_payload()
    payload['layers'] = []
    errors = validate_keymap_json(payload)

    assert any('non-empty' in e for e in errors)


def test_validate_keymap_json_catches_empty_keyboard_or_layout():
    payload = _valid_payload()
    payload['keyboard'] = ''
    payload['layout'] = ''
    errors = validate_keymap_json(payload)

    assert any('keyboard' in e for e in errors)
    assert any('layout' in e for e in errors)


# ── generate_sources integration ─────────────────────────────────────────────

def test_generate_sources_qmk_json_returns_only_keymap_json():
    config = _qmk_json_config()
    files = generate_sources(config)

    assert set(files) == {'keymap.json'}
    payload = json.loads(files['keymap.json'])
    assert payload['keyboard'] == 'vendor/board'
    assert payload['layers'] == [['KC_A', 'KC_B']]


def test_generate_sources_qmk_json_raises_without_upstream_keyboard():
    config = _qmk_json_config(upstream_keyboard=None)

    with pytest.raises(ValueError):
        generate_sources(config)
