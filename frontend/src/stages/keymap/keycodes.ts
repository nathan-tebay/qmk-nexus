export interface KeycodeCategory {
  id: string
  label: string
}

export interface Keycode {
  code: string
  label: string
  category: string
  description?: string
}

export const CATEGORIES: readonly KeycodeCategory[] = [
  { id: 'basic', label: 'Basic' },
  { id: 'modifiers', label: 'Modifiers' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'function', label: 'Function' },
  { id: 'numpad', label: 'Numpad' },
  { id: 'media', label: 'Media' },
  { id: 'layers', label: 'Layers' },
  { id: 'special', label: 'Special' },
]

export const KEYCODES: readonly Keycode[] = [
  // Special
  { code: 'KC_TRNS', label: '___',  category: 'special', description: 'Transparent (inherit from lower layer)' },
  { code: 'KC_NO',   label: 'XXXX', category: 'special', description: 'No action' },

  // Basic — letters
  ...Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ').map((c) => ({
    code: `KC_${c}`, label: c, category: 'basic',
  })),

  // Basic — numbers row
  { code: 'KC_1', label: '1', category: 'basic' },
  { code: 'KC_2', label: '2', category: 'basic' },
  { code: 'KC_3', label: '3', category: 'basic' },
  { code: 'KC_4', label: '4', category: 'basic' },
  { code: 'KC_5', label: '5', category: 'basic' },
  { code: 'KC_6', label: '6', category: 'basic' },
  { code: 'KC_7', label: '7', category: 'basic' },
  { code: 'KC_8', label: '8', category: 'basic' },
  { code: 'KC_9', label: '9', category: 'basic' },
  { code: 'KC_0', label: '0', category: 'basic' },

  // Basic — punctuation
  { code: 'KC_SPACE', label: 'Spc',  category: 'basic' },
  { code: 'KC_MINUS', label: '-',    category: 'basic' },
  { code: 'KC_EQUAL', label: '=',    category: 'basic' },
  { code: 'KC_LBRC',  label: '[',    category: 'basic' },
  { code: 'KC_RBRC',  label: ']',    category: 'basic' },
  { code: 'KC_BSLS',  label: '\\',   category: 'basic' },
  { code: 'KC_SCLN',  label: ';',    category: 'basic' },
  { code: 'KC_QUOT',  label: "'",    category: 'basic' },
  { code: 'KC_GRV',   label: '`',    category: 'basic' },
  { code: 'KC_COMM',  label: ',',    category: 'basic' },
  { code: 'KC_DOT',   label: '.',    category: 'basic' },
  { code: 'KC_SLSH',  label: '/',    category: 'basic' },

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
]

export const keycodeMap = new Map<string, Keycode>(
  KEYCODES.map((k) => [k.code, k])
)
