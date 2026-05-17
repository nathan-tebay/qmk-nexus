import type { KeyboardConfig } from '@/store/keyboard'

export const MAX_KEY_COUNT = 250

export function maxSupportedOleds(config: KeyboardConfig): number {
  return config.features['split_keyboard'] ? 2 : 1
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

  return errors
}
