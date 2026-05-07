"""Keycode alias normalization — matches QMK Configurator longFormKeycodes semantics."""
from __future__ import annotations

TRIVIAL_KEYCODES: frozenset[str] = frozenset({'KC_TRNS', 'KC_NO', 'XXXXXXX', ''})

# Long-form → short-form aliases from QMK Configurator
_ALIASES: dict[str, str] = {
    'KC_ENTER': 'KC_ENT',
    'KC_ESCAPE': 'KC_ESC',
    'KC_BSPACE': 'KC_BSPC',
    'KC_BACKSPACE': 'KC_BSPC',
    'KC_DELETE': 'KC_DEL',
    'KC_INSERT': 'KC_INS',
    'KC_PGDOWN': 'KC_PGDN',
    'KC_PRINT': 'KC_PSCR',
    'KC_PAUSE': 'KC_PAUS',
    'KC_RIGHT': 'KC_RGHT',
    'KC_NUMLOCK': 'KC_NUM',
    'KC_CAPSLOCK': 'KC_CAPS',
    'KC_SCROLLLOCK': 'KC_SCRL',
    'KC_LSHIFT': 'KC_LSFT',
    'KC_RSHIFT': 'KC_RSFT',
    'KC_LCTRL': 'KC_LCTL',
    'KC_RCTRL': 'KC_RCTL',
    'KC_LALT': 'KC_LALT',   # no-op but explicit
    'KC_RALT': 'KC_RALT',   # no-op but explicit
    'KC_LGUI': 'KC_LGUI',   # no-op but explicit
    'KC_RGUI': 'KC_RGUI',   # no-op but explicit
    '_______': 'KC_TRNS',
    'XXXXXXX': 'KC_NO',
    'KC_TRANSPARENT': 'KC_TRNS',
    'KC_NOKEY': 'KC_NO',
    # Function key long forms
    'KC_F1': 'KC_F1',    # already short
    # Number row
    'KC_1': 'KC_1',
    # Common punctuation long forms (QMK sometimes uses these)
    'KC_MINUS': 'KC_MINS',
    'KC_EQUAL': 'KC_EQL',
    'KC_LBRACKET': 'KC_LBRC',
    'KC_RBRACKET': 'KC_RBRC',
    'KC_BSLASH': 'KC_BSLS',
    'KC_SCOLON': 'KC_SCLN',
    'KC_QUOTE': 'KC_QUOT',
    'KC_GRAVE': 'KC_GRV',
    'KC_COMMA': 'KC_COMM',
    'KC_DOT': 'KC_DOT',    # no-op
    'KC_SLASH': 'KC_SLSH',
    'KC_SPACE': 'KC_SPC',
    'KC_TAB': 'KC_TAB',
    # Numpad
    'KC_KP_SLASH': 'KC_PSLS',
    'KC_KP_ASTERISK': 'KC_PAST',
    'KC_KP_MINUS': 'KC_PMNS',
    'KC_KP_PLUS': 'KC_PPLS',
    'KC_KP_ENTER': 'KC_PENT',
    'KC_KP_DOT': 'KC_PDOT',
    'KC_KP_0': 'KC_P0',
    'KC_KP_1': 'KC_P1',
    'KC_KP_2': 'KC_P2',
    'KC_KP_3': 'KC_P3',
    'KC_KP_4': 'KC_P4',
    'KC_KP_5': 'KC_P5',
    'KC_KP_6': 'KC_P6',
    'KC_KP_7': 'KC_P7',
    'KC_KP_8': 'KC_P8',
    'KC_KP_9': 'KC_P9',
}


def normalize_keycode(kc: str) -> str:
    """Normalize a keycode alias to its canonical short form.

    Handles:
    - Long-form aliases (KC_ENTER → KC_ENT)
    - _______ → KC_TRNS
    - XXXXXXX → KC_NO
    - Unknown keycodes are returned unchanged (literal pass-through)
    """
    if not kc:
        return kc
    stripped = kc.strip()
    return _ALIASES.get(stripped, stripped)


def normalize_layer(keycodes: list[str]) -> list[str]:
    """Normalize a list of keycodes (a full layer)."""
    return [normalize_keycode(kc) for kc in keycodes]


def normalize_layers(layers: list[list[str]]) -> list[list[str]]:
    """Normalize all layers."""
    return [normalize_layer(layer) for layer in layers]
