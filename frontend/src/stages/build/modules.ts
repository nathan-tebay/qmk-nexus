export interface ConfigField {
  key: string
  type: 'text' | 'pin' | 'select'
  description: string
  defaultValue?: string
  options?: string[]
  // Show field only when ALL conditions match. Array values = any-of match.
  conditionalOn?: Record<string, string | string[]>
  repeatPerCount?: string
}

export interface FeatureModule {
  id: string
  name: string
  description: string
  group: string
  rulesMkKey: string
  requiredConfig: string[]
  optionalConfig: string[]
  incompatibleWith: string[]
  qmkPrevalence: number
  inputs: ConfigField[]
}

export const FEATURE_MODULES: readonly FeatureModule[] = [
  {
    id: 'extrakeys', name: 'Extra Keys', group: 'Input',
    rulesMkKey: 'EXTRAKEY_ENABLE', qmkPrevalence: 0.670,
    description: 'Media and system control keys (volume, play, brightness).',
    requiredConfig: [], optionalConfig: [], incompatibleWith: [],
    inputs: [],
  },
  {
    id: 'bootmagic', name: 'Boot Magic', group: 'Input',
    rulesMkKey: 'BOOTMAGIC_ENABLE', qmkPrevalence: 0.554,
    description: 'Hold a key at power-on to enter bootloader or change settings.',
    requiredConfig: [], optionalConfig: ['BOOTMAGIC_LITE_ROW','BOOTMAGIC_LITE_COLUMN'], incompatibleWith: [],
    inputs: [
      { key: 'BOOTMAGIC_LITE_ROW', type: 'text', description: 'Row for Bootmagic Lite key' },
      { key: 'BOOTMAGIC_LITE_COLUMN', type: 'text', description: 'Column for Bootmagic Lite key' },
    ],
  },
  {
    id: 'mousekeys', name: 'Mouse Keys', group: 'Input',
    rulesMkKey: 'MOUSEKEY_ENABLE', qmkPrevalence: 0.524,
    description: 'Control the mouse cursor and buttons from keyboard keys.',
    requiredConfig: [], optionalConfig: ['MOUSEKEY_DELAY','MOUSEKEY_INTERVAL','MOUSEKEY_MAX_SPEED'], incompatibleWith: [],
    inputs: [
      { key: 'MOUSEKEY_DELAY', type: 'text', description: 'Initial delay in ms', defaultValue: '500' },
      { key: 'MOUSEKEY_INTERVAL', type: 'text', description: 'Movement interval in ms', defaultValue: '50' },
      { key: 'MOUSEKEY_MAX_SPEED', type: 'text', description: 'Max acceleration', defaultValue: '5' },
    ],
  },
  {
    id: 'nkro', name: 'N-Key Rollover', group: 'Input',
    rulesMkKey: 'NKRO_ENABLE', qmkPrevalence: 0.428,
    description: 'Report all simultaneous keypresses without USB protocol limits.',
    requiredConfig: [], optionalConfig: ['FORCE_NKRO'], incompatibleWith: [],
    inputs: [
      { key: 'FORCE_NKRO', type: 'select', description: 'Force NKRO mode', defaultValue: 'no', options: ['yes', 'no'] },
    ],
  },
  {
    id: 'rgblight', name: 'RGB Light (Underglow)', group: 'Lighting',
    rulesMkKey: 'RGBLIGHT_ENABLE', qmkPrevalence: 0.244,
    description: 'WS2812-style per-LED underglow strip lighting with animations.',
    requiredConfig: [], optionalConfig: ['RGBLIGHT_LED_COUNT','RGBLIGHT_LIMIT_VAL','RGBLIGHT_DEFAULT_MODE'],
    incompatibleWith: [],
    inputs: [
      { key: 'RGBLIGHT_PIN', type: 'pin', description: 'MCU pin driving the RGB LED data line', defaultValue: 'D3' },
      { key: 'RGBLIGHT_LED_COUNT', type: 'text', description: 'Number of LEDs in the strip', defaultValue: '30' },
      { key: 'RGBLIGHT_LIMIT_VAL', type: 'text', description: 'Maximum brightness per LED (0-255)', defaultValue: '255' },
      { key: 'RGBLIGHT_DEFAULT_MODE', type: 'select', description: 'Default animation mode',
        defaultValue: 'RGBLIGHT_EFFECT_BREATHING',
        options: ['RGBLIGHT_EFFECT_BREATHING', 'RGBLIGHT_EFFECT_RAINBOW_MOOD', 'RGBLIGHT_EFFECT_RAINBOW_SWIRL', 'RGBLIGHT_EFFECT_SOLID', 'RGBLIGHT_EFFECT_ALTERNATING'] },
    ],
  },
  {
    id: 'rgb_matrix', name: 'RGB Matrix', group: 'Lighting',
    rulesMkKey: 'RGB_MATRIX_ENABLE', qmkPrevalence: 0.111,
    description: 'Per-key RGB LED control via a matrix driver (IS31FL3xxx, WS2812).',
    requiredConfig: ['RGB_MATRIX_LED_COUNT'], optionalConfig: ['RGB_MATRIX_MAXIMUM_BRIGHTNESS','RGB_MATRIX_DEFAULT_MODE','RGB_MATRIX_SLEEP'],
    incompatibleWith: ['backlight'],
    inputs: [
      { key: 'RGB_MATRIX_DRIVER', type: 'select', description: 'RGB Matrix driver chip',
        defaultValue: 'IS31FL3731',
        options: ['IS31FL3731', 'IS31FL3733', 'IS31FL3735', 'IS31FL3736', 'IS31FL3737', 'IS31FL3738', 'IS31FL3741', 'IS31FL3742', 'IS31FL3743', 'IS31FL3744', 'IS31FL3745', 'IS31FL3746', 'WS2812'] },
      { key: 'RGB_MATRIX_PIN', type: 'pin', description: 'MCU pin for RGB Matrix data (WS2812 mode)', defaultValue: 'D3',
        conditionalOn: { RGB_MATRIX_DRIVER: 'WS2812' } },
      { key: 'RGB_MATRIX_I2C_SDA', type: 'pin', description: 'I2C SDA pin for driver chip', defaultValue: 'D2',
        conditionalOn: { RGB_MATRIX_DRIVER: ['IS31FL3731','IS31FL3733','IS31FL3735','IS31FL3736','IS31FL3737','IS31FL3738','IS31FL3741','IS31FL3742','IS31FL3743','IS31FL3744','IS31FL3745','IS31FL3746'] } },
      { key: 'RGB_MATRIX_I2C_SCL', type: 'pin', description: 'I2C SCL pin for driver chip', defaultValue: 'D1',
        conditionalOn: { RGB_MATRIX_DRIVER: ['IS31FL3731','IS31FL3733','IS31FL3735','IS31FL3736','IS31FL3737','IS31FL3738','IS31FL3741','IS31FL3742','IS31FL3743','IS31FL3744','IS31FL3745','IS31FL3746'] } },
      { key: 'RGB_MATRIX_LED_COUNT', type: 'text', description: 'Total number of LEDs', defaultValue: '60' },
      { key: 'RGB_MATRIX_MAXIMUM_BRIGHTNESS', type: 'text', description: 'Max brightness (0-255)', defaultValue: '255' },
      { key: 'RGB_MATRIX_DEFAULT_MODE', type: 'select', description: 'Default effect', defaultValue: 'RGB_MATRIX_EFFECT_BREATHING',
        options: ['RGB_MATRIX_EFFECT_BREATHING', 'RGB_MATRIX_EFFECT_RAINBOW_MOVING_CHEVRON', 'RGB_MATRIX_EFFECT_SOLID', 'RGB_MATRIX_EFFECT_ALTERNATING'] },
      { key: 'RGB_MATRIX_SLEEP', type: 'select', description: 'Turn off on sleep', defaultValue: 'yes', options: ['yes', 'no'] },
    ],
  },
  {
    id: 'pointing_device', name: 'Pointing Device', group: 'Input',
    rulesMkKey: 'POINTING_DEVICE_ENABLE', qmkPrevalence: 0.035,
    description: 'Trackball, trackpad, or joystick via SPI/I2C (PMW3360, ADNS9800, Cirque, etc.).',
    requiredConfig: [], optionalConfig: ['POINTING_DEVICE_DRIVER'], incompatibleWith: [],
    inputs: [
      { key: 'POINTING_DEVICE_DRIVER', type: 'select', description: 'Pointing device driver',
        defaultValue: 'pmw3360',
        options: ['pmw3360', 'pmw3389', 'adns9800', 'cirque_pinnacle_spi', 'cirque_pinnacle_i2c', 'pimoroni_trackball', 'custom'] },
      { key: 'POINTING_DEVICE_CS_PIN', type: 'pin', description: 'SPI chip select pin', defaultValue: 'B0',
        conditionalOn: { POINTING_DEVICE_DRIVER: ['pmw3360', 'pmw3389', 'adns9800', 'cirque_pinnacle_spi'] } },
      { key: 'POINTING_DEVICE_MOTION_PIN', type: 'pin', description: 'Motion interrupt pin', defaultValue: 'E6',
        conditionalOn: { POINTING_DEVICE_DRIVER: ['pmw3360', 'pmw3389', 'adns9800'] } },
      { key: 'POINTING_DEVICE_ROTATION_90', type: 'select', description: 'Rotate sensor 90°', defaultValue: 'no', options: ['yes', 'no'] },
      { key: 'POINTING_DEVICE_INVERT_X', type: 'select', description: 'Invert X axis', defaultValue: 'no', options: ['yes', 'no'] },
      { key: 'POINTING_DEVICE_INVERT_Y', type: 'select', description: 'Invert Y axis', defaultValue: 'no', options: ['yes', 'no'] },
    ],
  },
  {
    id: 'encoder', name: 'Encoder', group: 'Input',
    rulesMkKey: 'ENCODER_ENABLE', qmkPrevalence: 0.131,
    description: 'Rotary encoder support with per-layer actions.',
    requiredConfig: [], optionalConfig: ['ENCODER_RESOLUTION'], incompatibleWith: [],
    inputs: [
      { key: 'ENCODER_COUNT', type: 'text', description: 'Number of rotary encoders', defaultValue: '1' },
      { key: 'ENCODER_PAD_A_0', type: 'pin', description: 'Encoder Phase A pin', defaultValue: 'B6', repeatPerCount: 'ENCODER_COUNT' },
      { key: 'ENCODER_PAD_B_0', type: 'pin', description: 'Encoder Phase B pin', defaultValue: 'B2', repeatPerCount: 'ENCODER_COUNT' },
      { key: 'ENCODER_RESOLUTION', type: 'text', description: 'Encoder resolution (quadrature)', defaultValue: '4' },
    ],
  },
  {
    id: 'split_keyboard', name: 'Split Keyboard', group: 'Hardware',
    rulesMkKey: 'SPLIT_KEYBOARD', qmkPrevalence: 0.093,
    description: 'Bidirectional split keyboard communication over TRRS/USART.',
    requiredConfig: ['SOFT_SERIAL_PIN'], optionalConfig: ['SPLIT_USB_DETECT','SPLIT_TRANSPORT_MIRROR','SPLIT_LAYER_STATE_ENABLE','SPLIT_RGB_MATRIX_ENABLE'],
    incompatibleWith: [],
    inputs: [
      { key: 'SPLIT_TRANSPORT', type: 'select', description: 'Transport protocol for split communication',
        defaultValue: 'serial',
        options: ['serial', 'i2c', 'uart'] },
      { key: 'SOFT_SERIAL_PIN', type: 'pin', description: 'Soft serial (TRRS) pin', defaultValue: 'D2',
        conditionalOn: { SPLIT_TRANSPORT: 'serial' } },
      { key: 'SPLIT_I2C_SDA', type: 'pin', description: 'I2C SDA pin for split link', defaultValue: 'D2',
        conditionalOn: { SPLIT_TRANSPORT: 'i2c' } },
      { key: 'SPLIT_I2C_SCL', type: 'pin', description: 'I2C SCL pin for split link', defaultValue: 'D1',
        conditionalOn: { SPLIT_TRANSPORT: 'i2c' } },
      { key: 'SPLIT_IS_MASTER', type: 'select', description: 'Plugged in side is the master', defaultValue: 'yes', options: ['yes', 'no'] },
      { key: 'SPLIT_USB_DETECT', type: 'select', description: 'Auto-detect USB half', defaultValue: 'yes', options: ['yes', 'no'] },
      { key: 'SPLIT_TRANSPORT_MIRROR', type: 'select', description: 'Mirror keymap over split link', defaultValue: 'no', options: ['yes', 'no'] },
      { key: 'SPLIT_LAYER_STATE_ENABLE', type: 'select', description: 'Sync layer state across halves', defaultValue: 'no', options: ['yes', 'no'] },
      { key: 'SPLIT_RGB_MATRIX_ENABLE', type: 'select', description: 'Sync RGB matrix across halves', defaultValue: 'no', options: ['yes', 'no'] },
    ],
  },
  {
    id: 'oled', name: 'OLED Display', group: 'Display',
    rulesMkKey: 'OLED_ENABLE', qmkPrevalence: 0.050,
    description: 'OLED screen support (typically SSD1306 over I2C).',
    requiredConfig: [], optionalConfig: ['OLED_BRIGHTNESS','OLED_TIMEOUT'], incompatibleWith: [],
    inputs: [
      { key: 'OLED_COUNT', type: 'text', description: 'Number of OLED displays', defaultValue: '1' },
      { key: 'OLED_DRIVER_0', type: 'select', description: 'OLED 0 driver chip',
        defaultValue: 'SSD1306',
        options: ['SSD1306', 'SH1106', 'ST7567'],
        repeatPerCount: 'OLED_COUNT' },
      { key: 'OLED_I2C_ADDRESS_0', type: 'text', description: 'OLED 0 I2C address', defaultValue: '0x3C',
        repeatPerCount: 'OLED_COUNT' },
      { key: 'OLED_I2C_SDA_0', type: 'pin', description: 'OLED SDA pin', defaultValue: 'D2',
        repeatPerCount: 'OLED_COUNT' },
      { key: 'OLED_I2C_SCL_0', type: 'pin', description: 'OLED SCL pin', defaultValue: 'D1',
        repeatPerCount: 'OLED_COUNT' },
      { key: 'OLED_DISPLAY_SIZE_0', type: 'select', description: 'OLED 0 display size',
        defaultValue: '64_32',
        options: ['64_32', '64_48', '128_32', '128_64'],
        repeatPerCount: 'OLED_COUNT' },
      { key: 'OLED_BRIGHTNESS', type: 'text', description: 'OLED brightness (0-255)', defaultValue: '255' },
      { key: 'OLED_TIMEOUT', type: 'text', description: 'Timeout before sleep (ms)', defaultValue: '20000' },
    ],
  },
  {
    id: 'backlight', name: 'Backlight', group: 'Lighting',
    rulesMkKey: 'BACKLIGHT_ENABLE', qmkPrevalence: 0.102,
    description: 'Simple single-color PWM backlight for switches.',
    requiredConfig: [], optionalConfig: ['BACKLIGHT_LEVELS','BACKLIGHT_BREATHING'], incompatibleWith: ['rgb_matrix'],
    inputs: [
      { key: 'BACKLIGHT_PIN', type: 'pin', description: 'Backlight PWM pin', defaultValue: 'B7' },
      { key: 'BACKLIGHT_LEVELS', type: 'text', description: 'Number of brightness levels', defaultValue: '3' },
      { key: 'BACKLIGHT_BREATHING', type: 'select', description: 'Enable breathing animation', defaultValue: 'no', options: ['yes', 'no'] },
    ],
  },
  {
    id: 'console', name: 'Console', group: 'Debug',
    rulesMkKey: 'CONSOLE_ENABLE', qmkPrevalence: 0.125,
    description: 'HID console for debug output via hid_listen.',
    requiredConfig: [], optionalConfig: [], incompatibleWith: [],
    inputs: [],
  },
  {
    id: 'tap_dance', name: 'Tap Dance', group: 'Advanced',
    rulesMkKey: 'TAP_DANCE_ENABLE', qmkPrevalence: 0.007,
    description: 'Different actions on single tap, double tap, or hold.',
    requiredConfig: [], optionalConfig: ['TAPPING_TERM'], incompatibleWith: [],
    inputs: [
      { key: 'TAPPING_TERM', type: 'text', description: 'Tapping term in ms', defaultValue: '200' },
    ],
  },
  {
    id: 'combo', name: 'Combo Keys', group: 'Advanced',
    rulesMkKey: 'COMBO_ENABLE', qmkPrevalence: 0.012,
    description: 'Trigger actions when multiple keys are pressed simultaneously.',
    requiredConfig: [], optionalConfig: ['COMBO_TERM'], incompatibleWith: [],
    inputs: [
      { key: 'COMBO_TERM', type: 'text', description: 'Combo term in ms', defaultValue: '65' },
    ],
  },
  {
    id: 'audio', name: 'Audio', group: 'Advanced',
    rulesMkKey: 'AUDIO_ENABLE', qmkPrevalence: 0.016,
    description: 'Piezo buzzer or PWM speaker with musical notes.',
    requiredConfig: ['AUDIO_PIN'], optionalConfig: ['AUDIO_CLICKY'], incompatibleWith: [],
    inputs: [
      { key: 'AUDIO_PIN', type: 'pin', description: 'Audio output pin (piezo/speaker)', defaultValue: 'C6' },
      { key: 'AUDIO_CLICKY', type: 'select', description: 'Enable clicky typing sounds', defaultValue: 'no', options: ['yes', 'no'] },
    ],
  },
]

export const moduleById = new Map<string, FeatureModule>(
  FEATURE_MODULES.map((m) => [m.id, m])
)

// Symmetric incompatibility map: id → Set of incompatible ids
export const incompatMap = new Map<string, Set<string>>()
for (const m of FEATURE_MODULES) {
  for (const dep of m.incompatibleWith) {
    if (!incompatMap.has(m.id)) incompatMap.set(m.id, new Set())
    if (!incompatMap.has(dep)) incompatMap.set(dep, new Set())
    incompatMap.get(m.id)!.add(dep)
    incompatMap.get(dep)!.add(m.id)
  }
}
