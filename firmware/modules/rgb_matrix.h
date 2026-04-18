#pragma once

/*
 * RGB Matrix module — per-key RGB via matrix driver
 *
 * This header defines the configuration interface that tebay-qmk's codegen
 * uses when rgb_matrix is enabled. Fill in the defines below in config.h;
 * they will be emitted by config_h.py.
 *
 * Driver selection is controlled by RGB_MATRIX_DRIVER in rules.mk.
 * The codegen selects the driver based on MCU:
 *   - atmega32u4, rp2040 → ws2812 (direct GPIO bitbang)
 *   - stm32f303, stm32f072 → is31fl3737 (I2C matrix driver)
 */

/* ── Driver selection guards ─────────────────────────────────────────────── */

#if defined(RGB_MATRIX_DRIVER_WS2812)
#    include "drivers/led/ws2812.h"
#elif defined(RGB_MATRIX_DRIVER_IS31FL3737)
#    include "drivers/led/issi/is31fl3737.h"
#elif defined(RGB_MATRIX_DRIVER_IS31FL3741)
#    include "drivers/led/issi/is31fl3741.h"
#endif

/* ── Required config ─────────────────────────────────────────────────────── */

/* Total number of RGB LEDs — must match g_led_config entry count */
#ifndef RGB_MATRIX_LED_COUNT
#    error "RGB_MATRIX_LED_COUNT must be defined in config.h"
#endif

/* ── Optional config with sane defaults ──────────────────────────────────── */

#ifndef RGB_MATRIX_MAXIMUM_BRIGHTNESS
#    define RGB_MATRIX_MAXIMUM_BRIGHTNESS 200
#endif

#ifndef RGB_MATRIX_DEFAULT_MODE
#    define RGB_MATRIX_DEFAULT_MODE RGB_MATRIX_BREATHING
#endif

#ifndef RGB_MATRIX_DEFAULT_HUE
#    define RGB_MATRIX_DEFAULT_HUE 0
#endif

#ifndef RGB_MATRIX_DEFAULT_SAT
#    define RGB_MATRIX_DEFAULT_SAT 255
#endif

#ifndef RGB_MATRIX_DEFAULT_VAL
#    define RGB_MATRIX_DEFAULT_VAL 128
#endif

#ifndef RGB_MATRIX_DEFAULT_SPD
#    define RGB_MATRIX_DEFAULT_SPD 127
#endif

/* Idle timeout before RGB turns off (0 = never) */
#ifndef RGB_MATRIX_TIMEOUT
#    define RGB_MATRIX_TIMEOUT 0
#endif

/* ── Animation enable guards ─────────────────────────────────────────────── */

/* Enable common animations — comment out to reduce firmware size */
#define RGB_MATRIX_ANIMATION_SOLID_COLOR
#define RGB_MATRIX_ANIMATION_BREATHING
#define RGB_MATRIX_ANIMATION_CYCLE_LEFT_RIGHT
#define RGB_MATRIX_ANIMATION_CYCLE_UP_DOWN
#define RGB_MATRIX_ANIMATION_RAINBOW_MOVING_CHEVRON
#define RGB_MATRIX_ANIMATION_CYCLE_PINWHEEL
#define RGB_MATRIX_ANIMATION_CYCLE_SPIRAL
#define RGB_MATRIX_ANIMATION_DUAL_BEACON
#define RGB_MATRIX_ANIMATION_RAINBOW_BEACON
#define RGB_MATRIX_ANIMATION_JELLYBEAN_RAINDROPS
#define RGB_MATRIX_ANIMATION_HUE_BREATHING
#define RGB_MATRIX_ANIMATION_PIXEL_RAIN

/* LED flag values (matching QMK quantum/rgb_matrix/rgb_matrix_types.h) */
#define LED_FLAG_NONE      0x00
#define LED_FLAG_ALL       0xFF
#define LED_FLAG_MODIFIER  0x01
#define LED_FLAG_UNDERGLOW 0x02
#define LED_FLAG_KEYLIGHT  0x04
#define LED_FLAG_INDICATOR 0x08
