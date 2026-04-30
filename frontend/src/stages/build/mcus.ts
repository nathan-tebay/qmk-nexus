export interface McuOption {
  id: string
  label: string
  arch: 'avr' | 'arm'
  supported: boolean
}

export const MCU_LIST: McuOption[] = [
  { id: 'atmega32u4', label: 'ATmega32U4 — most common AVR', arch: 'avr', supported: true },
  { id: 'rp2040',     label: 'RP2040 — Raspberry Pi Pico',  arch: 'arm', supported: true },
  { id: 'stm32f072',  label: 'STM32F072',                   arch: 'arm', supported: true },
  { id: 'stm32f103',  label: 'STM32F103',                   arch: 'arm', supported: true },
  { id: 'stm32f303',  label: 'STM32F303',                   arch: 'arm', supported: true },
  { id: 'mk20dx256',  label: 'MK20DX256 — Kinetis K20',     arch: 'arm', supported: true },
]

export const mcuById = new Map<string, McuOption>(MCU_LIST.map((m) => [m.id, m]))
