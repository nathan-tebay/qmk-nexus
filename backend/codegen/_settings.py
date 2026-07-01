"""Shared, extensible EEPROM user-settings scaffold for generated firmware.

QMK gives every keymap a small persistent "user" datablock in EEPROM, exposed
through ``eeconfig_read_user`` / ``eeconfig_update_user`` (a single 32-bit word)
or, for anything larger, the ``EECONFIG_USER_DATA_SIZE`` +
``eeconfig_read_user_datablock`` / ``eeconfig_update_user_datablock`` API.

This module turns that low-level API into a *registry*: codegen modules declare
the fields they need (a C type, a name, and a default), and this helper emits a
single packed ``nexus_user_config_t`` struct, the matching
``nexus_user_config_t g_nexus_config`` global, and the standard eeconfig hooks
(``eeconfig_init_user`` for defaults, plus load on ``keyboard_post_init_user``).

Phase C registers a single ``uint8_t active_mode`` field for device-mode
switching. Phase D (OLED settings menu) can register additional fields (e.g.
brightness, a flags byte) WITHOUT touching any C-emitting code: it just appends
``SettingsField`` descriptors to the registry returned by :func:`collect_fields`.

Everything here is gated by the caller — :func:`collect_fields` returns an empty
list unless a feature actually needs persisted settings, and the keyboard.c /
keymap.c generators emit nothing when the list is empty. That keeps output
byte-identical for existing configs.
"""
from __future__ import annotations

from dataclasses import dataclass

from models import KeyboardConfig

# The persisted config global. Other generated code reads/writes fields on this
# struct (e.g. ``g_nexus_config.active_mode``) and calls update_settings() to
# flush to EEPROM.
CONFIG_GLOBAL = 'g_nexus_config'
CONFIG_TYPE = 'nexus_user_config_t'

# Helper that flushes g_nexus_config back to EEPROM. Emitted alongside the
# struct so any handler (MODE_NEXT today, OLED menu in Phase D) can persist a
# change with a single call rather than open-coding the eeconfig API.
UPDATE_FN = 'nexus_settings_save'

# Custom keycode (SAFE_RANGE enum value, like DPI_NEXT) that cycles the active
# device mode. Shared contract name used by the Phase C frontend agent.
MODE_NEXT_KEYCODE = 'MODE_NEXT'

# Custom keycodes (SAFE_RANGE enum values, like MODE_NEXT/DPI_NEXT) that drive
# the OLED settings menu when its input mode is 'keys'. Shared contract names
# used by the Phase D frontend agent.
MENU_UP_KEYCODE = 'MENU_UP'
MENU_DOWN_KEYCODE = 'MENU_DOWN'
MENU_SEL_KEYCODE = 'MENU_SEL'

# Canonical device-mode ordering. config.device_modes is validated against this
# set; the runtime active_mode is an index into the *enabled* subset.
VALID_DEVICE_MODES = ('keyboard', 'mouse', 'joystick')

# Canonical order of the settings a menu may expose. A menu's menu_settings is
# filtered against this tuple so the rendered cursor order + any generated field
# order is stable and matches what the frontend renders.
MENU_SETTINGS = ('dpi_stage', 'device_mode', 'rgb_brightness', 'joystick_enabled')


def enabled_device_modes(config: KeyboardConfig) -> list[str]:
    """Return the configured device modes filtered to known values, in order.

    De-duplicates while preserving first-seen order so the runtime index used by
    active_mode is stable and matches what the frontend renders.
    """
    seen: set[str] = set()
    result: list[str] = []
    for mode in (config.device_modes or []):
        if mode in VALID_DEVICE_MODES and mode not in seen:
            seen.add(mode)
            result.append(mode)
    return result


@dataclass(frozen=True)
class SettingsField:
    """One field in the packed nexus_user_config_t struct.

    c_type:  C type as written in the struct (e.g. 'uint8_t').
    name:    struct member name; also used by accessing codegen modules.
    default: integer default assigned in eeconfig_init_user.
    comment: optional trailing comment describing the field.
    """
    c_type: str
    name: str
    default: int
    comment: str = ''


def device_mode_switching_active(config: KeyboardConfig) -> bool:
    """True when device-mode switching is configured (>=2 modes).

    Empty or a single mode means the feature is inactive, so no settings block,
    no MODE_NEXT keycode, and no report gating are emitted.
    """
    return len(enabled_device_modes(config)) >= 2


def menu_oleds(config: KeyboardConfig):
    """Return the OLED elements that have an active settings menu.

    An OLED counts only when ``menu_enabled`` is set AND it exposes at least one
    known adjustable setting. Order follows ``config.oleds`` so the master/slave
    dispatch in keyboard.c stays stable.
    """
    result = []
    for oled in (config.oleds or []):
        if not getattr(oled, 'menu_enabled', False):
            continue
        if not menu_settings_for(oled):
            continue
        result.append(oled)
    return result


def menu_settings_for(oled) -> list[str]:
    """Return one OLED's exposed settings filtered + ordered canonically."""
    requested = getattr(oled, 'menu_settings', None) or []
    return [s for s in MENU_SETTINGS if s in requested]


def menu_active(config: KeyboardConfig) -> bool:
    """True when any OLED exposes an interactive settings menu."""
    return bool(menu_oleds(config))


def active_menu_settings(config: KeyboardConfig) -> list[str]:
    """Union of all exposed menu settings across every menu OLED, canonical order.

    Used to decide which extra persisted fields the config needs and which menu
    entries any handler must know about.
    """
    seen: set[str] = set()
    for oled in menu_oleds(config):
        for setting in menu_settings_for(oled):
            seen.add(setting)
    return [s for s in MENU_SETTINGS if s in seen]


def menu_input_mode(config: KeyboardConfig) -> str | None:
    """Return the input mode of the first menu OLED (encoder/keys/pointing_tap).

    All menu OLEDs are expected to share one input mode in practice; the first is
    authoritative for generating the single global input handler. None when no
    menu is active.
    """
    oleds = menu_oleds(config)
    if not oleds:
        return None
    return getattr(oleds[0], 'menu_input', 'encoder') or 'encoder'


def collect_fields(config: KeyboardConfig) -> list[SettingsField]:
    """Return the ordered list of settings fields this config needs.

    This is the single extension point for the settings block. Phase C appends
    ``active_mode`` when device-mode switching is active. Phase D appends the
    OLED-menu fields (guarded by their own feature checks); the struct, defaults,
    and eeconfig hooks all regenerate automatically.

    Field ORDER is the EEPROM layout — only ever append, never reorder/remove,
    or previously-flashed boards will read stale values.
    """
    fields: list[SettingsField] = []

    # ---- Phase C ----------------------------------------------------------
    if device_mode_switching_active(config):
        fields.append(
            SettingsField(
                c_type='uint8_t',
                name='active_mode',
                default=0,
                comment='index into the enabled device_modes list',
            )
        )

    # ---- Phase D: OLED settings menu -------------------------------------
    # Appended AFTER the Phase C field(s) to preserve on-EEPROM order.
    # menu_index is the persisted cursor position (which menu row is selected).
    # Per-setting stored values are only appended when they are genuinely NEW:
    #   - dpi_stage    -> already tracked by a static in the DPI_NEXT handler
    #                     (pointing code owns it); no field here.
    #   - device_mode  -> already the Phase C ``active_mode`` field; reused.
    #   - rgb_brightness -> new persisted value.
    #   - joystick_enabled -> new persisted toggle.
    if menu_active(config):
        fields.append(
            SettingsField(
                c_type='uint8_t',
                name='menu_index',
                default=0,
                comment='OLED settings-menu cursor position',
            )
        )
        settings = active_menu_settings(config)
        if 'rgb_brightness' in settings:
            fields.append(
                SettingsField(
                    c_type='uint8_t',
                    name='rgb_brightness',
                    default=0,
                    comment='0 = follow QMK value; else stored RGB brightness',
                )
            )
        if 'joystick_enabled' in settings:
            fields.append(
                SettingsField(
                    c_type='uint8_t',
                    name='joystick_enabled',
                    default=1,
                    comment='menu toggle: 1 = joystick output on',
                )
            )

    return fields


def has_settings(config: KeyboardConfig) -> bool:
    """True when any field is registered (settings block should be emitted)."""
    return bool(collect_fields(config))


def _struct_size_exceeds_word(fields: list[SettingsField]) -> bool:
    """True when the packed struct cannot fit in the 32-bit user word.

    Conservative: sums the byte width of each field by C type. Unknown types are
    assumed >4 bytes so we fall back to the datablock API rather than silently
    truncating. Used only to choose the read/write API + emit a size guard.
    """
    width = {
        'uint8_t': 1, 'int8_t': 1, 'bool': 1,
        'uint16_t': 2, 'int16_t': 2,
        'uint32_t': 4, 'int32_t': 4,
    }
    total = 0
    for field in fields:
        total += width.get(field.c_type, 8)
    return total > 4


def emit_settings_block(config: KeyboardConfig) -> list[str]:
    """Emit the struct, global, eeconfig hooks, and a save helper.

    Returns [] when no fields are registered, keeping output byte-identical for
    configs that don't use any persisted setting.

    For a struct that fits in the 32-bit user word we use the simple
    ``eeconfig_read_user`` / ``eeconfig_update_user`` pair (reinterpreting the
    word as the struct). If a future field set exceeds 4 bytes we switch to the
    ``EECONFIG_USER_DATA_SIZE`` + ``eeconfig_*_user_datablock`` API; the size is
    declared so the QMK build reserves the right amount of EEPROM.
    """
    fields = collect_fields(config)
    if not fields:
        return []

    use_datablock = _struct_size_exceeds_word(fields)

    lines: list[str] = [
        '/* ---- Persistent user settings (EEPROM) -----------------------------',
        ' * Generated by codegen/_settings.py. The struct body is built from a',
        ' * field registry so new settings can be added without editing C. Field',
        ' * order is the on-EEPROM layout: only ever append new fields. */',
        f'typedef struct __attribute__((packed)) {{',
    ]
    for field in fields:
        comment = f'  /* {field.comment} */' if field.comment else ''
        lines.append(f'    {field.c_type} {field.name};{comment}')
    lines.append(f'}} {CONFIG_TYPE};')
    lines.append('')
    lines.append(f'{CONFIG_TYPE} {CONFIG_GLOBAL};')
    lines.append('')

    if use_datablock:
        # Larger-than-word struct: reserve the exact size and use the datablock
        # API. EECONFIG_USER_DATA_SIZE must be visible to QMK's core; emitting it
        # here keeps the size in lockstep with the struct definition.
        lines.append(f'#ifndef EECONFIG_USER_DATA_SIZE')
        lines.append(f'#    define EECONFIG_USER_DATA_SIZE sizeof({CONFIG_TYPE})')
        lines.append(f'#endif')
        lines.append('')
        lines.append(f'void {UPDATE_FN}(void) {{')
        lines.append(f'    eeconfig_update_user_datablock(&{CONFIG_GLOBAL});')
        lines.append('}')
        lines.append('')
        read_call = f'eeconfig_read_user_datablock(&{CONFIG_GLOBAL});'
    else:
        # Fits in the 32-bit user word. Pack/unpack via a uint32_t union-free
        # reinterpret using memcpy so we don't rely on struct == word layout.
        lines.append(f'void {UPDATE_FN}(void) {{')
        lines.append(f'    uint32_t raw = 0;')
        lines.append(f'    memcpy(&raw, &{CONFIG_GLOBAL}, sizeof({CONFIG_GLOBAL}));')
        lines.append(f'    eeconfig_update_user(raw);')
        lines.append('}')
        lines.append('')
        read_call = (
            f'uint32_t raw = eeconfig_read_user();\n'
            f'    memcpy(&{CONFIG_GLOBAL}, &raw, sizeof({CONFIG_GLOBAL}));'
        )

    # Defaults: QMK calls eeconfig_init_user when the user block is unset (first
    # flash or after EEPROM reset), so this is where defaults are applied.
    lines.append('void eeconfig_init_user(void) {')
    for field in fields:
        lines.append(f'    {CONFIG_GLOBAL}.{field.name} = {field.default};')
    lines.append(f'    {UPDATE_FN}();')
    lines.append('}')
    lines.append('')

    # Load the persisted config at startup so every other hook sees live values.
    lines.append('void keyboard_post_init_user(void) {')
    for read_line in read_call.split('\n'):
        lines.append(f'    {read_line}')
    lines.append('}')
    lines.append('')

    return lines
