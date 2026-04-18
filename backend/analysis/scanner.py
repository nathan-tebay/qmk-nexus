"""Keyboard scanner — extract metadata from a single QMK keyboard directory."""

import json
import re
from pathlib import Path

_RULES_MK_FEATURES = [
    "RGB_MATRIX_ENABLE",
    "RGBLIGHT_ENABLE",
    "ENCODER_ENABLE",
    "OLED_ENABLE",
    "SPLIT_KEYBOARD",
    "BACKLIGHT_ENABLE",
    "NKRO_ENABLE",
    "BOOTMAGIC_ENABLE",
    "MOUSEKEY_ENABLE",
    "TAP_DANCE_ENABLE",
    "COMBO_ENABLE",
    "AUDIO_ENABLE",
    "CONSOLE_ENABLE",
    "COMMAND_ENABLE",
    "KEY_LOCK_ENABLE",
    "EXTRAKEY_ENABLE",
]

_JSON_FEATURE_MAP = {
    "rgb_matrix": "RGB_MATRIX_ENABLE",
    "rgblight": "RGBLIGHT_ENABLE",
    "encoder": "ENCODER_ENABLE",
    "oled": "OLED_ENABLE",
    "split_keyboard": "SPLIT_KEYBOARD",
    "backlight": "BACKLIGHT_ENABLE",
    "nkro": "NKRO_ENABLE",
    "bootmagic": "BOOTMAGIC_ENABLE",
    "mousekey": "MOUSEKEY_ENABLE",
    "tap_dance": "TAP_DANCE_ENABLE",
    "combo": "COMBO_ENABLE",
    "audio": "AUDIO_ENABLE",
    "console": "CONSOLE_ENABLE",
    "command": "COMMAND_ENABLE",
    "key_lock": "KEY_LOCK_ENABLE",
    "extrakey": "EXTRAKEY_ENABLE",
}


def _parse_rules_mk(path: Path) -> dict[str, bool]:
    result: dict[str, bool] = {}
    try:
        text = path.read_text(errors="replace")
        for feat in _RULES_MK_FEATURES:
            m = re.search(rf"^\s*{re.escape(feat)}\s*=\s*(\w+)", text, re.MULTILINE)
            if m:
                result[feat] = m.group(1).lower() == "yes"
    except Exception:
        pass
    return result


def _parse_config_h(path: Path) -> dict:
    result: dict = {}
    try:
        text = path.read_text(errors="replace")
        for key in ("MCU", "PROCESSOR"):
            m = re.search(rf"^\s*#\s*define\s+{key}\s+(\S+)", text, re.MULTILINE)
            if m:
                result["mcu"] = m.group(1).strip().lower()
                break
        mr = re.search(r"^\s*#\s*define\s+MATRIX_ROWS\s+(\d+)", text, re.MULTILINE)
        mc = re.search(r"^\s*#\s*define\s+MATRIX_COLS\s+(\d+)", text, re.MULTILINE)
        if mr:
            result["matrix_rows"] = int(mr.group(1))
        if mc:
            result["matrix_cols"] = int(mc.group(1))
    except Exception:
        pass
    return result


def _parse_keyboard_json(path: Path) -> dict:
    result: dict = {}
    try:
        data = json.loads(path.read_text(errors="replace"))
        if "processor" in data:
            result["mcu"] = str(data["processor"]).lower()
        if isinstance(data.get("features"), dict):
            active = [
                rules_key
                for json_key, rules_key in _JSON_FEATURE_MAP.items()
                if data["features"].get(json_key)
            ]
            result["features"] = active
        if "split" in data and isinstance(data["split"], dict):
            result.setdefault("features", [])
            if "SPLIT_KEYBOARD" not in result["features"]:
                result["features"].append("SPLIT_KEYBOARD")
        mp = data.get("matrix_pins", {})
        if "rows" in mp:
            result["matrix_rows"] = len(mp["rows"])
        if "cols" in mp:
            result["matrix_cols"] = len(mp["cols"])
        if "matrix_size" in data:
            ms = data["matrix_size"]
            result.setdefault("matrix_rows", ms.get("rows"))
            result.setdefault("matrix_cols", ms.get("cols"))
    except Exception:
        pass
    return result


def scan_keyboard(keyboard_path: Path) -> dict:
    """Scan a single QMK keyboard directory and return extracted metadata.

    Returns a dict with keys:
      mcu, features, matrix_rows, matrix_cols,
      has_rgb, has_encoder, has_oled, has_split, has_backlight,
      uses_keyboard_json
    """
    kj = keyboard_path / "keyboard.json"
    ij = keyboard_path / "info.json"
    rmk = keyboard_path / "rules.mk"
    cfgh = keyboard_path / "config.h"

    mcu: str | None = None
    features_set: set[str] = set()
    matrix_rows: int | None = None
    matrix_cols: int | None = None
    uses_keyboard_json = False

    for jpath in (kj, ij):
        if jpath.exists():
            uses_keyboard_json = True
            jdata = _parse_keyboard_json(jpath)
            if not mcu and "mcu" in jdata:
                mcu = jdata["mcu"]
            features_set.update(jdata.get("features", []))
            if matrix_rows is None:
                matrix_rows = jdata.get("matrix_rows")
            if matrix_cols is None:
                matrix_cols = jdata.get("matrix_cols")

    if rmk.exists():
        for feat, enabled in _parse_rules_mk(rmk).items():
            if enabled:
                features_set.add(feat)

    if cfgh.exists():
        cdata = _parse_config_h(cfgh)
        if not mcu and "mcu" in cdata:
            mcu = cdata["mcu"]
        if matrix_rows is None:
            matrix_rows = cdata.get("matrix_rows")
        if matrix_cols is None:
            matrix_cols = cdata.get("matrix_cols")

    features = sorted(features_set)

    return {
        "mcu": mcu,
        "features": features,
        "matrix_rows": matrix_rows,
        "matrix_cols": matrix_cols,
        "has_rgb": (
            "RGB_MATRIX_ENABLE" in features_set or "RGBLIGHT_ENABLE" in features_set
        ),
        "has_encoder": "ENCODER_ENABLE" in features_set,
        "has_oled": "OLED_ENABLE" in features_set,
        "has_split": "SPLIT_KEYBOARD" in features_set,
        "has_backlight": "BACKLIGHT_ENABLE" in features_set,
        "uses_keyboard_json": uses_keyboard_json,
    }
