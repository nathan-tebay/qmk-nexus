"""Shared helpers for pointing-device (trackball) DPI codegen.

Both keyboard.c (init + LED-indicator helper) and keymap.c (the DPI_NEXT
custom keycode + process_record_user case) need a consistent view of the
configured trackball, its DPI stages, and its indicator. Centralising the
selection logic here keeps the two generators in sync (DRY).

Everything is gated so that a config without a trackball / dpi_stages /
dpi_indicator yields empty output, preserving byte-identical generation for
existing configs.
"""
from __future__ import annotations

from models import KeyboardConfig, TrackballElement

# Name of the custom keycode that cycles DPI stages. Emitted into the user
# SAFE_RANGE enum in keymap.c and recognised as a real keycode token.
DPI_NEXT_KEYCODE = 'DPI_NEXT'

# Name of the (non-static) LED-indicator helper emitted in keyboard.c. keymap.c
# forward-declares and calls it so the indicator update is shared between the
# init path and the DPI_NEXT handler.
DPI_INDICATOR_FN = 'nx_dpi_indicator_update'


def active_trackball(config: KeyboardConfig) -> TrackballElement | None:
    """Return the configured trackball when pointing_device is enabled."""
    if not (config.features or {}).get('pointing_device'):
        return None
    trackballs = config.trackballs or []
    return trackballs[0] if trackballs else None


def dpi_stages(config: KeyboardConfig) -> list[int]:
    """Return the configured, sanitised DPI stage list (may be empty)."""
    ball = active_trackball(config)
    if ball is None:
        return []
    return [int(stage) for stage in (ball.dpi_stages or []) if int(stage) > 0]


def default_cpi(config: KeyboardConfig) -> int | None:
    """Resolve the startup CPI: explicit cpi, else first DPI stage, else None."""
    ball = active_trackball(config)
    if ball is None:
        return None
    if ball.cpi and int(ball.cpi) > 0:
        return int(ball.cpi)
    stages = dpi_stages(config)
    return stages[0] if stages else None


def indicator_mode(config: KeyboardConfig) -> str:
    """Return the DPI indicator mode ('off' when unset/disabled)."""
    ball = active_trackball(config)
    if ball is None or ball.dpi_indicator is None:
        return 'off'
    return ball.dpi_indicator.mode or 'off'


def _lighting_enabled(config: KeyboardConfig) -> bool:
    features = config.features or {}
    return bool(features.get('rgb_matrix') or features.get('rgblight'))


def rgb_indicator_active(config: KeyboardConfig) -> bool:
    """True when an RGB DPI indicator should be generated."""
    if indicator_mode(config) != 'rgb' or not _lighting_enabled(config):
        return False
    ball = active_trackball(config)
    return bool(ball and ball.dpi_indicator and ball.dpi_indicator.colors)


def pins_indicator_active(config: KeyboardConfig) -> bool:
    """True when a GPIO-pin DPI indicator should be generated."""
    if indicator_mode(config) != 'pins':
        return False
    ball = active_trackball(config)
    return bool(ball and ball.dpi_indicator and ball.dpi_indicator.pins)


def has_indicator(config: KeyboardConfig) -> bool:
    return rgb_indicator_active(config) or pins_indicator_active(config)


def color_to_rgb(color: str) -> tuple[int, int, int]:
    """Convert a configured color string to an (r, g, b) triplet.

    Accepts ``#RRGGBB`` / ``RRGGBB`` hex; falls back to white on anything
    unparseable so generated code always compiles.
    """
    text = (color or '').strip().lstrip('#')
    if len(text) == 6:
        try:
            return (int(text[0:2], 16), int(text[2:4], 16), int(text[4:6], 16))
        except ValueError:
            pass
    return (255, 255, 255)

