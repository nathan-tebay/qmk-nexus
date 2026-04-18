from __future__ import annotations

from pathlib import Path
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from models import KeyboardConfig
from codegen.keyboard_c import generate_keyboard_c
from codegen.keyboard_h import generate_keyboard_h
from codegen.config_h import generate_config_h
from codegen.rules_mk import generate_rules_mk
from codegen.keymap_c import generate_keymap_c


def generate_all(config: KeyboardConfig, output_dir: Path) -> None:
    """Write all generated firmware files to output_dir/src/."""
    src = output_dir / "src"
    src.mkdir(parents=True, exist_ok=True)

    kb_name = config.name.lower().replace(" ", "_").replace("-", "_")

    files = {
        f"{kb_name}.c": generate_keyboard_c(config),
        f"{kb_name}.h": generate_keyboard_h(config),
        "config.h": generate_config_h(config),
        "rules.mk": generate_rules_mk(config),
        "keymap.c": generate_keymap_c(config),
    }

    for filename, content in files.items():
        (src / filename).write_text(content, encoding="utf-8")
