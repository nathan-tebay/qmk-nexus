import { UNIT } from './layout/constants'

const MM_PER_U = 19.05
export const PX_PER_MM = UNIT / MM_PER_U

export const ENCODER_DIAMETER_OPTIONS = [
  { value: 12, label: '12mm (compact)' },
  { value: 14, label: '14mm (EC11)' },
  { value: 20, label: '20mm (large)' },
] as const

export const TRACKBALL_DIAMETER_OPTIONS = [
  { value: 25, label: '25mm (Nano)' },
  { value: 34, label: '34mm (standard)' },
  { value: 38, label: '38mm (Kensington)' },
  { value: 44, label: '44mm (billiard)' },
] as const

// Physical panel dimensions (mm) for common OLED modules
const OLED_PHYSICAL_MM: Record<string, { w: number; h: number }> = {
  '128_64': { w: 30, h: 17 },   // 0.96" / 1.3" SSD1306 module
  '128_32': { w: 36, h: 12 },   // 0.91" SSD1306 module
  '64_48':  { w: 18, h: 14 },   // 0.66" SSD1306 module
  '64_32':  { w: 18, h: 9  },   // compact variant
}

function radiusPx(diameterMm: number): number {
  return (diameterMm / 2) * PX_PER_MM
}

export const encoderRadiusPx = radiusPx
export const trackballRadiusPx = radiusPx

export function oledSizePx(displaySize: string): { w: number; h: number } {
  const mm = OLED_PHYSICAL_MM[displaySize] ?? OLED_PHYSICAL_MM['128_32']
  return { w: mm.w * PX_PER_MM, h: mm.h * PX_PER_MM }
}
