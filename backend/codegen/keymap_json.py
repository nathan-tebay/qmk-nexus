"""Codegen for QMK Configurator-compatible keymap.json payloads.

This module produces the JSON shape consumed by `qmk compile keymap.json` and
the QMK Configurator (https://config.qmk.fm). It is used when a keyboard's
`source_mode` is `qmk_json` — the user has chosen to delegate the full QMK
build to the upstream toolchain rather than relying on Nexus codegen.
"""
from __future__ import annotations

import json
from typing import Any

from models import KeyboardConfig


_SKELETON: dict[str, Any] = {
    'version': 1,
    'documentation': (
        'This file is a QMK Configurator export. You can import this at '
        '<https://config.qmk.fm>. It can also be used directly with QMK\'s '
        'compile and flash commands. For more information, see the QMK CLI '
        'documentation at <https://docs.qmk.fm>.'
    ),
    'keyboard': '',
    'keymap': 'nexus',
    'layout': '',
    'author': '',
    'notes': '',
    'layers': [],
}


def _resolve_layout(config: KeyboardConfig) -> str:
    """Resolve the layout macro name through layout_aliases."""
    macro = config.layout_macro
    if macro in config.layout_aliases:
        return config.layout_aliases[macro]
    return macro


def _ordered_keycodes(config: KeyboardConfig, canonical_layout: str) -> list[list[str]]:
    """Build the layers list, ordering each layer's keycodes by upstream layout key order."""
    layout_def = config.upstream_layouts.get(canonical_layout) if config.upstream_layouts else None

    if layout_def and isinstance(layout_def, dict) and isinstance(layout_def.get('layout'), list):
        # Match upstream key order by (matrix row, matrix col). The upstream layout
        # entries don't carry our internal key ids, so we look up keys in our own
        # config by matching matrix coordinates.
        upstream_keys = layout_def['layout']
        key_order: list[str | None] = []
        by_matrix = {
            (k.row, k.col): k.id
            for k in config.keys
            if k.row is not None and k.col is not None
        }
        for entry in upstream_keys:
            if not isinstance(entry, dict):
                key_order.append(None)
                continue
            matrix = entry.get('matrix')
            if isinstance(matrix, list) and len(matrix) == 2:
                key_order.append(by_matrix.get((matrix[0], matrix[1])))
            else:
                key_order.append(None)
    else:
        # Fallback: order by config.keys directly (only keys with matrix assignments).
        key_order = [
            k.id for k in config.keys
            if k.row is not None and k.col is not None
        ]

    layers: list[list[str]] = []
    for layer in config.layers:
        row: list[str] = []
        for key_id in key_order:
            if key_id is None:
                row.append('KC_TRNS')
            else:
                row.append(layer.keycodes.get(key_id, 'KC_TRNS'))
        layers.append(row)
    return layers


def generate_keymap_json(config: KeyboardConfig) -> str:
    """Render a QMK Configurator-compatible keymap.json string.

    Raises:
        ValueError: if `config.upstream_keyboard` is missing — required for qmk_json mode.
    """
    if not config.upstream_keyboard:
        raise ValueError('qmk_json source mode requires upstream_keyboard to be set')

    canonical_layout = _resolve_layout(config)

    payload: dict[str, Any] = {**_SKELETON}
    payload['keyboard'] = config.upstream_keyboard
    payload['keymap'] = config.keymap_name or 'nexus'
    payload['layout'] = canonical_layout
    payload['author'] = config.author
    payload['notes'] = config.notes
    payload['layers'] = _ordered_keycodes(config, canonical_layout)

    return json.dumps(payload, indent=2)
