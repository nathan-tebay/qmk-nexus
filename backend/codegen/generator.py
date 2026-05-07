from __future__ import annotations

import json
from pathlib import Path

from models import KeyboardConfig
from codegen.keyboard_c import generate_keyboard_c
from codegen.keyboard_h import generate_keyboard_h
from codegen.config_h import generate_config_h
from codegen.rules_mk import generate_rules_mk
from codegen.keymap_c import generate_keymap_c
from codegen.info_json import generate_info_json
from naming import safe_name


_CANONICAL_MAP = {'keyboard.c': '{kb}.c', 'keyboard.h': '{kb}.h'}


def _generate_qmk_json(config: KeyboardConfig) -> dict[str, str]:
    from codegen.keymap_json import generate_keymap_json
    from codegen.validator import validate_keymap_json
    import json as _json
    payload_str = generate_keymap_json(config)
    errors = validate_keymap_json(_json.loads(payload_str))
    if errors:
        raise ValueError(f'Invalid keymap.json: {"; ".join(errors)}')
    return {'keymap.json': payload_str}


def _generate_qmk_native(config: KeyboardConfig) -> dict[str, str]:
    return {
        'qmk_native.json': json.dumps({
            'keyboard': config.upstream_keyboard,
            'keymap': 'nexus',
        }, indent=2),
        'keymap.c': generate_keymap_c(config),
    }


_MK20DX256_MCUCONF = """\
#pragma once
#ifndef _MCUCONF_H_
#define _MCUCONF_H_

#define K20x_MCUCONF
#define K20x7

#define KINETIS_NO_INIT                     FALSE
#define KINETIS_MCG_MODE                    KINETIS_MCG_MODE_PEE
#define KINETIS_PLLCLK_FREQUENCY            72000000UL
#define KINETIS_SYSCLK_FREQUENCY            72000000UL
#define KINETIS_BUSCLK_FREQUENCY            36000000UL
#define KINETIS_FLASHCLK_FREQUENCY          24000000UL

#define KINETIS_SERIAL_USE_UART0            TRUE
#define KINETIS_USB_USE_USB0                TRUE
#define KINETIS_USB_USB0_IRQ_PRIORITY       5
#define KINETIS_I2C_USE_I2C0                TRUE
#define KINETIS_SPI_USE_SPI0                TRUE

#endif /* _MCUCONF_H_ */
"""

_MCU_EXTRA_HEADERS: dict[str, dict[str, str]] = {
    'mk20dx256': {'mcuconf.h': _MK20DX256_MCUCONF},
}


def _generate_full(config: KeyboardConfig) -> dict[str, str]:
    info = generate_info_json(config)
    files: dict[str, str] = {
        'keyboard.c': generate_keyboard_c(config),
        'keyboard.h': generate_keyboard_h(config),
        'config.h': generate_config_h(config),
        'rules.mk': generate_rules_mk(config),
        'keymap.c': generate_keymap_c(config),
        'info.json': info,
        'keyboard.json': info,
    }
    mcu = (config.mcu or 'atmega32u4').lower()
    files.update(_MCU_EXTRA_HEADERS.get(mcu, {}))
    return files


_SOURCE_GENERATORS = {
    'qmk_json': _generate_qmk_json,
    'qmk_native': _generate_qmk_native,
    'generated': _generate_full,
}


def generate_sources(config: KeyboardConfig, *, overrides: dict[str, str] | None = None) -> dict[str, str]:
    """Return canonical filename → content for all generated firmware files."""
    generator = _SOURCE_GENERATORS.get(config.source_mode)
    if generator is None:
        raise ValueError(f'Unsupported source mode: {config.source_mode}')
    files = generator(config)
    if overrides:
        for canonical, content in overrides.items():
            if canonical in files:
                files[canonical] = content
    return files


def generate_all(config: KeyboardConfig, output_dir: Path) -> None:
    """Write all generated firmware files to output_dir/src/, applying custom overrides."""
    src = output_dir / "src"
    src.mkdir(parents=True, exist_ok=True)

    kb_name = safe_name(config.name)
    files = generate_sources(config, overrides=config.custom_files)

    for canonical_name, content in files.items():
        template = _CANONICAL_MAP.get(canonical_name)
        actual_name = template.format(kb=kb_name) if template else canonical_name
        (src / actual_name).write_text(content, encoding='utf-8')

    if config.source_mode == 'qmk_native':
        overlay = output_dir / 'upstream_overlay'
        overlay.mkdir(parents=True, exist_ok=True)
        overlay_resolved = overlay.resolve()
        for rel_path, content in (config.upstream_files or {}).items():
            if (
                not isinstance(rel_path, str)
                or not rel_path
                or rel_path.startswith('/')
                or '\x00' in rel_path
                or '..' in Path(rel_path).parts
            ):
                raise ValueError(f'upstream_files key escapes overlay dir: {rel_path!r}')
            target = (overlay / rel_path).resolve()
            try:
                target.relative_to(overlay_resolved)
            except ValueError:
                raise ValueError(f'upstream_files key escapes overlay dir: {rel_path!r}')
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding='utf-8')
