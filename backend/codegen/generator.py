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


def generate_sources(config: KeyboardConfig, *, overrides: dict[str, str] | None = None) -> dict[str, str]:
    """Return canonical filename → content for all generated firmware files."""
    if config.source_mode == 'qmk_native':
        return {
            'qmk_native.json': json.dumps({
                'keyboard': config.upstream_keyboard,
                'keymap': 'nexus',
            }, indent=2),
            'keymap.c': generate_keymap_c(config),
        }

    files = {
        'keyboard.c': generate_keyboard_c(config),
        'keyboard.h': generate_keyboard_h(config),
        'config.h': generate_config_h(config),
        'rules.mk': generate_rules_mk(config),
        'keymap.c': generate_keymap_c(config),
        'info.json': generate_info_json(config),
    }
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
        for rel_path, content in (config.upstream_files or {}).items():
            target = overlay / rel_path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding='utf-8')
