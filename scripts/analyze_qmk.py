#!/usr/bin/env python3
"""Scan QMK keyboards/ tree and extract patterns into candidate_modules.json."""

import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

QMK_KEYBOARDS = Path("/mnt/LargeNVMe/Projects/GitHub/personal/qmk_firmware/keyboards")
OUTPUT = Path(__file__).parent / "candidate_modules.json"

RULES_MK_FEATURES = [
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

JSON_FEATURE_MAP = {
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


def _parse_rules_mk(path: Path) -> dict:
    features = {}
    try:
        text = path.read_text(errors="replace")
        for feat in RULES_MK_FEATURES:
            m = re.search(rf"^\s*{re.escape(feat)}\s*=\s*(\w+)", text, re.MULTILINE)
            if m:
                features[feat] = m.group(1).lower() == "yes"
    except Exception:
        pass
    return features


def _parse_config_h(path: Path) -> dict:
    result = {}
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
    result = {}
    try:
        data = json.loads(path.read_text(errors="replace"))
        if "processor" in data:
            result["mcu"] = str(data["processor"]).lower()
        if "features" in data and isinstance(data["features"], dict):
            active = []
            for json_key, rules_key in JSON_FEATURE_MAP.items():
                if data["features"].get(json_key):
                    active.append(rules_key)
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
            result["matrix_rows"] = ms.get("rows", result.get("matrix_rows"))
            result["matrix_cols"] = ms.get("cols", result.get("matrix_cols"))
    except Exception:
        pass
    return result


def _collect_keyboard_dirs(root: Path) -> list[Path]:
    """Return all directories that contain at least one of keyboard.json/info.json/rules.mk/config.h."""
    marker_names = {"keyboard.json", "info.json", "rules.mk", "config.h"}
    keyboard_dirs = set()
    for marker in marker_names:
        for p in root.rglob(marker):
            keyboard_dirs.add(p.parent)
    return list(keyboard_dirs)


def scan_all() -> dict:
    dirs = _collect_keyboard_dirs(QMK_KEYBOARDS)

    total = len(dirs)
    modern = 0
    legacy_only = 0

    mcu_counter: Counter = Counter()
    feature_counter: Counter = Counter()
    matrix_rows_counter: Counter = Counter()
    matrix_cols_counter: Counter = Counter()

    for d in dirs:
        kj = d / "keyboard.json"
        ij = d / "info.json"
        rmk = d / "rules.mk"
        cfgh = d / "config.h"

        has_modern = kj.exists() or ij.exists()
        if has_modern:
            modern += 1
        else:
            legacy_only += 1

        mcu = None
        features_set: set[str] = set()
        matrix_rows = None
        matrix_cols = None

        for jpath in (kj, ij):
            if jpath.exists():
                jdata = _parse_keyboard_json(jpath)
                if not mcu and "mcu" in jdata:
                    mcu = jdata["mcu"]
                features_set.update(jdata.get("features", []))
                if matrix_rows is None:
                    matrix_rows = jdata.get("matrix_rows")
                if matrix_cols is None:
                    matrix_cols = jdata.get("matrix_cols")

        if rmk.exists():
            rdata = _parse_rules_mk(rmk)
            for feat, enabled in rdata.items():
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

        if mcu:
            mcu_counter[mcu] += 1
        for f in features_set:
            feature_counter[f] += 1
        if matrix_rows is not None:
            matrix_rows_counter[matrix_rows] += 1
        if matrix_cols is not None:
            matrix_cols_counter[matrix_cols] += 1

    return {
        "total_keyboards": total,
        "modern_count": modern,
        "legacy_only_count": legacy_only,
        "modern_ratio": round(modern / total, 4) if total else 0,
        "mcu_distribution": dict(mcu_counter.most_common(20)),
        "feature_counts": dict(feature_counter.most_common()),
        "feature_prevalence": {
            k: round(v / total, 4) for k, v in feature_counter.most_common()
        } if total else {},
        "matrix_rows_distribution": {str(k): v for k, v in sorted(matrix_rows_counter.items())},
        "matrix_cols_distribution": {str(k): v for k, v in sorted(matrix_cols_counter.items())},
    }


def print_summary(data: dict) -> None:
    total = data["total_keyboards"]
    print(f"QMK Keyboard Analysis")
    print(f"{'='*50}")
    print(f"Total keyboards scanned : {total}")
    print(f"Modern (keyboard.json)  : {data['modern_count']} ({data['modern_ratio']*100:.1f}%)")
    print(f"Legacy only (rules.mk)  : {data['legacy_only_count']}")
    print()

    print("Top MCUs:")
    for mcu, count in list(data["mcu_distribution"].items())[:10]:
        pct = count / total * 100 if total else 0
        print(f"  {mcu:<30} {count:>5}  ({pct:5.1f}%)")
    print()

    print("Feature Prevalence:")
    for feat, prev in data["feature_prevalence"].items():
        count = data["feature_counts"][feat]
        bar = "#" * int(prev * 40)
        print(f"  {feat:<30} {count:>5}  ({prev*100:5.1f}%)  {bar}")
    print()

    print("Matrix Rows Distribution (top 10):")
    rows_sorted = sorted(data["matrix_rows_distribution"].items(), key=lambda x: -x[1])
    for r, c in rows_sorted[:10]:
        print(f"  rows={r:<4} {c:>5} keyboards")

    print()
    print("Matrix Cols Distribution (top 10):")
    cols_sorted = sorted(data["matrix_cols_distribution"].items(), key=lambda x: -x[1])
    for c, n in cols_sorted[:10]:
        print(f"  cols={c:<4} {n:>5} keyboards")


def main() -> None:
    print("Scanning QMK keyboards tree...", flush=True)
    data = scan_all()
    print_summary(data)
    OUTPUT.write_text(json.dumps(data, indent=2))
    print(f"\nWrote results to {OUTPUT}")


if __name__ == "__main__":
    main()
