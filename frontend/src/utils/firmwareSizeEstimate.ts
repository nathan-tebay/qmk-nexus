import type { KeyboardConfig } from '@/store/keyboard'
import { FEATURE_MODULES, type FeatureModule } from '@/stages/build/modules'

export type FirmwareSizeLevel = 'ok' | 'near' | 'over' | 'unknown'

export interface FirmwareSizeEstimate {
  estimatedBytes: number | null
  flashBudgetBytes: number | null
  percentUsed: number | null
  level: FirmwareSizeLevel
  messages: string[]
}

const FLASH_BUDGETS: Record<string, number> = {
  atmega32u4: 28 * 1024,
  atmega32u2: 28 * 1024,
  atmega32a: 28 * 1024,
  atmega328p: 28 * 1024,
  at90usb1286: 124 * 1024,
  rp2040: 2 * 1024 * 1024,
  stm32f072: 128 * 1024,
  stm32f103: 64 * 1024,
  stm32f303: 256 * 1024,
  stm32f411: 512 * 1024,
  mk20dx256: 256 * 1024,
}

const FEATURE_BASE_COSTS: Record<string, number> = {
  extrakeys: 850,
  bootmagic: 420,
  mousekeys: 2600,
  key_lock: 550,
  nkro: 700,
  rgblight: 5200,
  rgb_matrix: 9600,
  pointing_device: 6200,
  encoder: 1500,
  debounce: 300,
  split_keyboard: 5200,
  wpm: 900,
  oled: 7800,
  indicators: 500,
  backlight: 1700,
  console: 2100,
  tap_dance: 1800,
  dynamic_macro: 1600,
  combo: 1700,
  leader_key: 1300,
  audio: 7600,
}

function mcuBaseCost(mcu: string): number {
  if (mcu.startsWith('atmega') || mcu.startsWith('at90')) return 14_500
  if (mcu === 'rp2040') return 31_000
  return 28_000
}

function numberFromConfig(mod: FeatureModule | undefined, cfg: Record<string, string>, key: string, fallback: number): number {
  const raw = cfg[key] ?? mod?.inputs.find((input) => input.key === key)?.defaultValue ?? ''
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return parsed
}

function macroPayloadBytes(config: KeyboardConfig): { steps: number; stringBytes: number } {
  let steps = 0
  let stringBytes = 0
  for (const macro of config.macros ?? []) {
    steps += macro.steps.length
    for (const step of macro.steps) {
      if (step.type === 'string') stringBytes += new TextEncoder().encode(step.text ?? '').length
    }
  }
  return { steps, stringBytes }
}

export function formatFirmwareBytes(bytes: number): string {
  return `${Math.ceil(bytes / 1024)} KB`
}

export function formatFirmwareEstimate(estimate: FirmwareSizeEstimate): string {
  if (estimate.estimatedBytes === null || estimate.flashBudgetBytes === null || estimate.percentUsed === null) {
    return 'size estimate unavailable'
  }
  return `${formatFirmwareBytes(estimate.estimatedBytes)} / ${formatFirmwareBytes(estimate.flashBudgetBytes)} (${estimate.percentUsed}%)`
}

export function estimateFirmwareSize(config: KeyboardConfig): FirmwareSizeEstimate {
  const budget = FLASH_BUDGETS[config.mcu]
  if (!budget) {
    return {
      estimatedBytes: null,
      flashBudgetBytes: null,
      percentUsed: null,
      level: 'unknown',
      messages: [`Firmware size estimate unavailable for MCU "${config.mcu || 'unknown'}".`],
    }
  }

  let estimated = mcuBaseCost(config.mcu)
  const keyCount = config.keys.length
  const layerCount = Math.max(1, config.layers.length)

  estimated += keyCount * 18
  estimated += keyCount * layerCount * 2
  estimated += Math.max(0, layerCount - 1) * 240

  const modulesById = new Map(FEATURE_MODULES.map((mod) => [mod.id, mod]))
  for (const mod of FEATURE_MODULES) {
    if (!config.features[mod.id]) continue
    estimated += FEATURE_BASE_COSTS[mod.id] ?? 1200
  }

  const rgbLightMod = modulesById.get('rgblight')
  const rgbLightCfg = config.featureConfigs.rgblight ?? {}
  if (config.features.rgblight) {
    estimated += numberFromConfig(rgbLightMod, rgbLightCfg, 'RGBLIGHT_LED_COUNT', 30) * 42
  }

  const rgbMatrixMod = modulesById.get('rgb_matrix')
  const rgbMatrixCfg = config.featureConfigs.rgb_matrix ?? {}
  if (config.features.rgb_matrix) {
    estimated += numberFromConfig(rgbMatrixMod, rgbMatrixCfg, 'RGB_MATRIX_LED_COUNT', Math.max(1, keyCount)) * 70
    if ((rgbMatrixCfg.RGB_MATRIX_DRIVER ?? 'IS31FL3731') === 'WS2812') estimated += 700
  }

  const encoderMod = modulesById.get('encoder')
  const encoderCfg = config.featureConfigs.encoder ?? {}
  if (config.features.encoder) {
    estimated += Math.max(config.encoders.length, numberFromConfig(encoderMod, encoderCfg, 'ENCODER_COUNT', 1)) * 360
  }

  const oledMod = modulesById.get('oled')
  const oledCfg = config.featureConfigs.oled ?? {}
  if (config.features.oled) {
    estimated += Math.max(config.oleds.length, numberFromConfig(oledMod, oledCfg, 'OLED_COUNT', 1)) * 1400
    estimated += (config.oleds ?? []).reduce((sum, oled) => sum + (oled.logoBytes?.length ?? 0), 0)
  }

  if (config.features.combo) estimated += (config.combos ?? []).length * 90
  if (config.features.tap_dance) estimated += (config.tapDances ?? []).length * 80

  const macroBytes = macroPayloadBytes(config)
  if ((config.macros ?? []).length > 0) {
    estimated += 1200 + config.macros.length * 160 + macroBytes.steps * 72 + Math.ceil(macroBytes.stringBytes * 1.35)
  }

  const customFileBytes = Object.values(config.customFiles ?? {}).reduce((sum, text) => sum + Math.min(text.length, 20_000) * 0.25, 0)
  estimated += Math.ceil(customFileBytes)

  const estimatedBytes = Math.ceil(estimated)
  const percentUsed = Math.ceil((estimatedBytes / budget) * 100)
  const messages: string[] = []
  let level: FirmwareSizeLevel = 'ok'

  if (estimatedBytes > budget) {
    level = 'over'
    messages.push('Estimated firmware size is over this MCU flash budget. Build may fail or firmware may not fit.')
  } else if (percentUsed >= 90) {
    level = 'near'
    messages.push('Estimated firmware size is near this MCU flash budget. Consider disabling unused features if build fails.')
  }

  if (config.features.rgb_matrix) messages.push('RGB Matrix is one of the largest QMK features.')
  if (config.features.oled) messages.push('OLED graphics and logos can add significant firmware size.')
  if ((config.macros ?? []).length > 0) messages.push('Static macro steps and strings are included in this local estimate.')

  return { estimatedBytes, flashBudgetBytes: budget, percentUsed, level, messages }
}
