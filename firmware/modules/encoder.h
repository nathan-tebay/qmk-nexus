#pragma once

/*
 * Encoder module — rotary encoder config interface
 *
 * QMK reference: quantum/encoder.h
 * Enable in rules.mk: ENCODER_ENABLE = yes
 */

/* Pulses-per-detent. Most encoders: 4. Some Alps: 2. */
#ifndef ENCODER_RESOLUTION
#    define ENCODER_RESOLUTION 4
#endif

/* Flip encoder direction if CW/CCW is backwards */
/* #define ENCODER_DIRECTION_FLIP */

/*
 * Pin pairs for each encoder: { A_pin, B_pin }
 * Define in config.h, e.g.:
 *   #define ENCODERS_PAD_A { B12 }
 *   #define ENCODERS_PAD_B { B13 }
 */
#ifndef ENCODERS_PAD_A
/* #define ENCODERS_PAD_A { B12 } */
#endif

#ifndef ENCODERS_PAD_B
/* #define ENCODERS_PAD_B { B13 } */
#endif

/* Number of encoders — auto-derived from pad array length */
/* #define NUM_ENCODERS 1 */
