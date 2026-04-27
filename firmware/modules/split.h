#pragma once

/*
 * Split keyboard module — bidirectional half communication
 *
 * This header defines the configuration interface for split keyboards.
 * QMK Nexus codegen emits these defines in config.h when split_keyboard
 * is enabled. The transport layer (serial / I2C) is selected via defines.
 *
 * QMK reference: quantum/split_common/transport.h
 */

/* ── Transport selection ─────────────────────────────────────────────────── */

/*
 * SPLIT_TRANSPORT_SERIAL  — single-wire half-duplex via USART (default)
 * SPLIT_TRANSPORT_I2C     — I2C (both halves share bus; less common)
 *
 * Default: serial. Enable I2C by defining SPLIT_TRANSPORT_I2C in config.h.
 */
#if defined(SPLIT_TRANSPORT_I2C)
#    define USE_I2C
#else
#    define SERIAL_USE_MULTI_TRANSACTION
#endif

/* ── Serial pin ──────────────────────────────────────────────────────────── */

/*
 * SOFT_SERIAL_PIN — GPIO pin connected to the TRRS data line.
 * Required when using serial transport (the default).
 * Example: D0 on Pro Micro, D2 on Elite-C.
 */
#ifndef SOFT_SERIAL_PIN
#    if !defined(SPLIT_TRANSPORT_I2C)
#        error "SOFT_SERIAL_PIN must be defined in config.h for serial split transport"
#    endif
#endif

/* ── Master side selection ───────────────────────────────────────────────── */

/*
 * Exactly one of these must be set. EE_HANDS reads from EEPROM so either
 * half can be master; MASTER_LEFT / MASTER_RIGHT are compile-time fixed.
 *
 * Default emitted by codegen: MASTER_LEFT (most common for split boards).
 */
#if !defined(EE_HANDS) && !defined(MASTER_LEFT) && !defined(MASTER_RIGHT)
#    define MASTER_LEFT
#endif

/* ── USB detect ──────────────────────────────────────────────────────────── */

/*
 * SPLIT_USB_DETECT — poll USB VBUS to determine which half is master.
 * Required for boards without a hardware USB detect pin.
 */
#ifndef SPLIT_USB_DETECT
#    define SPLIT_USB_DETECT
#endif

/* ── Sync feature flags ──────────────────────────────────────────────────── */

/*
 * These mirror state from the master half to the secondary half over the
 * split transport. Enable the ones relevant to your feature set.
 */
#ifndef SPLIT_TRANSPORT_MIRROR
#    define SPLIT_TRANSPORT_MIRROR
#endif

#ifndef SPLIT_LAYER_STATE_ENABLE
#    define SPLIT_LAYER_STATE_ENABLE
#endif

#ifndef SPLIT_LED_STATE_ENABLE
#    define SPLIT_LED_STATE_ENABLE
#endif

#ifndef SPLIT_MODS_ENABLE
#    define SPLIT_MODS_ENABLE
#endif

/* Sync WPM counter across halves (useful for OLED displays) */
/* #define SPLIT_WPM_ENABLE */

/* Sync OLED state from master to secondary */
/* #define SPLIT_OLED_ENABLE */

/* Watchdog: reboot secondary if it stops responding */
/* #define SPLIT_WATCHDOG_ENABLE */
/* #define SPLIT_WATCHDOG_TIMEOUT 3000 */
