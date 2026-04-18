import { create } from 'zustand'

export interface KeyDef {
  id: string
  x: number
  y: number
  w: number
  h: number
  rotation: number
  label: string
  row: number | null
  col: number | null
  ledIndex: number | null
}

export interface MatrixPin {
  row: number
  pin: string
}

export interface ColPin {
  col: number
  pin: string
}

export interface Layer {
  id: string
  name: string
  keycodes: Record<string, string>
}

export interface KeyboardConfig {
  id: string | null
  name: string
  mcu: string
  usbVid: string
  usbPid: string
  manufacturer: string
  keys: KeyDef[]
  rowPins: MatrixPin[]
  colPins: ColPin[]
  layers: Layer[]
  features: Record<string, boolean>
  softSerialPin: string
}

const defaultConfig: KeyboardConfig = {
  id: null,
  name: 'My Keyboard',
  mcu: 'atmega32u4',
  usbVid: '0xFEED',
  usbPid: '0x0000',
  manufacturer: '',
  keys: [],
  rowPins: [],
  colPins: [],
  layers: [{ id: 'layer0', name: 'Base', keycodes: {} }],
  softSerialPin: 'D0',
  features: {
    rgb_matrix: false,
    backlight: false,
    encoder: false,
    oled: false,
    split_keyboard: false,
    nkro: true,
    bootmagic: true,
    mousekey: false,
    extrakey: true,
  },
}

interface KeyboardStore {
  config: KeyboardConfig
  selectedKeyId: string | null
  activeLayerId: string
  setConfig: (config: Partial<KeyboardConfig>) => void
  setSelectedKey: (id: string | null) => void
  setActiveLayer: (id: string) => void
  addKey: (key: KeyDef) => void
  updateKey: (id: string, updates: Partial<KeyDef>) => void
  removeKey: (id: string) => void
  setKeycode: (keyId: string, layerId: string, keycode: string) => void
  toggleFeature: (feature: string) => void
  addLayer: () => void
  removeLayer: (id: string) => void
  renameLayer: (id: string, name: string) => void
}

export const useKeyboardStore = create<KeyboardStore>((set) => ({
  config: defaultConfig,
  selectedKeyId: null,
  activeLayerId: 'layer0',

  setConfig: (updates) =>
    set((s) => ({ config: { ...s.config, ...updates } })),

  setSelectedKey: (id) => set({ selectedKeyId: id }),

  setActiveLayer: (id) => set({ activeLayerId: id }),

  addKey: (key) =>
    set((s) => ({ config: { ...s.config, keys: [...s.config.keys, key] } })),

  updateKey: (id, updates) =>
    set((s) => ({
      config: {
        ...s.config,
        keys: s.config.keys.map((k) => (k.id === id ? { ...k, ...updates } : k)),
      },
    })),

  removeKey: (id) =>
    set((s) => ({
      config: { ...s.config, keys: s.config.keys.filter((k) => k.id !== id) },
    })),

  setKeycode: (keyId, layerId, keycode) =>
    set((s) => ({
      config: {
        ...s.config,
        layers: s.config.layers.map((l) =>
          l.id === layerId
            ? { ...l, keycodes: { ...l.keycodes, [keyId]: keycode } }
            : l
        ),
      },
    })),

  toggleFeature: (feature) =>
    set((s) => ({
      config: {
        ...s.config,
        features: { ...s.config.features, [feature]: !s.config.features[feature] },
      },
    })),

  addLayer: () =>
    set((s) => {
      const n = s.config.layers.length
      const id = `layer${n}`
      return {
        config: { ...s.config, layers: [...s.config.layers, { id, name: `Layer ${n}`, keycodes: {} }] },
        activeLayerId: id,
      }
    }),

  removeLayer: (id) =>
    set((s) => {
      if (id === 'layer0') return s
      const layers = s.config.layers.filter((l) => l.id !== id)
      return {
        config: { ...s.config, layers },
        activeLayerId: s.activeLayerId === id ? 'layer0' : s.activeLayerId,
      }
    }),

  renameLayer: (id, name) =>
    set((s) => ({
      config: {
        ...s.config,
        layers: s.config.layers.map((l) => l.id === id ? { ...l, name } : l),
      },
    })),
}))
