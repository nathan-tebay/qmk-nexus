/**
 * Determine the firmware file extension based on MCU architecture.
 */
export function firmwareExtension(mcu: string): 'hex' | 'bin' | 'uf2' {
  if (mcu === 'rp2040') return 'uf2'
  if (mcu.startsWith('stm32') || mcu === 'mk20dx256') return 'bin'
  return 'hex' // AVR default
}
