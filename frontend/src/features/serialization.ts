import type { KeyboardConfig } from '@/store/keyboard'
import { FEATURE_MODULES } from '@/stages/build/modules'

function effectiveConfigValue(cfg: Record<string, string>, key: string): string {
  if (cfg[key] !== undefined) return cfg[key]
  for (const field of FEATURE_MODULES.flatMap((mod) => mod.inputs)) {
    if (field.key === key && field.defaultValue !== undefined) return field.defaultValue
  }
  return ''
}

function conditionMatches(
  conditionalOn: Record<string, string | string[]> | undefined,
  cfg: Record<string, string>,
): boolean {
  if (!conditionalOn) return true
  return Object.entries(conditionalOn).every(([key, expected]) => {
    const current = effectiveConfigValue(cfg, key)
    return Array.isArray(expected) ? expected.includes(current) : current === expected
  })
}

// ── rules.mk ─────────────────────────────────────────────────────────────────

export function serializeRulesMk(config: KeyboardConfig): string {
  const lines: string[] = []
  const fc = config.featureConfigs

  // MCU
  const mcu = config.mcu || 'atmega32u4'
  lines.push(`MCU = ${mcu}`)
  lines.push(`F_CPU = 16000000`)
  lines.push('')

  // USB
  lines.push(`VENDOR_ID  = ${config.usbVid || '0xFEED'}`)
  lines.push(`PRODUCT_ID = ${config.usbPid || '0x0000'}`)
  lines.push('')

  // Enabled features
  for (const mod of FEATURE_MODULES) {
    if (!config.features[mod.id]) continue
    lines.push(`${mod.rulesMkKey} = yes`)
    const cfg = fc[mod.id] ?? {}
    for (const field of mod.inputs) {
      if (!conditionMatches(field.conditionalOn, cfg)) continue
      const value = effectiveConfigValue(cfg, field.key)
      if (value !== undefined && value !== '') {
        lines.push(`${field.key} = ${value}`)
      }
    }
    lines.push('')
  }

  return lines.join('\n').trimEnd()
}

// ── config.h ─────────────────────────────────────────────────────────────────

const CONFIG_H_KEYS = new Set([
  'RGBLIGHT_PIN', 'RGBLIGHT_LED_COUNT',
  'RGB_MATRIX_DRIVER', 'RGB_MATRIX_PIN', 'RGB_MATRIX_I2C_SDA', 'RGB_MATRIX_I2C_SCL', 'RGB_MATRIX_LED_COUNT',
  'BACKLIGHT_PIN',
  'AUDIO_PIN',
  'SOFT_SERIAL_PIN', 'SPLIT_I2C_SDA', 'SPLIT_I2C_SCL',
  'ENCODER_COUNT',
  'OLED_COUNT',
  'BOOTMAGIC_LITE_ROW', 'BOOTMAGIC_LITE_COLUMN',
])

export function serializeConfigH(config: KeyboardConfig): string {
  const lines: string[] = ['#pragma once', '']
  const fc = config.featureConfigs

  for (const mod of FEATURE_MODULES) {
    if (!config.features[mod.id]) continue
    const cfg = fc[mod.id] ?? {}
    const defs: string[] = []
    for (const field of mod.inputs) {
      if (!CONFIG_H_KEYS.has(field.key)) continue
      if (!conditionMatches(field.conditionalOn, cfg)) continue
      const value = effectiveConfigValue(cfg, field.key)
      if (value !== undefined && value !== '') {
        defs.push(`#define ${field.key} ${value}`)
      }
    }
    if (defs.length > 0) {
      lines.push(`// ${mod.name}`)
      lines.push(...defs)
      lines.push('')
    }
  }

  return lines.join('\n').trimEnd()
}

// ── info.json ─────────────────────────────────────────────────────────────────

export function serializeInfoJson(config: KeyboardConfig): string {
  const enabledFeatures = Object.entries(config.features)
    .filter(([, on]) => on)
    .map(([id]) => id)

  const info: Record<string, unknown> = {
    keyboard_name: config.name || 'Custom Keyboard',
    manufacturer: config.manufacturer || '',
    usb: {
      vid: config.usbVid || '0xFEED',
      pid: config.usbPid || '0x0000',
    },
    features: Object.fromEntries(enabledFeatures.map((id) => [id, true])),
    matrix_pins: config.directPins?.length
      ? { direct: config.directPins }
      : {
          rows: config.rowPins.map((r) => r.pin),
          cols: config.colPins.map((c) => c.pin),
        },
    layouts: {
      LAYOUT: {
        layout: config.keys.map((k) => ({
          matrix: [k.row ?? 0, k.col ?? 0],
          x: k.x,
          y: k.y,
          w: k.w,
          h: k.h,
          label: k.label || '',
        })),
      },
    },
  }

  return JSON.stringify(info, null, 2)
}

// ── store method helper ───────────────────────────────────────────────────────

export function serializeAll(config: KeyboardConfig): {
  rulesMk: string
  configH: string
  infoJson: string
} {
  return {
    rulesMk: serializeRulesMk(config),
    configH: serializeConfigH(config),
    infoJson: serializeInfoJson(config),
  }
}
