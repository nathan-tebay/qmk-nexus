import { describe, it, expect } from 'vitest'
import { estimateFirmwareSize, formatFirmwareBytes } from './firmwareSizeEstimate'
import { useKeyboardStore } from '@/store/keyboard'

function baseConfig() {
  useKeyboardStore.getState().reset()
  return structuredClone(useKeyboardStore.getState().config)
}

describe('estimateFirmwareSize', () => {
  it('adds cost per tap-dance entry when the feature is enabled', () => {
    const cfg = baseConfig()
    cfg.features = { ...cfg.features, tap_dance: true }

    cfg.tapDances = [{ id: 't0', onTap: 'KC_A', onDoubleTap: 'KC_B' }]
    const withEntry = estimateFirmwareSize(cfg).estimatedBytes

    cfg.tapDances = []
    const withoutEntry = estimateFirmwareSize(cfg).estimatedBytes

    if (withEntry === null || withoutEntry === null) throw new Error('estimate should be defined')
    expect(withEntry).toBeGreaterThan(withoutEntry)
  })

  it('reports a higher flash budget for rp2040 than for atmega32u4', () => {
    const cfg = baseConfig()
    cfg.mcu = 'atmega32u4'
    const avr = estimateFirmwareSize(cfg).flashBudgetBytes
    cfg.mcu = 'rp2040'
    const rp = estimateFirmwareSize(cfg).flashBudgetBytes
    if (avr === null || rp === null) throw new Error('flash budget should be defined for known MCUs')
    expect(rp).toBeGreaterThan(avr)
  })
})

describe('formatFirmwareBytes', () => {
  it('rounds up to whole KB', () => {
    expect(formatFirmwareBytes(2048)).toBe('2 KB')
    expect(formatFirmwareBytes(2049)).toBe('3 KB')
  })
})
