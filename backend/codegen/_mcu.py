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
    'rp2040': ('chibios', '133000000'),
}

MCU_BOOTLOADER: dict[str, str] = {
    'atmega32u4': 'atmel-dfu',
    'atmega32u2': 'atmel-dfu',
    'at90usb1286': 'atmel-dfu',
    'stm32f072': 'stm32-dfu',
    'stm32f103': 'stm32duino',
    'stm32f303': 'stm32-dfu',
    'rp2040': 'rp2040',
    'atmega328p': 'usbasploader',
}

MCU_RGB_DRIVER: dict[str, str] = {
    'atmega32u4': 'ws2812',
    'atmega32u2': 'ws2812',
    'at90usb1286': 'ws2812',
    'atmega328p': 'ws2812',
    'stm32f072': 'is31fl3737',
    'stm32f103': 'ws2812',
    'stm32f303': 'is31fl3737',
    'rp2040': 'ws2812',
}
