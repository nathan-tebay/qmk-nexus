import type { KeyboardConfig } from '@/store/keyboard'
import { mcuById } from '@/stages/build/mcus'

export const MAX_KEY_COUNT = 250

const JOYSTICK_BUTTON_KEYCODE_RE = /^JS_(\d+)$/

export function maxSupportedOleds(config: KeyboardConfig): number {
  return config.features['split_keyboard'] ? 2 : 1
}

/**
 * Get validation errors for joystick/ADC configuration: driver vs. MCU ADC support,
 * required analog pins, hat switch direction coverage, and button keycode range.
 */
export function getJoystickValidationErrors(config: KeyboardConfig): string[] {
  const errors: string[] = []
  if (!config.features['joystick']) return errors

  const joysticks = config.joysticks ?? []
  const cfg = config.featureConfigs.joystick ?? {}
  const driver = cfg.JOYSTICK_DRIVER ?? 'analog'
  const mcu = mcuById.get(config.mcu)

  if (driver === 'analog' && mcu && !mcu.hasAdc) {
    errors.push(
      `Joystick: ${mcu.label} has no ADC, so the analog driver is unavailable. Switch JOYSTICK_DRIVER to "digital" or use virtual axes.`,
    )
  }

  for (const joy of joysticks) {
    if (driver === 'analog') {
      const missingPinAxes = joy.axes.filter((axis) => !axis.virtual && !axis.pin.trim())
      if (missingPinAxes.length > 0) {
        errors.push(`Joystick: ${missingPinAxes.length} axis pin${missingPinAxes.length === 1 ? '' : 's'} required for analog joystick "${joy.id}".`)
      }
    }

    if (joy.hasHat) {
      const mappedDirections = Object.values(joy.hat ?? {}).filter((v) => v.trim()).length
      if (mappedDirections < 4) {
        errors.push(`Joystick "${joy.id}": a hat switch needs at least 4 directions mapped.`)
      }
    }
  }

  const buttonCount = Number.parseInt(cfg.JOYSTICK_BUTTON_COUNT ?? '8', 10)
  const maxButtonIndex = Number.isFinite(buttonCount) ? buttonCount : 8
  const outOfRangeIndices = new Set<number>()
  for (const layer of config.layers ?? []) {
    for (const code of Object.values(layer.keycodes)) {
      const match = JOYSTICK_BUTTON_KEYCODE_RE.exec(code)
      if (!match) continue
      const index = Number.parseInt(match[1], 10)
      if (index >= maxButtonIndex) outOfRangeIndices.add(index)
    }
  }
  if (outOfRangeIndices.size > 0) {
    const sorted = [...outOfRangeIndices].sort((a, b) => a - b)
    errors.push(
      `Joystick: button keycode${sorted.length === 1 ? '' : 's'} JS_${sorted.join(', JS_')} exceed${sorted.length === 1 ? 's' : ''} JOYSTICK_BUTTON_COUNT (${maxButtonIndex}).`,
    )
  }

  return errors
}

export function validateKeyboardConfig(config: KeyboardConfig): string[] {
  const errors: string[] = []
  const oledCount = config.oleds?.length ?? 0
  const maxOleds = maxSupportedOleds(config)

  if ((config.keys?.length ?? 0) > MAX_KEY_COUNT) {
    errors.push(`Keyboard has ${config.keys.length} keys; maximum is ${MAX_KEY_COUNT}.`)
  }

  if (oledCount > maxOleds) {
    errors.push(
      config.features['split_keyboard']
        ? 'At most 2 OLEDs are supported on split keyboards.'
        : 'Multiple OLEDs are only supported when Split Keyboard is enabled.',
    )
  }

  errors.push(...getJoystickValidationErrors(config))

  return errors
}
