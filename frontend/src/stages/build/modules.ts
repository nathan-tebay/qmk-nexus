export interface FeatureModule {
  id: string
  name: string
  description: string
  rulesMkKey: string
  requiredConfig: string[]
  optionalConfig: string[]
  incompatibleWith: string[]
  qmkPrevalence: number
}

export const FEATURE_MODULES: readonly FeatureModule[] = [
  { id: 'extrakey',      name: 'Extra Keys',          rulesMkKey: 'EXTRAKEY_ENABLE',    qmkPrevalence: 0.670, description: 'Media and system control keys (volume, play, brightness).', requiredConfig: [], optionalConfig: [], incompatibleWith: [] },
  { id: 'bootmagic',     name: 'Boot Magic',          rulesMkKey: 'BOOTMAGIC_ENABLE',   qmkPrevalence: 0.554, description: 'Hold a key at power-on to enter bootloader or change settings.', requiredConfig: [], optionalConfig: ['BOOTMAGIC_LITE_ROW','BOOTMAGIC_LITE_COLUMN'], incompatibleWith: [] },
  { id: 'mousekey',      name: 'Mouse Keys',          rulesMkKey: 'MOUSEKEY_ENABLE',    qmkPrevalence: 0.524, description: 'Control the mouse cursor and buttons from keyboard keys.', requiredConfig: [], optionalConfig: ['MOUSEKEY_DELAY','MOUSEKEY_INTERVAL','MOUSEKEY_MAX_SPEED'], incompatibleWith: [] },
  { id: 'nkro',          name: 'N-Key Rollover',      rulesMkKey: 'NKRO_ENABLE',        qmkPrevalence: 0.428, description: 'Report all simultaneous keypresses without USB protocol limits.', requiredConfig: [], optionalConfig: ['FORCE_NKRO'], incompatibleWith: [] },
  { id: 'rgblight',      name: 'RGB Light (Underglow)',rulesMkKey: 'RGBLIGHT_ENABLE',    qmkPrevalence: 0.244, description: 'WS2812-style per-LED underglow strip lighting with animations.', requiredConfig: [], optionalConfig: ['RGBLIGHT_LED_COUNT','RGBLIGHT_LIMIT_VAL','RGBLIGHT_DEFAULT_MODE'], incompatibleWith: ['rgb_matrix'] },
  { id: 'rgb_matrix',    name: 'RGB Matrix',          rulesMkKey: 'RGB_MATRIX_ENABLE',  qmkPrevalence: 0.111, description: 'Per-key RGB LED control via a matrix driver (IS31FL3xxx, WS2812).', requiredConfig: ['RGB_MATRIX_LED_COUNT'], optionalConfig: ['RGB_MATRIX_MAXIMUM_BRIGHTNESS','RGB_MATRIX_DEFAULT_MODE','RGB_MATRIX_SLEEP'], incompatibleWith: ['backlight'] },
  { id: 'encoder',       name: 'Encoder',             rulesMkKey: 'ENCODER_ENABLE',     qmkPrevalence: 0.131, description: 'Rotary encoder support with per-layer actions.', requiredConfig: [], optionalConfig: ['ENCODER_RESOLUTION'], incompatibleWith: [] },
  { id: 'split_keyboard',name: 'Split Keyboard',      rulesMkKey: 'SPLIT_KEYBOARD',     qmkPrevalence: 0.093, description: 'Bidirectional split keyboard communication over TRRS/USART.', requiredConfig: ['SOFT_SERIAL_PIN'], optionalConfig: ['SPLIT_USB_DETECT','SPLIT_TRANSPORT_MIRROR','SPLIT_LAYER_STATE_ENABLE','SPLIT_RGB_MATRIX_ENABLE'], incompatibleWith: [] },
  { id: 'oled',          name: 'OLED Display',        rulesMkKey: 'OLED_ENABLE',        qmkPrevalence: 0.050, description: 'OLED screen support (typically SSD1306 over I2C).', requiredConfig: [], optionalConfig: ['OLED_BRIGHTNESS','OLED_TIMEOUT'], incompatibleWith: [] },
  { id: 'backlight',     name: 'Backlight',           rulesMkKey: 'BACKLIGHT_ENABLE',   qmkPrevalence: 0.102, description: 'Simple single-color PWM backlight for switches.', requiredConfig: [], optionalConfig: ['BACKLIGHT_LEVELS','BACKLIGHT_BREATHING'], incompatibleWith: ['rgb_matrix'] },
  { id: 'console',       name: 'Console',             rulesMkKey: 'CONSOLE_ENABLE',     qmkPrevalence: 0.125, description: 'HID console for debug output via hid_listen.', requiredConfig: [], optionalConfig: [], incompatibleWith: [] },
  { id: 'tap_dance',     name: 'Tap Dance',           rulesMkKey: 'TAP_DANCE_ENABLE',   qmkPrevalence: 0.007, description: 'Different actions on single tap, double tap, or hold.', requiredConfig: [], optionalConfig: ['TAPPING_TERM'], incompatibleWith: [] },
  { id: 'combo',         name: 'Combo Keys',          rulesMkKey: 'COMBO_ENABLE',       qmkPrevalence: 0.012, description: 'Trigger actions when multiple keys are pressed simultaneously.', requiredConfig: [], optionalConfig: ['COMBO_TERM'], incompatibleWith: [] },
  { id: 'audio',         name: 'Audio',               rulesMkKey: 'AUDIO_ENABLE',       qmkPrevalence: 0.016, description: 'Piezo buzzer or PWM speaker with musical notes.', requiredConfig: ['AUDIO_PIN'], optionalConfig: ['AUDIO_CLICKY'], incompatibleWith: [] },
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
