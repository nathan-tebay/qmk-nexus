"""Shared MCU-specific mappings for codegen modules."""

MCU_ARCH: dict[str, tuple[str, str]] = {
    # mcu -> (ARCH, F_CPU)
    'atmega32u4': ('avr', '16000000'),
    'atmega32u2': ('avr', '16000000'),
    'at90usb1286': ('avr', '16000000'),
    'atmega328p': ('avr', '16000000'),
    'stm32f072': ('chibios', '48000000'),
    'stm32f103': ('chibios', '72000000'),
    'stm32f303': ('chibios', '72000000'),
    'mk20dx256': ('chibios', '72000000'),
    'rp2040': ('chibios', '133000000'),
}

SUPPORTED_GENERATED_MCUS = frozenset(MCU_ARCH)

MCU_BOOTLOADER: dict[str, str] = {
    'atmega32u4': 'atmel-dfu',
    'atmega32u2': 'atmel-dfu',
    'at90usb1286': 'atmel-dfu',
    'stm32f072': 'stm32-dfu',
    'stm32f103': 'stm32duino',
    'stm32f303': 'stm32-dfu',
    'mk20dx256': 'kiibohd',
    'rp2040': 'rp2040',
    'atmega328p': 'usbasploader',
}

MCU_QMK_NAME: dict[str, str] = {
    'atmega32u4': 'atmega32u4',
    'atmega32u2': 'atmega32u2',
    'at90usb1286': 'at90usb1286',
    'atmega328p': 'atmega328p',
    'stm32f072': 'STM32F072',
    'stm32f103': 'STM32F103',
    'stm32f303': 'STM32F303',
    'mk20dx256': 'MK20DX256',
    'rp2040': 'RP2040',
}

# ChibiOS BOARD value for MCUs that need it explicitly.
# Without this, QMK falls back to the common board config which cannot
# resolve mcuconf.h, causing compile failure on all ChibiOS targets.
MCU_QMK_BOARD: dict[str, str] = {
    'mk20dx256': 'TEENSY_3_X',
}

MCU_RGB_DRIVER: dict[str, str] = {
    'atmega32u4': 'ws2812',
    'atmega32u2': 'ws2812',
    'at90usb1286': 'ws2812',
    'atmega328p': 'ws2812',
    'stm32f072': 'is31fl3737',
    'stm32f103': 'ws2812',
    'stm32f303': 'is31fl3737',
    'mk20dx256': 'ws2812',
    'rp2040': 'ws2812',
}
