#pragma once

/*
 * OLED module — SSD1306 display config interface
 *
 * QMK reference: drivers/oled/oled_driver.h
 * Enable in rules.mk: OLED_ENABLE = yes
 *
 * Default wiring: I2C1 (SDA=D1, SCL=D0) at address 0x3C (128x32)
 * For 128x64 displays: define OLED_DISPLAY_128X64
 */

/* Display geometry */
/* #define OLED_DISPLAY_128X64 */

/* Brightness: 0–255 */
#ifndef OLED_BRIGHTNESS
#    define OLED_BRIGHTNESS 128
#endif

/* Idle timeout in ms before display turns off (0 = never) */
#ifndef OLED_TIMEOUT
#    define OLED_TIMEOUT 60000
#endif

/* Fade-out animation before sleep */
/* #define OLED_FADE_OUT */
/* #define OLED_FADE_OUT_INTERVAL 0x00 */

/* Auto-scroll timeout in ms (0 = disabled) */
/* #define OLED_SCROLL_TIMEOUT 0 */

/* I2C address — 0x3C (default) or 0x3D */
/* #define OLED_DISPLAY_ADDRESS 0x3C */

/* Rotation: 0, 90, 180, 270 */
/* #define OLED_DISPLAY_ROTATION OLED_ROTATION_0 */
