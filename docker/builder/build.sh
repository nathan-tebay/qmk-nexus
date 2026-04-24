#!/bin/bash
# Invoked by the QMK Nexus backend with /build mounted.
# Expected layout:
#   /build/src/   — keyboard.c, keyboard.h, config.h, rules.mk, keymap.c, info.json
#   /build/output/ — created by this script; .hex/.bin/.uf2 written here
#
# Env vars:
#   TARGET_MCU    — e.g. "atmega32u4", "rp2040" (required)
#   KEYBOARD_NAME — used as QMK keyboard identifier (default: "keyboard")

set -euo pipefail

SRC_DIR=/build/src
OUT_DIR=/build/output
QMK_HOME="${QMK_HOME:-/qmk_firmware}"
KEYBOARD_NAME="${KEYBOARD_NAME:-keyboard}"
MCU="${TARGET_MCU:-atmega32u4}"

# Sanitize: lowercase letters, digits, underscores only
KB_NAME=$(echo "$KEYBOARD_NAME" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9_' '_' | sed 's/_*$//')

mkdir -p "$OUT_DIR"

echo "[builder] MCU=${MCU} keyboard=${KB_NAME}"
echo "[builder] Source files:"
ls -1 "$SRC_DIR"

# ── Set up QMK keyboard directory structure ───────────────────────────────

KB_DIR="${QMK_HOME}/keyboards/${KB_NAME}"
KM_DIR="${KB_DIR}/keymaps/default"
mkdir -p "$KB_DIR" "$KM_DIR"

# Core keyboard files
for f in "${KB_NAME}.c" "${KB_NAME}.h" config.h rules.mk; do
    [ -f "${SRC_DIR}/${f}" ] && cp "${SRC_DIR}/${f}" "${KB_DIR}/${f}"
done

# info.json (modern QMK layout descriptor)
[ -f "${SRC_DIR}/info.json" ] && cp "${SRC_DIR}/info.json" "${KB_DIR}/info.json"

# Keymap
cp "${SRC_DIR}/keymap.c" "${KM_DIR}/keymap.c"

echo "[builder] Keyboard dir:"
ls -1 "$KB_DIR"

# ── Compile with QMK make ─────────────────────────────────────────────────

echo "[builder] Running QMK make ${KB_NAME}:default ..."
make -j"$(nproc)" -C "$QMK_HOME" "${KB_NAME}:default" 2>&1

# ── Collect artifacts ─────────────────────────────────────────────────────

echo "[builder] Collecting artifacts..."
find "${QMK_HOME}/.build" -maxdepth 1 \
    \( -name "${KB_NAME}_default.hex" -o -name "${KB_NAME}_default.bin" -o -name "${KB_NAME}_default.uf2" \) \
    -exec cp -v {} "${OUT_DIR}/" \; 2>/dev/null || true

# Fallback: any .hex/.bin/.uf2 in .build
find "${QMK_HOME}/.build" -maxdepth 1 \
    \( -name "*.hex" -o -name "*.bin" -o -name "*.uf2" \) \
    -exec cp -n {} "${OUT_DIR}/" \; 2>/dev/null || true

echo "[builder] Done."
ls -lh "$OUT_DIR"
