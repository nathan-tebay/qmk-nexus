import type { KeyboardConfig } from '@/store/keyboard'

export function maxSupportedOleds(config: KeyboardConfig): number {
  return config.features['split_keyboard'] ? 2 : 1
}

export function validateKeyboardConfig(config: KeyboardConfig): string[] {
  const errors: string[] = []
  const oledCount = config.oleds?.length ?? 0
  const maxOleds = maxSupportedOleds(config)

  if (oledCount > maxOleds) {
    errors.push(
      config.features['split_keyboard']
        ? 'At most 2 OLEDs are supported on split keyboards.'
        : 'Multiple OLEDs are only supported when Split Keyboard is enabled.',
    )
  }

  return errors
}
