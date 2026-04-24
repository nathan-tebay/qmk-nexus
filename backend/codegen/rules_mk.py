from __future__ import annotations

from models import KeyboardConfig


def generate_rules_mk(config: KeyboardConfig) -> str:
    lines: list[str] = []
    fc = config.feature_configs or {}

    # MCU
    mcu = config.mcu or "atmega32u4"
    if "avr" in mcu.lower():
        lines.append("BUILD_UNVERSIONED = yes")
        lines.append("TARGET = " + mcu)
        lines.append("AVR_FREQ = 16000000")
        lines.append("OPT_DEFS = -DCLKOUT_ENABLE")
        lines.append("OPT_DEFS += -DCLKOUT_TIMER=TIMER_D -DCLKOUT_PIN=PIN_D7")
    elif "ch" in mcu.lower():
        lines.append("TARGET = " + mcu)
        lines.append("TARGET_ARCH = ARM")
    else:
        lines.append("TARGET = " + mcu)
    lines.append("")

    # USB metadata
    lines.append(f"VENDOR_ID       = {config.usb_vid or '0xFEED'}")
    lines.append(f"PRODUCT_ID      = {config.usb_pid or '0x0000'}")
    lines.append("")

    # USB device description
    desc = {
        "manufacturer": config.manufacturer or "QMK Nexus",
        "product": config.name or "Custom Keyboard",
    }
    lines.append('USB_DEVICE descriptor = ' + str(desc).replace("'", '"'))
    lines.append("")

    # Matrix
    lines.append(f"MATRIX_ROWS = {config.matrix_rows or 4}")
    lines.append(f"MATRIX_COLS = {config.matrix_cols or 6}")
    lines.append("")

    # Features
    features = config.features or {}

    if features.get("rgb_matrix", False):
        lines.append("RGBLIGHT_ENABLE = yes")
        lines.append("RGB_MATRIX_ENABLE = yes")
        lines.append("RGB_MATRIX_DRIVER = WS2812")
        if config.rgb_led_pin:
            lines.append(f"RGB_DI_PIN = {config.rgb_led_pin}")
        max_bright = fc.get("rgb_matrix", {}).get("RGB_MATRIX_MAXIMUM_BRIGHTNESS", "255")
        lines.append(f"RGB_MATRIX_MAXIMUM_BRIGHTNESS = {max_bright}")
        default_mode = fc.get("rgb_matrix", {}).get("RGB_MATRIX_DEFAULT_MODE", "RGB_MATRIX_EFFECT_BREATHING")
        lines.append(f"RGB_MATRIX_DEFAULT_MODE = {default_mode}")
        sleep = fc.get("rgb_matrix", {}).get("RGB_MATRIX_SLEEP", "yes")
        lines.append(f"RGB_MATRIX_SLEEP = {sleep}")
        lines.append("")

    if features.get("backlight", False):
        lines.append("BACKLIGHT_ENABLE = yes")
        levels = fc.get("backlight", {}).get("BACKLIGHT_LEVELS", "3")
        lines.append(f"BACKLIGHT_LEVELS = {levels}")
        breathing = fc.get("backlight", {}).get("BACKLIGHT_BREATHING", "no")
        lines.append(f"BACKLIGHT_BREATHING = {breathing}")
        lines.append("")

    if features.get("oled", False):
        lines.append("OLED_ENABLE = yes")
        brightness = fc.get("oled", {}).get("OLED_BRIGHTNESS", "255")
        lines.append(f"OLED_BRIGHTNESS = {brightness}")
        timeout = fc.get("oled", {}).get("OLED_TIMEOUT", "20000")
        lines.append(f"OLED_TIMEOUT = {timeout}")
        lines.append("")

    if features.get("encoder", False):
        lines.append("ENCODER_ENABLE = yes")
        resolution = fc.get("encoder", {}).get("ENCODER_RESOLUTION", "4")
        lines.append(f"ENCODER_RESOLUTION = {resolution}")
        lines.append("")

    if features.get("nkro", False):
        nkro_val = fc.get("nkro", {}).get("FORCE_NKRO", "no")
        lines.append(f"FORCE_NKRO = {nkro_val}")
        lines.append("")

    if features.get("bootmagic", False):
        lines.append("BOOTMAGIC_ENABLE = yes")
        lite_row = fc.get("bootmagic", {}).get("BOOTMAGIC_LITE_ROW", "")
        lite_col = fc.get("bootmagic", {}).get("BOOTMAGIC_LITE_COLUMN", "")
        if lite_row:
            lines.append(f"BOOTMAGIC_LITE_ROW = {lite_row}")
        if lite_col:
            lines.append(f"BOOTMAGIC_LITE_COLUMN = {lite_col}")
        lines.append("")

    if features.get("mousekeys", False):
        lines.append("MOUSEKEY_ENABLE = yes")
        delay = fc.get("mousekeys", {}).get("MOUSEKEY_DELAY", "500")
        interval = fc.get("mousekeys", {}).get("MOUSEKEY_INTERVAL", "50")
        max_speed = fc.get("mousekeys", {}).get("MOUSEKEY_MAX_SPEED", "5")
        lines.append(f"MOUSEKEY_DELAY = {delay}")
        lines.append(f"MOUSEKEY_INTERVAL = {interval}")
        lines.append(f"MOUSEKEY_MAX_SPEED = {max_speed}")
        lines.append("")

    if features.get("tap_dance", False):
        lines.append("TAP_DANCE_ENABLE = yes")
        tapping_term = fc.get("tap_dance", {}).get("TAPPING_TERM", "200")
        lines.append(f"TAPPING_TERM = {tapping_term}")
        lines.append("")

    if features.get("combo", False):
        lines.append("COMBO_ENABLE = yes")
        combo_term = fc.get("combo", {}).get("COMBO_TERM", "65")
        lines.append(f"COMBO_TERM = {combo_term}")
        lines.append("")

    if features.get("audio", False):
        lines.append("AUDIO_ENABLE = yes")
        clicky = fc.get("audio", {}).get("AUDIO_CLICKY", "no")
        lines.append(f"AUDIO_CLICKY = {clicky}")
        lines.append("")

    if features.get("extrakeys", False):
        lines.append("CONSOLE_ENABLE = no")
        lines.append("COMMAND_ENABLE = no")
        lines.append("EXTRAKEY_ENABLE = yes")
        lines.append("AUDIO_ENABLE = no")
        lines.append("")

    if features.get("split_keyboard", False):
        lines.append("SPLIT_KEYBOARD = yes")
        if config.half_columns:
            lines.append(f"SPLIT_HAND_PIN = {config.split_hand_pin or 'D4'}")
        usb_detect = fc.get("split_keyboard", {}).get("SPLIT_USB_DETECT", "yes")
        lines.append(f"SPLIT_USB_DETECT = {usb_detect}")
        transport_mirror = fc.get("split_keyboard", {}).get("SPLIT_TRANSPORT_MIRROR", "no")
        lines.append(f"SPLIT_TRANSPORT_MIRROR = {transport_mirror}")
        layer_state = fc.get("split_keyboard", {}).get("SPLIT_LAYER_STATE_ENABLE", "no")
        lines.append(f"SPLIT_LAYER_STATE_ENABLE = {layer_state}")
        rgb_split = fc.get("split_keyboard", {}).get("SPLIT_RGB_MATRIX_ENABLE", "no")
        lines.append(f"SPLIT_RGB_MATRIX_ENABLE = {rgb_split}")
        lines.append("")

    # Build defaults
    lines.append("BUILD_ROM = yes")
    lines.append("BUILD_EEPROM_EEBIN = yes")
    lines.append("BUILD_COMPLETE = yes")

    return "\n".join(lines)
