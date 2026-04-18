#!/bin/bash
# Invoked by the tebay-qmk backend with /build mounted.
# Expected layout:
#   /build/src/   — generated keyboard.c, keymap.c, config.h, rules.mk, etc.
#   /build/output/ — created by this script; .hex/.bin/.uf2 written here
#
# Env vars:
#   TARGET_MCU   — e.g. "atmega32u4", "rp2040", "stm32f303" (required)
#   KEYBOARD_NAME — used for output filename (default: "keyboard")

set -euo pipefail

SRC_DIR=/build/src
OUT_DIR=/build/output
KEYBOARD_NAME="${KEYBOARD_NAME:-keyboard}"
MCU="${TARGET_MCU:-atmega32u4}"

mkdir -p "$OUT_DIR"

echo "[builder] MCU=${MCU} keyboard=${KEYBOARD_NAME}"
echo "[builder] Source files:"
ls -1 "$SRC_DIR"

cd "$SRC_DIR"

# ── Select toolchain and flags based on MCU ───────────────────────────────

case "$MCU" in
    atmega32u4|atmega32u2|at90usb1286|atmega328p)
        COMPILER=avr-gcc
        OBJCOPY=avr-objcopy
        ARCH_FLAGS="-mmcu=${MCU} -DF_CPU=16000000UL -Os -ffunction-sections -fdata-sections"
        OUTPUT_EXT=hex
        ;;
    stm32f072|stm32f103|stm32f303)
        COMPILER=arm-none-eabi-gcc
        OBJCOPY=arm-none-eabi-objcopy
        case "$MCU" in
            stm32f072) CPU_FLAGS="-mcpu=cortex-m0 -mthumb -DF_CPU=48000000UL" ;;
            stm32f103) CPU_FLAGS="-mcpu=cortex-m3 -mthumb -DF_CPU=72000000UL" ;;
            stm32f303) CPU_FLAGS="-mcpu=cortex-m4 -mthumb -mfpu=fpv4-sp-d16 -mfloat-abi=hard -DF_CPU=72000000UL" ;;
        esac
        ARCH_FLAGS="${CPU_FLAGS} -Os -ffunction-sections -fdata-sections"
        OUTPUT_EXT=bin
        ;;
    rp2040)
        COMPILER=arm-none-eabi-gcc
        OBJCOPY=arm-none-eabi-objcopy
        ARCH_FLAGS="-mcpu=cortex-m0plus -mthumb -DF_CPU=133000000UL -Os -ffunction-sections -fdata-sections"
        OUTPUT_EXT=uf2
        ;;
    *)
        echo "[builder] ERROR: Unknown MCU '${MCU}'. Supported: atmega32u4, atmega32u2, at90usb1286, atmega328p, stm32f072, stm32f103, stm32f303, rp2040"
        exit 1
        ;;
esac

echo "[builder] Compiler: ${COMPILER}"
echo "[builder] Flags: ${ARCH_FLAGS}"

# ── Build via Makefile if present, else direct compile ────────────────────

if [ -f Makefile ]; then
    echo "[builder] Building with Makefile..."
    make -j"$(nproc)" TARGET_MCU="$MCU" KEYBOARD_NAME="$KEYBOARD_NAME" 2>&1
else
    echo "[builder] No Makefile found — compiling directly..."
    C_SOURCES=$(find . -name "*.c" | tr '\n' ' ')
    ELF_OUT="${OUT_DIR}/${KEYBOARD_NAME}.elf"

    # shellcheck disable=SC2086
    ${COMPILER} ${ARCH_FLAGS} \
        -I. \
        -Wall -Wno-unused-function \
        ${C_SOURCES} \
        -o "${ELF_OUT}" \
        -Wl,--gc-sections 2>&1

    echo "[builder] Linked ELF: ${ELF_OUT}"

    case "$OUTPUT_EXT" in
        hex)
            ${OBJCOPY} -O ihex -R .eeprom "${ELF_OUT}" "${OUT_DIR}/${KEYBOARD_NAME}.hex"
            echo "[builder] Output: ${OUT_DIR}/${KEYBOARD_NAME}.hex"
            ;;
        bin)
            ${OBJCOPY} -O binary "${ELF_OUT}" "${OUT_DIR}/${KEYBOARD_NAME}.bin"
            echo "[builder] Output: ${OUT_DIR}/${KEYBOARD_NAME}.bin"
            ;;
        uf2)
            ${OBJCOPY} -O binary "${ELF_OUT}" "${OUT_DIR}/${KEYBOARD_NAME}.bin"
            if command -v elf2uf2 &>/dev/null; then
                elf2uf2 "${ELF_OUT}" "${OUT_DIR}/${KEYBOARD_NAME}.uf2"
                echo "[builder] Output: ${OUT_DIR}/${KEYBOARD_NAME}.uf2"
            else
                echo "[builder] WARN: elf2uf2 not found — producing .bin only"
                echo "[builder] Output: ${OUT_DIR}/${KEYBOARD_NAME}.bin"
            fi
            ;;
    esac
fi

echo "[builder] Copying all artifacts to ${OUT_DIR}..."
find . -maxdepth 2 \( -name "*.hex" -o -name "*.bin" -o -name "*.uf2" \) \
    -exec cp -n {} "${OUT_DIR}/" \; 2>/dev/null || true

echo "[builder] Done."
ls -lh "$OUT_DIR"
