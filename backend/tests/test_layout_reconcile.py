"""Tests for layout_reconcile.reconcile_layers."""
from __future__ import annotations

from layout_reconcile import reconcile_layers
from models import KeyDef, Layer


def _key(id: str, row: int | None = None, col: int | None = None) -> KeyDef:
    return KeyDef(id=id, x=0.0, y=0.0, row=row, col=col)


def test_same_layout_reimport_preserves_all_keycodes():
    old_keys = [
        _key('a', row=0, col=0),
        _key('b', row=0, col=1),
        _key('c', row=1, col=0),
    ]
    old_layers = [
        Layer(id='layer0', name='Base', keycodes={'a': 'KC_A', 'b': 'KC_B', 'c': 'KC_C'}),
    ]
    # Fresh re-import: same matrix, fresh ids
    new_keys = [
        _key('x', row=0, col=0),
        _key('y', row=0, col=1),
        _key('z', row=1, col=0),
    ]

    new_layers, discarded = reconcile_layers(old_keys, old_layers, new_keys)

    assert discarded == 0
    assert new_layers[0].keycodes == {'x': 'KC_A', 'y': 'KC_B', 'z': 'KC_C'}


def test_ansi_to_iso_preserves_overlapping_keys_and_blanks_extra():
    """Switching layouts with one extra matrix slot — extra key gets no
    keycode (KC_TRNS implied), all overlapping keys preserved."""
    # Old: 3 keys at (0,0), (0,1), (0,2)
    old_keys = [
        _key('a', row=0, col=0),
        _key('b', row=0, col=1),
        _key('c', row=0, col=2),
    ]
    old_layers = [
        Layer(id='layer0', name='Base', keycodes={'a': 'KC_A', 'b': 'KC_B', 'c': 'KC_C'}),
        Layer(id='layer1', name='Fn', keycodes={'a': 'KC_F1'}),
    ]
    # New layout: ANSI 3 keys + ISO extra at (0,3)
    new_keys = [
        _key('n0', row=0, col=0),
        _key('n1', row=0, col=1),
        _key('n2', row=0, col=2),
        _key('n3', row=0, col=3),  # the "extra" ISO key
    ]

    new_layers, discarded = reconcile_layers(old_keys, old_layers, new_keys)

    assert discarded == 0
    assert new_layers[0].keycodes == {'n0': 'KC_A', 'n1': 'KC_B', 'n2': 'KC_C'}
    # Extra key 'n3' has no entry — caller treats missing as KC_TRNS
    assert 'n3' not in new_layers[0].keycodes
    # Layer 1 only had 'a'
    assert new_layers[1].keycodes == {'n0': 'KC_F1'}


def test_no_matrix_data_falls_back_to_positional_when_counts_match():
    old_keys = [_key('a'), _key('b'), _key('c')]
    old_layers = [Layer(id='l0', name='Base', keycodes={'a': 'KC_A', 'b': 'KC_B', 'c': 'KC_C'})]
    new_keys = [_key('x'), _key('y'), _key('z')]

    new_layers, discarded = reconcile_layers(old_keys, old_layers, new_keys)

    assert discarded == 0
    assert new_layers[0].keycodes == {'x': 'KC_A', 'y': 'KC_B', 'z': 'KC_C'}


def test_no_matrix_data_count_mismatch_copies_nothing():
    old_keys = [_key('a'), _key('b'), _key('c')]
    old_layers = [Layer(id='l0', name='Base', keycodes={'a': 'KC_A', 'b': 'KC_B', 'c': 'KC_C'})]
    new_keys = [_key('x'), _key('y')]  # one fewer, no matrix data

    new_layers, discarded = reconcile_layers(old_keys, old_layers, new_keys)

    assert new_layers[0].keycodes == {}
    # 'c' had a non-trivial keycode and didn't match anywhere
    assert discarded == 3  # actually all three since no matches happened


def test_discarded_count_for_dropped_keys():
    """Old layout has more keys than new; dropped key with non-trivial
    keycode is reported in the discarded count."""
    old_keys = [
        _key('a', row=0, col=0),
        _key('b', row=0, col=1),
        _key('c', row=0, col=2),  # this position is gone in new layout
    ]
    old_layers = [
        Layer(id='l0', name='Base', keycodes={'a': 'KC_A', 'b': 'KC_B', 'c': 'KC_USEFUL'}),
    ]
    new_keys = [
        _key('n0', row=0, col=0),
        _key('n1', row=0, col=1),
    ]

    new_layers, discarded = reconcile_layers(old_keys, old_layers, new_keys)

    assert new_layers[0].keycodes == {'n0': 'KC_A', 'n1': 'KC_B'}
    assert discarded == 1


def test_discarded_ignores_trivial_keycodes():
    """Old keys with only KC_TRNS / KC_NO / blank don't count as discarded."""
    old_keys = [
        _key('a', row=0, col=0),
        _key('b', row=0, col=1),
        _key('c', row=0, col=2),  # only KC_TRNS — shouldn't count
        _key('d', row=0, col=3),  # only KC_NO — shouldn't count
    ]
    old_layers = [
        Layer(id='l0', name='Base', keycodes={
            'a': 'KC_A', 'b': 'KC_B', 'c': 'KC_TRNS', 'd': 'KC_NO',
        }),
    ]
    new_keys = [
        _key('n0', row=0, col=0),
        _key('n1', row=0, col=1),
    ]

    _new_layers, discarded = reconcile_layers(old_keys, old_layers, new_keys)

    assert discarded == 0


def test_matrix_match_takes_priority_over_position():
    """When key counts match but matrix coords disagree with index order,
    the matrix coords win."""
    old_keys = [
        _key('a', row=0, col=0),
        _key('b', row=0, col=1),
    ]
    old_layers = [Layer(id='l0', name='Base', keycodes={'a': 'KC_A', 'b': 'KC_B'})]
    # New layout reverses the matrix order
    new_keys = [
        _key('n0', row=0, col=1),  # matches 'b'
        _key('n1', row=0, col=0),  # matches 'a'
    ]

    new_layers, discarded = reconcile_layers(old_keys, old_layers, new_keys)

    assert discarded == 0
    assert new_layers[0].keycodes == {'n0': 'KC_B', 'n1': 'KC_A'}


def test_empty_string_keycode_not_copied():
    old_keys = [_key('a', row=0, col=0)]
    old_layers = [Layer(id='l0', name='Base', keycodes={'a': ''})]
    new_keys = [_key('n0', row=0, col=0)]

    new_layers, discarded = reconcile_layers(old_keys, old_layers, new_keys)

    assert new_layers[0].keycodes == {}
    assert discarded == 0
