// Pointing-device (mouse/trackball) sensor catalog: CPI/DPI ranges per driver.
// Used to drive the POINTING_DEVICE_DRIVER select in modules.ts and the
// DPI/LED indicator UI in PeripheralProperties.tsx.

export interface PointingSensor {
  id: string
  label: string
  cpiMin: number
  cpiMax: number
  cpiStep: number
  cpiDefault: number
  /** True when the sensor has no real adjustable CPI (DPI controls should be disabled). */
  hasFixedCpi?: boolean
}

export const POINTING_SENSORS: readonly PointingSensor[] = [
  { id: 'pmw3360', label: 'PMW3360', cpiMin: 100, cpiMax: 12000, cpiStep: 100, cpiDefault: 1600 },
  { id: 'pmw3389', label: 'PMW3389', cpiMin: 50, cpiMax: 16000, cpiStep: 50, cpiDefault: 1600 },
  { id: 'pmw3320', label: 'PMW3320', cpiMin: 250, cpiMax: 3500, cpiStep: 250, cpiDefault: 1000 },
  { id: 'adns9800', label: 'ADNS9800', cpiMin: 800, cpiMax: 8200, cpiStep: 200, cpiDefault: 1800 },
  { id: 'adns5050', label: 'ADNS5050', cpiMin: 125, cpiMax: 1375, cpiStep: 125, cpiDefault: 500 },
  { id: 'paw3204', label: 'PAW3204', cpiMin: 400, cpiMax: 1600, cpiStep: 400, cpiDefault: 800 },
  { id: 'paw3222', label: 'PAW3222', cpiMin: 200, cpiMax: 3200, cpiStep: 200, cpiDefault: 1000 },
  // Cirque Pinnacle is touchpad scaling-based rather than true CPI; values are approximate.
  { id: 'cirque_pinnacle_spi', label: 'Cirque Pinnacle (SPI)', cpiMin: 200, cpiMax: 1000, cpiStep: 100, cpiDefault: 600 },
  { id: 'cirque_pinnacle_i2c', label: 'Cirque Pinnacle (I2C)', cpiMin: 200, cpiMax: 1000, cpiStep: 100, cpiDefault: 600 },
  // No adjustable CPI — optical encoder wheel, not a true sensor with DPI.
  { id: 'pimoroni_trackball', label: 'Pimoroni Trackball', cpiMin: 1, cpiMax: 1, cpiStep: 1, cpiDefault: 1, hasFixedCpi: true },
  // Approximate; IQS5xx reports relative motion with a configurable resolution.
  { id: 'azoteq_iqs5xx', label: 'Azoteq IQS5xx', cpiMin: 0, cpiMax: 3200, cpiStep: 100, cpiDefault: 800 },
  // Analog joystick has no CPI concept at all.
  { id: 'analog_joystick', label: 'Analog Joystick', cpiMin: 1, cpiMax: 1, cpiStep: 1, cpiDefault: 1, hasFixedCpi: true },
  // No fixed range — driver supplies its own CPI handling.
  { id: 'custom', label: 'Custom', cpiMin: 1, cpiMax: 30000, cpiStep: 1, cpiDefault: 1600 },
]

export const POINTING_DRIVER_OPTIONS: readonly { value: string; label: string }[] =
  POINTING_SENSORS.map((s) => ({ value: s.id, label: s.label }))

export function getSensorCpiRange(driver: string): PointingSensor {
  const found = POINTING_SENSORS.find((s) => s.id === driver)
  if (found) return found
  return POINTING_SENSORS[POINTING_SENSORS.length - 1]
}
