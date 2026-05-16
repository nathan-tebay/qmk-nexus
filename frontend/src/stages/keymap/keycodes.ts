export interface KeycodeCategory {
  id: string
  label: string
}

export interface Keycode {
  code: string
  label: string
  category: string
  description?: string
  shifted?: { code: string; label: string }
  /**
   * If set, this keycode requires the named feature flag (id in
   * FEATURE_MODULES) to be enabled. Pickers hide entries whose feature is off.
   */
  requiresFeature?: string
}

export const CATEGORIES: readonly KeycodeCategory[] = [
  { id: 'basic', label: 'Basic' },
  { id: 'modifiers', label: 'Modifiers' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'function', label: 'Function' },
  { id: 'numpad', label: 'Numpad' },
  { id: 'media', label: 'Media' },
  { id: 'layers', label: 'Layers' },
  { id: 'mouse', label: 'Mouse' },
  { id: 'lighting', label: 'Lighting' },
  { id: 'special', label: 'Special' },
]

export const KEYCODES: readonly Keycode[] = [
  // Special — transparent / no-op
  { code: 'KC_TRNS', label: '____', category: 'special', description: 'Transparent (inherit from lower layer)' },
  { code: 'KC_NO',   label: 'No',   category: 'special', description: 'No action' },
  // Special — system
  { code: 'QK_BOOT', label: 'Boot',  category: 'special', description: 'Enter bootloader mode' },
  { code: 'QK_RBT',  label: 'Reboot',category: 'special', description: 'Reboot the firmware' },
  { code: 'EE_CLR',  label: 'EEClr', category: 'special', description: 'Clear EEPROM (factory reset)' },
  { code: 'QK_LOCK', label: 'Lock',  category: 'special', description: 'Lock next key in pressed state', requiresFeature: 'key_lock' },
  // Dynamic Macros (requires Dynamic Macros feature)
  { code: 'DM_REC1', label: 'Rec1',  category: 'special', description: 'Start recording macro slot 1', requiresFeature: 'dynamic_macro' },
  { code: 'DM_REC2', label: 'Rec2',  category: 'special', description: 'Start recording macro slot 2', requiresFeature: 'dynamic_macro' },
  { code: 'DM_RSTP', label: 'DmStp', category: 'special', description: 'Stop recording macro', requiresFeature: 'dynamic_macro' },
  { code: 'DM_PLY1', label: 'Ply1',  category: 'special', description: 'Replay macro slot 1', requiresFeature: 'dynamic_macro' },
  { code: 'DM_PLY2', label: 'Ply2',  category: 'special', description: 'Replay macro slot 2', requiresFeature: 'dynamic_macro' },
  { code: 'QK_LEAD', label: 'Lead',  category: 'special', description: 'Activate leader key sequence', requiresFeature: 'leader_key' },

  // Basic — letters
  ...Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ').map((c) => ({
    code: `KC_${c}`, label: c, category: 'basic',
  })),

  // Basic — numbers row
  { code: 'KC_1', label: '1', category: 'basic', shifted: { code: 'KC_EXLM', label: '!' } },
  { code: 'KC_2', label: '2', category: 'basic', shifted: { code: 'KC_AT',   label: '@' } },
  { code: 'KC_3', label: '3', category: 'basic', shifted: { code: 'KC_HASH', label: '#' } },
  { code: 'KC_4', label: '4', category: 'basic', shifted: { code: 'KC_DLR',  label: '$' } },
  { code: 'KC_5', label: '5', category: 'basic', shifted: { code: 'KC_PERC', label: '%' } },
  { code: 'KC_6', label: '6', category: 'basic', shifted: { code: 'KC_CIRC', label: '^' } },
  { code: 'KC_7', label: '7', category: 'basic', shifted: { code: 'KC_AMPR', label: '&' } },
  { code: 'KC_8', label: '8', category: 'basic', shifted: { code: 'KC_ASTR', label: '*' } },
  { code: 'KC_9', label: '9', category: 'basic', shifted: { code: 'KC_LPRN', label: '(' } },
  { code: 'KC_0', label: '0', category: 'basic', shifted: { code: 'KC_RPRN', label: ')' } },

  // Basic — punctuation
  { code: 'KC_SPACE', label: 'Spc', category: 'basic' },
  { code: 'KC_MINUS', label: '-',  category: 'basic', shifted: { code: 'KC_UNDS', label: '_' } },
  { code: 'KC_EQUAL', label: '=',  category: 'basic', shifted: { code: 'KC_PLUS', label: '+' } },
  { code: 'KC_LBRC',  label: '[',  category: 'basic', shifted: { code: 'KC_LCBR', label: '{' } },
  { code: 'KC_RBRC',  label: ']',  category: 'basic', shifted: { code: 'KC_RCBR', label: '}' } },
  { code: 'KC_BSLS',  label: '\\', category: 'basic', shifted: { code: 'KC_PIPE', label: '|' } },
  { code: 'KC_SCLN',  label: ';',  category: 'basic', shifted: { code: 'KC_COLN', label: ':' } },
  { code: 'KC_QUOT',  label: "'",  category: 'basic', shifted: { code: 'KC_DQUO', label: '"' } },
  { code: 'KC_GRV',   label: '`',  category: 'basic', shifted: { code: 'KC_TILD', label: '~' } },
  { code: 'KC_COMM',  label: ',',  category: 'basic', shifted: { code: 'KC_LT',   label: '<' } },
  { code: 'KC_DOT',   label: '.',  category: 'basic', shifted: { code: 'KC_GT',   label: '>' } },
  { code: 'KC_SLSH',  label: '/',  category: 'basic', shifted: { code: 'KC_QUES', label: '?' } },

  // Basic — control keys
  { code: 'KC_ESC',   label: 'Esc',  category: 'basic' },
  { code: 'KC_TAB',   label: 'Tab',  category: 'basic' },
  { code: 'KC_BSPC',  label: 'Bksp', category: 'basic' },
  { code: 'KC_ENT',   label: 'Ent',  category: 'basic' },
  { code: 'KC_DEL',   label: 'Del',  category: 'basic' },
  { code: 'KC_INS',   label: 'Ins',  category: 'basic' },
  { code: 'KC_CAPS',  label: 'Caps', category: 'basic' },

  // Modifiers
  { code: 'KC_LCTL', label: 'LCtl', category: 'modifiers' },
  { code: 'KC_RCTL', label: 'RCtl', category: 'modifiers' },
  { code: 'KC_LSFT', label: 'LSft', category: 'modifiers' },
  { code: 'KC_RSFT', label: 'RSft', category: 'modifiers' },
  { code: 'KC_LALT', label: 'LAlt', category: 'modifiers' },
  { code: 'KC_RALT', label: 'RAlt', category: 'modifiers' },
  { code: 'KC_LGUI', label: 'LGui', category: 'modifiers' },
  { code: 'KC_RGUI', label: 'RGui', category: 'modifiers' },
  { code: 'KC_HYPR', label: 'Hyper', category: 'modifiers', description: 'Left Ctrl + Shift + Alt + GUI' },
  { code: 'KC_MEH',  label: 'Meh',   category: 'modifiers', description: 'Left Ctrl + Shift + Alt' },

  // Mod-tap
  { code: 'LCTL_T(KC_ESC)',  label: 'Ctl/Esc', category: 'modifiers', description: 'Ctrl when held, Esc when tapped' },
  { code: 'LSFT_T(KC_BSPC)', label: 'Sft/Bsp', category: 'modifiers', description: 'Shift when held, Backspace when tapped' },
  { code: 'LALT_T(KC_TAB)',  label: 'Alt/Tab', category: 'modifiers', description: 'Alt when held, Tab when tapped' },
  { code: 'LGUI_T(KC_SPC)',  label: 'Gui/Spc', category: 'modifiers', description: 'GUI when held, Space when tapped' },

  // Navigation
  { code: 'KC_UP',   label: '↑',    category: 'navigation' },
  { code: 'KC_DOWN', label: '↓',    category: 'navigation' },
  { code: 'KC_LEFT', label: '←',    category: 'navigation' },
  { code: 'KC_RGHT', label: '→',    category: 'navigation' },
  { code: 'KC_HOME', label: 'Home', category: 'navigation' },
  { code: 'KC_END',  label: 'End',  category: 'navigation' },
  { code: 'KC_PGUP', label: 'PgUp', category: 'navigation' },
  { code: 'KC_PGDN', label: 'PgDn', category: 'navigation' },

  // Function keys
  ...Array.from({ length: 12 }, (_, i) => ({
    code: `KC_F${i + 1}`, label: `F${i + 1}`, category: 'function',
  })),

  // Numpad
  ...Array.from({ length: 10 }, (_, i) => ({
    code: `KC_P${i}`, label: `P${i}`, category: 'numpad',
  })),
  { code: 'KC_PPLS', label: 'P+',   category: 'numpad' },
  { code: 'KC_PMNS', label: 'P-',   category: 'numpad' },
  { code: 'KC_PAST', label: 'P*',   category: 'numpad' },
  { code: 'KC_PSLS', label: 'P/',   category: 'numpad' },
  { code: 'KC_PENT', label: 'PEnt', category: 'numpad' },
  { code: 'KC_PDOT', label: 'P.',   category: 'numpad' },
  { code: 'KC_NLCK', label: 'NLck', category: 'numpad' },

  // Media
  { code: 'KC_MPLY', label: '⏯',  category: 'media' },
  { code: 'KC_MSTP', label: '⏹',  category: 'media' },
  { code: 'KC_MPRV', label: '⏮',  category: 'media' },
  { code: 'KC_MNXT', label: '⏭',  category: 'media' },
  { code: 'KC_MUTE', label: '🔇', category: 'media' },
  { code: 'KC_VOLU', label: '🔊', category: 'media' },
  { code: 'KC_VOLD', label: '🔉', category: 'media' },
  { code: 'KC_BRIU', label: 'Br+', category: 'media' },
  { code: 'KC_BRID', label: 'Br-', category: 'media' },

  // Layers — MO (momentary)
  ...Array.from({ length: 5 }, (_, i) => ({
    code: `MO(${i + 1})`, label: `Mo(${i + 1})`, category: 'layers',
    description: `Momentary layer ${i + 1}`,
  })),
  // Layers — TG (toggle)
  ...Array.from({ length: 5 }, (_, i) => ({
    code: `TG(${i + 1})`, label: `Tg(${i + 1})`, category: 'layers',
    description: `Toggle layer ${i + 1}`,
  })),
  // Layers — LT (layer-tap with Space)
  ...Array.from({ length: 5 }, (_, i) => ({
    code: `LT(${i + 1},KC_SPC)`, label: `L${i + 1}/Spc`, category: 'layers',
    description: `Layer ${i + 1} when held, Space when tapped`,
  })),
  // Layers — LT (layer-tap with Enter)
  ...Array.from({ length: 5 }, (_, i) => ({
    code: `LT(${i + 1},KC_ENT)`, label: `L${i + 1}/Ent`, category: 'layers',
    description: `Layer ${i + 1} when held, Enter when tapped`,
  })),
  // Layers — DF (set default)
  ...Array.from({ length: 5 }, (_, i) => ({
    code: `DF(${i})`, label: `Df(${i})`, category: 'layers',
    description: `Set layer ${i} as default layer`,
  })),
  // Layers — TO (activate exclusively)
  ...Array.from({ length: 5 }, (_, i) => ({
    code: `TO(${i + 1})`, label: `To(${i + 1})`, category: 'layers',
    description: `Turn on layer ${i + 1} exclusively`,
  })),
  // Layers — OSL (one-shot)
  ...Array.from({ length: 5 }, (_, i) => ({
    code: `OSL(${i + 1})`, label: `Os(${i + 1})`, category: 'layers',
    description: `One-shot layer ${i + 1}`,
  })),

  // Mouse (requires Mouse Keys feature)
  ...([
    ['KC_MS_U', 'M↑',   'Mouse cursor up'],
    ['KC_MS_D', 'M↓',   'Mouse cursor down'],
    ['KC_MS_L', 'M←',   'Mouse cursor left'],
    ['KC_MS_R', 'M→',   'Mouse cursor right'],
    ['KC_WH_U', 'Wh↑',  'Scroll wheel up'],
    ['KC_WH_D', 'Wh↓',  'Scroll wheel down'],
    ['KC_WH_L', 'Wh←',  'Scroll wheel left'],
    ['KC_WH_R', 'Wh→',  'Scroll wheel right'],
    ['KC_BTN1', 'Btn1', 'Mouse button 1 (left)'],
    ['KC_BTN2', 'Btn2', 'Mouse button 2 (right)'],
    ['KC_BTN3', 'Btn3', 'Mouse button 3 (middle)'],
    ['KC_ACL0', 'Ac0',  'Mouse speed level 0 (slow)'],
    ['KC_ACL1', 'Ac1',  'Mouse speed level 1'],
    ['KC_ACL2', 'Ac2',  'Mouse speed level 2 (fast)'],
  ] as const).map(([code, label, description]) => ({
    code, label, category: 'mouse', description, requiresFeature: 'mousekeys',
  })),

  // Lighting — RGB (requires RGB Light or RGB Matrix)
  ...([
    ['RGB_TOG',  'RgbTog', 'Toggle RGB on/off'],
    ['RGB_MOD',  'RgbMod', 'Cycle RGB mode forward'],
    ['RGB_RMOD', 'RgbRMd', 'Cycle RGB mode backward'],
    ['RGB_HUI',  'Hue+',   'Increase hue'],
    ['RGB_HUD',  'Hue-',   'Decrease hue'],
    ['RGB_SAI',  'Sat+',   'Increase saturation'],
    ['RGB_SAD',  'Sat-',   'Decrease saturation'],
    ['RGB_VAI',  'Val+',   'Increase brightness'],
    ['RGB_VAD',  'Val-',   'Decrease brightness'],
    ['RGB_SPI',  'Spd+',   'Increase animation speed'],
    ['RGB_SPD',  'Spd-',   'Decrease animation speed'],
  ] as const).map(([code, label, description]) => ({
    code, label, category: 'lighting', description, requiresFeature: 'rgblight|rgb_matrix',
  })),
  // Lighting — Backlight (requires Backlight)
  ...([
    ['BL_TOGG',  'BlTog',  'Toggle backlight on/off'],
    ['BL_UP',    'Bl+',    'Increase backlight level'],
    ['BL_DOWN',  'Bl-',    'Decrease backlight level'],
    ['BL_BRTG',  'BlBrg',  'Toggle backlight breathing'],
  ] as const).map(([code, label, description]) => ({
    code, label, category: 'lighting', description, requiresFeature: 'backlight',
  })),
]

/**
 * Returns true if `keycode` is available given the enabled feature flags.
 * Accepts pipe-separated alternatives in `requiresFeature` (e.g. RGB keys
 * need rgblight OR rgb_matrix).
 */
export function isKeycodeAvailable(
  keycode: Keycode,
  features: Record<string, boolean>,
): boolean {
  if (!keycode.requiresFeature) return true
  return keycode.requiresFeature
    .split('|')
    .some((flag) => !!features[flag])
}

export const keycodeMap = new Map<string, Keycode>(
  KEYCODES.flatMap((k) => {
    const entries: [string, Keycode][] = [[k.code, k]]
    if (k.shifted) entries.push([k.shifted.code, { code: k.shifted.code, label: k.shifted.label, category: k.category }])
    return entries
  })
)
