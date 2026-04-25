import type { Layer } from '@/store/keyboard'

export const OLED_BLOCKS = [
  { id: 'logo',           label: 'Logo',           description: 'QMK Nexus logo / splash text' },
  { id: 'layer_name',     label: 'Layer Name',     description: 'Active layer name string' },
  { id: 'wpm',            label: 'WPM',            description: 'Words-per-minute counter (enables WPM_ENABLE)' },
  { id: 'host_leds',      label: 'Host LEDs',      description: 'Caps / Num / Scroll lock indicators' },
  { id: 'mod_indicators', label: 'Modifiers',      description: 'Currently active modifier key indicators' },
  { id: 'keylog',         label: 'Key Log',        description: 'Last key pressed (stub — implement keylog_str)' },
  { id: 'master_slave',   label: 'Master / Slave', description: 'Split keyboard side indicator' },
] as const

export type OledBlockId = typeof OLED_BLOCKS[number]['id']

export const OLED_PIXEL_SIZES: Record<string, { w: number; h: number }> = {
  '64_32':  { w: 64,  h: 32 },
  '64_48':  { w: 64,  h: 48 },
  '128_32': { w: 128, h: 32 },
  '128_64': { w: 128, h: 64 },
}

export const OLED_DISPLAY_OPTIONS = [
  { value: '128_32', label: '128×32' },
  { value: '128_64', label: '128×64' },
  { value: '64_48',  label: '64×48' },
  { value: '64_32',  label: '64×32' },
] as const

export function getBlockPreviewLines(
  blockId: string,
  layers: Layer[],
  activeLayerId: string,
): string[] {
  switch (blockId) {
    case 'logo':
      return ['QMK Nexus', '----------']
    case 'layer_name': {
      const name = layers.find((l) => l.id === activeLayerId)?.name ?? 'Base'
      return [name]
    }
    case 'wpm':
      return ['WPM: 000']
    case 'host_leds':
      return ['NUM CAP SCR']
    case 'mod_indicators':
      return ['SFT CTL ALT GUI']
    case 'keylog':
      return ['> KC_A']
    case 'master_slave':
      return ['Master']
    default:
      return []
  }
}
