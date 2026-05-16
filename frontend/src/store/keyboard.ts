import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { matrixExtentOrNull } from '@/utils/matrixExtent'

function makeUF(ids: string[]) {
  const parent = new Map<string, string>()
  for (const id of ids) parent.set(id, id)
  const find = (x: string): string => {
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!))
    return parent.get(x)!
  }
  return {
    find,
    union(a: string, b: string) {
      const ra = find(a), rb = find(b)
      if (ra !== rb) parent.set(ra, rb)
    },
  }
}

export function deriveIndices(keys: KeyDef[], edges: MatrixEdge[]): KeyDef[] {
  if (keys.length === 0) return keys
  const ids = keys.map((k) => k.id)
  const keyMap = new Map(keys.map((k) => [k.id, k]))

  function buildComponentIndex(type: 'row' | 'col'): Map<string, number> {
    const uf = makeUF(ids)
    const active = new Set<string>()
    for (const e of edges) {
      if (e.type === type) { uf.union(e.from, e.to); active.add(e.from); active.add(e.to) }
    }
    const components = new Map<string, string[]>()
    for (const id of active) {
      const root = uf.find(id)
      const arr = components.get(root) ?? []
      arr.push(id)
      components.set(root, arr)
    }
    const sorted = [...components.entries()].sort(([, aM], [, bM]) => {
      const minPos = (ms: string[]) => ms.reduce(
        (acc, id) => { const k = keyMap.get(id)!; return k.y < acc.y || (k.y === acc.y && k.x < acc.x) ? { x: k.x, y: k.y } : acc },
        { x: Infinity, y: Infinity },
      )
      const a = minPos(aM), b = minPos(bM)
      return a.y !== b.y ? a.y - b.y : a.x - b.x
    })
    const result = new Map<string, number>()
    sorted.forEach(([, members], idx) => { for (const id of members) result.set(id, idx) })
    return result
  }

  const rowIdx = buildComponentIndex('row')
  const colIdx = buildComponentIndex('col')

  // LED chain traversal
  const ledAdj = new Map<string, string[]>()
  const ledActive = new Set<string>()
  for (const e of edges) {
    if (e.type !== 'led') continue
    if (!ledAdj.has(e.from)) ledAdj.set(e.from, [])
    if (!ledAdj.has(e.to)) ledAdj.set(e.to, [])
    ledAdj.get(e.from)!.push(e.to)
    ledAdj.get(e.to)!.push(e.from)
    ledActive.add(e.from); ledActive.add(e.to)
  }
  const ledIndexMap = new Map<string, number>()
  const ledVisited = new Set<string>()
  let ledCounter = 0
  const chainStarts = [...ledActive]
    .filter((id) => (ledAdj.get(id)?.length ?? 0) <= 1)
    .sort((a, b) => { const ka = keyMap.get(a)!, kb = keyMap.get(b)!; return ka.y !== kb.y ? ka.y - kb.y : ka.x - kb.x })
  for (const start of chainStarts) {
    if (ledVisited.has(start)) continue
    let cur: string | undefined = start, prev: string | undefined = undefined
    while (cur && !ledVisited.has(cur)) {
      ledVisited.add(cur); ledIndexMap.set(cur, ledCounter++)
      const next: string | undefined = (ledAdj.get(cur) ?? []).find((n) => n !== prev && !ledVisited.has(n))
      prev = cur; cur = next
    }
  }

  return keys.map((k) => ({
    ...k,
    row: rowIdx.has(k.id) ? rowIdx.get(k.id)! : null,
    col: colIdx.has(k.id) ? colIdx.get(k.id)! : null,
    ledIndex: ledIndexMap.has(k.id) ? ledIndexMap.get(k.id)! : null,
  }))
}

export type KeyShapeType = 'rect' | 'iso-enter'

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
  shape: KeyShapeType
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

export interface MatrixEdge {
  from: string  // keyId
  to: string    // keyId
  type: 'row' | 'col' | 'led'
}

export interface EncoderElement {
  id: string
  x: number
  y: number
  hasSwitch: boolean
  diameter: number
}

export interface OledElement {
  id: string
  x: number
  y: number
  rotation: number
  displaySize: '64_32' | '64_48' | '128_32' | '128_64'
  contentMode: 'preset' | 'custom'
  startupBlocks: string[]
  activeBlocks: string[]
  idleBlocks: string[]
  startupDuration: number
  idleTimeout: number
  customCode: string
  customCodeTemplate: string
  logoImage: string
  logoBytes: number[]
  displayRotation: 0 | 90 | 180 | 270
}

export interface ComboEntry {
  id: string
  keys: string[]
  output: string
}

export interface TrackballElement {
  id: string
  x: number
  y: number
  diameter: number
  driver: 'pmw3360' | 'pmw3389' | 'adns9800' | 'cirque_pinnacle_spi' | 'pimoroni_trackball'
}

export type PeripheralType = 'encoder' | 'oled' | 'trackball'

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
  directPins: (string | null)[][]
  matrixEdges: MatrixEdge[]
  layers: Layer[]
  features: Record<string, boolean>
  featureConfigs: Record<string, Record<string, string>>
  featureInputValues: Record<string, Record<string, string>>
  layoutMacro: string
  sourceMode: 'generated' | 'qmk_native' | 'qmk_json'
  upstreamKeyboard: string | null
  upstreamFiles: Record<string, string>
  upstreamLayouts: Record<string, unknown>
  layoutAliases: Record<string, string>
  softSerialPin: string
  encoders: EncoderElement[]
  oleds: OledElement[]
  trackballs: TrackballElement[]
  customFiles: Record<string, string>
  encoderKeycodes: Record<string, string>
  combos: ComboEntry[]
}

const featureDefaults: Record<string, Record<string, string>> = {
  bootmagic: { BOOTMAGIC_LITE_ROW: '', BOOTMAGIC_LITE_COLUMN: '' },
  mousekeys: { MOUSEKEY_DELAY: '500', MOUSEKEY_INTERVAL: '50', MOUSEKEY_MAX_SPEED: '5' },
  nkro: { FORCE_NKRO: 'no' },
  rgblight: { RGBLIGHT_PIN: 'D3', RGBLIGHT_LED_COUNT: '30', RGBLIGHT_LIMIT_VAL: '255', RGBLIGHT_DEFAULT_MODE: 'RGBLIGHT_EFFECT_BREATHING' },
  rgb_matrix: { RGB_MATRIX_DRIVER: 'IS31FL3731', RGB_MATRIX_LED_COUNT: '60', RGB_MATRIX_MAXIMUM_BRIGHTNESS: '255', RGB_MATRIX_DEFAULT_MODE: 'RGB_MATRIX_EFFECT_BREATHING', RGB_MATRIX_SLEEP: 'yes' },
  encoder: { ENCODER_COUNT: '1', ENCODER_RESOLUTION: '4' },
  split_keyboard: { SPLIT_TRANSPORT: 'serial', SOFT_SERIAL_PIN: 'D2', SPLIT_IS_MASTER: 'yes', SPLIT_USB_DETECT: 'yes', SPLIT_TRANSPORT_MIRROR: 'no', SPLIT_LAYER_STATE_ENABLE: 'no', SPLIT_RGB_MATRIX_ENABLE: 'no' },
  oled: { OLED_COUNT: '1', OLED_BRIGHTNESS: '255', OLED_TIMEOUT: '20000' },
  backlight: { BACKLIGHT_PIN: 'B7', BACKLIGHT_LEVELS: '3', BACKLIGHT_BREATHING: 'no' },
  tap_dance: { TAPPING_TERM: '200' },
  combo: { COMBO_TERM: '65' },
  audio: { AUDIO_PIN: 'C6', AUDIO_CLICKY: 'no' },
  pointing_device: { POINTING_DEVICE_DRIVER: 'pmw3360', POINTING_DEVICE_ROTATION_90: 'no', POINTING_DEVICE_INVERT_X: 'no', POINTING_DEVICE_INVERT_Y: 'no' },
  debounce: { DEBOUNCE: '5', DEBOUNCE_TYPE: 'sym_defer_g' },
  key_lock: {},
  dynamic_macro: { DYNAMIC_MACRO_SIZE: '128' },
  indicators: { LED_CAPS_LOCK_PIN: 'B0', LED_NUM_LOCK_PIN: '', LED_SCROLL_LOCK_PIN: '', LED_PIN_ON_STATE: '1' },
  wpm: {},
  leader_key: { LEADER_TIMEOUT: '300', LEADER_PER_KEY_TIMING: 'no' },
}

const featureAliases: Record<string, string> = {
  extrakey: 'extrakeys',
  mousekey: 'mousekeys',
}

function normalizeFeatureId(feature: string): string {
  return featureAliases[feature] ?? feature
}

function normalizeFeatureFlags(features: Record<string, boolean>): Record<string, boolean> {
  const next: Record<string, boolean> = {}
  for (const [feature, enabled] of Object.entries(features ?? {})) {
    const canonical = normalizeFeatureId(feature)
    next[canonical] = !!enabled || !!next[canonical]
  }
  return next
}

function normalizeNestedFeatureConfig(
  configs: Record<string, Record<string, string>>,
): Record<string, Record<string, string>> {
  const next: Record<string, Record<string, string>> = {}
  for (const [feature, values] of Object.entries(configs ?? {})) {
    const canonical = normalizeFeatureId(feature)
    next[canonical] = { ...(next[canonical] ?? {}), ...(values ?? {}) }
  }
  return next
}

function mergeEnabledFeatureDefaults(
  features: Record<string, boolean>,
  configs: Record<string, Record<string, string>>,
): Record<string, Record<string, string>> {
  const next = { ...configs }
  for (const [feature, enabled] of Object.entries(features)) {
    if (!enabled) continue
    const defaults = featureDefaults[feature] ?? {}
    if (Object.keys(defaults).length === 0) continue
    next[feature] = { ...defaults, ...(next[feature] ?? {}) }
  }
  return next
}

function sanitizeEncoderKeycodes(
  encoderKeycodes: Record<string, string>,
  layers: Layer[],
  encoders: EncoderElement[],
): Record<string, string> {
  const layerIds = new Set(layers.map((layer) => layer.id))
  const encoderIds = new Set(encoders.map((encoder) => encoder.id))
  const next: Record<string, string> = {}

  for (const [key, value] of Object.entries(encoderKeycodes ?? {})) {
    const [layerId, encoderId, dir] = key.split(':')
    if (!layerId || !encoderId || !dir) continue
    if (!layerIds.has(layerId) || !encoderIds.has(encoderId)) continue
    if (dir !== 'cw' && dir !== 'ccw') continue
    next[key] = value
  }

  return next
}

function trimMatrixPins(
  keys: KeyDef[],
  rowPins: MatrixPin[],
  colPins: ColPin[],
): Pick<KeyboardConfig, 'rowPins' | 'colPins'> {
  const rowCount = matrixExtentOrNull(keys, 'row')
  const colCount = matrixExtentOrNull(keys, 'col')
  return {
    rowPins: rowCount === null ? rowPins : rowPins.filter((pin) => pin.row >= 0 && pin.row < rowCount),
    colPins: colCount === null ? colPins : colPins.filter((pin) => pin.col >= 0 && pin.col < colCount),
  }
}

function normalizeKeyboardConfig(config: KeyboardConfig): KeyboardConfig {
  const pins = trimMatrixPins(config.keys ?? [], config.rowPins ?? [], config.colPins ?? [])
  const features = normalizeFeatureFlags(config.features ?? {})
  const featureConfigs = mergeEnabledFeatureDefaults(
    features,
    normalizeNestedFeatureConfig(config.featureConfigs ?? {}),
  )
  return {
    ...config,
    features,
    featureConfigs,
    featureInputValues: normalizeNestedFeatureConfig(config.featureInputValues ?? {}),
    layoutMacro: config.layoutMacro || 'LAYOUT',
    sourceMode: config.sourceMode || 'generated',
    upstreamKeyboard: config.upstreamKeyboard ?? null,
    upstreamFiles: config.upstreamFiles ?? {},
    upstreamLayouts: config.upstreamLayouts ?? {},
    layoutAliases: config.layoutAliases ?? {},
    ...pins,
    encoderKeycodes: sanitizeEncoderKeycodes(
      config.encoderKeycodes ?? {},
      config.layers ?? [],
      config.encoders ?? [],
    ),
  }
}

function uid() {
  return crypto.randomUUID().slice(0, 8)
}

function syncPeripheralFeatures(
  config: KeyboardConfig,
): Pick<KeyboardConfig, 'features' | 'featureConfigs'> {
  const features = { ...config.features }
  const fc = { ...config.featureConfigs }

  const encCount = (config.encoders ?? []).length
  features.encoder = encCount > 0
  if (encCount > 0) {
    fc.encoder = { ...(featureDefaults.encoder ?? {}), ...(fc.encoder ?? {}), ENCODER_COUNT: String(encCount) }
  } else {
    delete fc.encoder
  }

  const oledCount = (config.oleds ?? []).length
  features.oled = oledCount > 0
  if (oledCount > 0) {
    fc.oled = { ...(featureDefaults.oled ?? {}), ...(fc.oled ?? {}), OLED_COUNT: String(oledCount) }
  } else {
    delete fc.oled
  }

  const tbCount = (config.trackballs ?? []).length
  features.pointing_device = tbCount > 0
  if (tbCount > 0) {
    fc.pointing_device = { ...(featureDefaults.pointing_device ?? {}), ...(fc.pointing_device ?? {}) }
  } else {
    delete fc.pointing_device
  }

  return { features, featureConfigs: fc }
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
  directPins: [],
  matrixEdges: [],
  layers: [{ id: 'layer0', name: 'Base', keycodes: {} }],
  features: {
    rgb_matrix: false,
    backlight: false,
    encoder: false,
    oled: false,
    split_keyboard: false,
    nkro: true,
    bootmagic: true,
    mousekeys: false,
    extrakeys: true,
    pointing_device: false,
  },
  featureConfigs: {},
  featureInputValues: {},
  layoutMacro: 'LAYOUT',
  sourceMode: 'generated',
  upstreamKeyboard: null,
  upstreamFiles: {},
  upstreamLayouts: {},
  layoutAliases: {},
  softSerialPin: 'D0',
  encoders: [],
  oleds: [],
  trackballs: [],
  customFiles: {},
  encoderKeycodes: {},
  combos: [],
}

interface KeyboardStore {
  config: KeyboardConfig
  selectedKeyId: string | null
  selectedKeyIds: string[]
  activeLayerId: string
  setConfig: (config: Partial<KeyboardConfig>) => void
  setFeatureConfig: (feature: string, key: string, value: string) => void
  setFeatureInputValue: (featureId: string, inputId: string, value: string) => void
  setSelectedKey: (id: string | null) => void
  setSelectedKeys: (ids: string[]) => void
  toggleSelectedKey: (id: string) => void
  setActiveLayer: (id: string) => void
  addKey: (key: KeyDef) => void
  updateKey: (id: string, updates: Partial<KeyDef>) => void
  removeKey: (id: string) => void
  setKeycode: (keyId: string, layerId: string, keycode: string) => void
  toggleFeature: (feature: string) => void
  addLayer: () => void
  removeLayer: (id: string) => void
  renameLayer: (id: string, name: string) => void
  addMatrixEdge: (edge: MatrixEdge) => void
  removeMatrixEdge: (from: string, to: string, type: MatrixEdge['type']) => void
  selectedPeripheralId: string | null
  selectedPeripheralType: PeripheralType | null
  setSelectedPeripheral: (id: string | null, type: PeripheralType | null) => void
  addEncoder: () => void
  removeEncoder: (id: string) => void
  updateEncoder: (id: string, updates: Partial<EncoderElement>) => void
  addOled: () => void
  removeOled: (id: string) => void
  updateOled: (id: string, updates: Partial<OledElement>) => void
  addTrackball: () => void
  removeTrackball: (id: string) => void
  updateTrackball: (id: string, updates: Partial<TrackballElement>) => void
  setCustomFiles: (files: Record<string, string>) => void
  setEncoderKeycode: (layerId: string, encoderId: string, dir: 'cw' | 'ccw', keycode: string) => void
  addCombo: () => void
  removeCombo: (id: string) => void
  updateCombo: (id: string, patch: Partial<Omit<ComboEntry, 'id'>>) => void
  reset: () => void
}

export const useKeyboardStore = create<KeyboardStore>()(persist((set) => ({
  config: defaultConfig,
  selectedKeyId: null,
  selectedKeyIds: [],
  activeLayerId: 'layer0',
  selectedPeripheralId: null,
  selectedPeripheralType: null,

  setConfig: (updates) =>
    set((s) => {
      const config = normalizeKeyboardConfig({ ...s.config, ...updates })
      const keyboardLoaded = updates.id !== undefined || updates.layers !== undefined || updates.keys !== undefined
      const activeLayerStillExists = config.layers.some((layer) => layer.id === s.activeLayerId)
      return {
        config,
        activeLayerId: keyboardLoaded || !activeLayerStillExists
          ? config.layers[0]?.id ?? 'layer0'
          : s.activeLayerId,
        selectedKeyId: keyboardLoaded ? null : s.selectedKeyId,
        selectedKeyIds: keyboardLoaded ? [] : s.selectedKeyIds,
        selectedPeripheralId: keyboardLoaded ? null : s.selectedPeripheralId,
        selectedPeripheralType: keyboardLoaded ? null : s.selectedPeripheralType,
      }
    }),

  setSelectedKey: (id) =>
    set({ selectedKeyId: id, selectedKeyIds: id ? [id] : [] }),

  setSelectedKeys: (ids) =>
    set({ selectedKeyIds: ids, selectedKeyId: ids[0] ?? null }),

  toggleSelectedKey: (id) =>
    set((s) => {
      const next = s.selectedKeyIds.includes(id)
        ? s.selectedKeyIds.filter((k) => k !== id)
        : [...s.selectedKeyIds, id]
      return { selectedKeyIds: next, selectedKeyId: next[0] ?? null }
    }),

  setActiveLayer: (id) => set({ activeLayerId: id }),

  addKey: (key) =>
    set((s) => ({ config: { ...s.config, keys: [...s.config.keys, key] } })),

  updateKey: (id, updates) =>
    set((s) => {
      const keys = s.config.keys.map((k) => (k.id === id ? { ...k, ...updates } : k))
      const pins = trimMatrixPins(keys, s.config.rowPins, s.config.colPins)
      return { config: { ...s.config, keys, ...pins } }
    }),

  removeKey: (id) =>
    set((s) => {
      const edges = (s.config.matrixEdges ?? []).filter((e) => e.from !== id && e.to !== id)
      const keys = deriveIndices(s.config.keys.filter((k) => k.id !== id), edges)
      const pins = trimMatrixPins(keys, s.config.rowPins, s.config.colPins)
      return {
        config: { ...s.config, keys, matrixEdges: edges, ...pins },
        selectedKeyIds: s.selectedKeyIds.filter((k) => k !== id),
        selectedKeyId: s.selectedKeyId === id ? null : s.selectedKeyId,
      }
    }),

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

  setFeatureConfig: (feature, key, value) =>
    set((s) => {
      feature = normalizeFeatureId(feature)
      const fc = { ...s.config.featureConfigs };
      fc[feature] = { ...(fc[feature] || {}), [key]: value };
      return { config: { ...s.config, featureConfigs: fc } };
    }),

  setFeatureInputValue: (featureId, inputId, value) =>
    set((s) => {
      featureId = normalizeFeatureId(featureId)
      const fiv = { ...s.config.featureInputValues };
      fiv[featureId] = { ...(fiv[featureId] || {}), [inputId]: value };
      return { config: { ...s.config, featureInputValues: fiv } };
    }),


  toggleFeature: (feature) =>
    set((s) => {
      feature = normalizeFeatureId(feature)
      const isEnabling = !s.config.features[feature];
      const newFeatures = { ...s.config.features, [feature]: isEnabling };
      const newFeatureConfigs = { ...s.config.featureConfigs };

      if (isEnabling) {
        newFeatureConfigs[feature] = featureDefaults[feature] ? { ...featureDefaults[feature] } : {};
      } else {
        delete newFeatureConfigs[feature];
      }

      return {
        config: { ...s.config, features: newFeatures, featureConfigs: newFeatureConfigs },
      };
    }),

  addLayer: () =>
    set((s) => {
      const n = s.config.layers.length
      const id = `layer_${uid()}`
      return {
        config: { ...s.config, layers: [...s.config.layers, { id, name: `Layer ${n}`, keycodes: {} }] },
        activeLayerId: id,
      }
    }),

  removeLayer: (id) =>
    set((s) => {
      if (id === 'layer0') return s
      const layers = s.config.layers.filter((l) => l.id !== id)
      const encoderKeycodes = Object.fromEntries(
        Object.entries(s.config.encoderKeycodes ?? {}).filter(([k]) => k.split(':')[0] !== id)
      )
      return {
        config: { ...s.config, layers, encoderKeycodes },
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

  addMatrixEdge: (edge) =>
    set((s) => {
      const edges = [...(s.config.matrixEdges ?? []), edge]
      const keys = deriveIndices(s.config.keys, edges)
      const pins = trimMatrixPins(keys, s.config.rowPins, s.config.colPins)
      return { config: { ...s.config, matrixEdges: edges, keys, ...pins } }
    }),

  removeMatrixEdge: (from, to, type) =>
    set((s) => {
      const edges = (s.config.matrixEdges ?? []).filter(
        (e) => !(e.type === type && ((e.from === from && e.to === to) || (e.from === to && e.to === from)))
      )
      const keys = deriveIndices(s.config.keys, edges)
      const pins = trimMatrixPins(keys, s.config.rowPins, s.config.colPins)
      return { config: { ...s.config, matrixEdges: edges, keys, ...pins } }
    }),

  setSelectedPeripheral: (id, type) =>
    set({ selectedPeripheralId: id, selectedPeripheralType: type }),

  addEncoder: () =>
    set((s) => {
      const enc: EncoderElement = { id: uid(), x: 0, y: 0, hasSwitch: false, diameter: 14 }
      const encoders = [...(s.config.encoders ?? []), enc]
      const synced = syncPeripheralFeatures({ ...s.config, encoders })
      return {
        config: { ...s.config, encoders, ...synced },
        selectedPeripheralId: enc.id,
        selectedPeripheralType: 'encoder' as PeripheralType,
        selectedKeyId: null,
        selectedKeyIds: [],
      }
    }),

  removeEncoder: (id) =>
    set((s) => {
      const encoders = (s.config.encoders ?? []).filter((e) => e.id !== id)
      const encoderKeycodes = Object.fromEntries(
        Object.entries(s.config.encoderKeycodes ?? {}).filter(([k]) => k.split(':')[1] !== id)
      )
      const synced = syncPeripheralFeatures({ ...s.config, encoders })
      return {
        config: { ...s.config, encoders, encoderKeycodes, ...synced },
        selectedPeripheralId: s.selectedPeripheralId === id ? null : s.selectedPeripheralId,
        selectedPeripheralType: s.selectedPeripheralId === id ? null : s.selectedPeripheralType,
      }
    }),

  updateEncoder: (id, updates) =>
    set((s) => ({
      config: {
        ...s.config,
        encoders: (s.config.encoders ?? []).map((e) => e.id === id ? { ...e, ...updates } : e),
      },
    })),

  addOled: () =>
    set((s) => {
      const oled: OledElement = { id: uid(), x: 0, y: 0, rotation: 0, displaySize: '128_32', contentMode: 'preset', startupBlocks: [], activeBlocks: [], idleBlocks: [], startupDuration: 15000, idleTimeout: 10000, customCode: '', customCodeTemplate: '', logoImage: '', logoBytes: [], displayRotation: 0 }
      const oleds = [...(s.config.oleds ?? []), oled]
      const synced = syncPeripheralFeatures({ ...s.config, oleds })
      return {
        config: { ...s.config, oleds, ...synced },
        selectedPeripheralId: oled.id,
        selectedPeripheralType: 'oled' as PeripheralType,
        selectedKeyId: null,
        selectedKeyIds: [],
      }
    }),

  removeOled: (id) =>
    set((s) => {
      const oleds = (s.config.oleds ?? []).filter((o) => o.id !== id)
      const synced = syncPeripheralFeatures({ ...s.config, oleds })
      return {
        config: { ...s.config, oleds, ...synced },
        selectedPeripheralId: s.selectedPeripheralId === id ? null : s.selectedPeripheralId,
        selectedPeripheralType: s.selectedPeripheralId === id ? null : s.selectedPeripheralType,
      }
    }),

  updateOled: (id, updates) =>
    set((s) => ({
      config: {
        ...s.config,
        oleds: (s.config.oleds ?? []).map((o) => o.id === id ? { ...o, ...updates } : o),
      },
    })),

  addTrackball: () =>
    set((s) => {
      const tb: TrackballElement = { id: uid(), x: 0, y: 0, diameter: 34, driver: 'pmw3360' }
      const trackballs = [...(s.config.trackballs ?? []), tb]
      const synced = syncPeripheralFeatures({ ...s.config, trackballs })
      return {
        config: { ...s.config, trackballs, ...synced },
        selectedPeripheralId: tb.id,
        selectedPeripheralType: 'trackball' as PeripheralType,
        selectedKeyId: null,
        selectedKeyIds: [],
      }
    }),

  removeTrackball: (id) =>
    set((s) => {
      const trackballs = (s.config.trackballs ?? []).filter((t) => t.id !== id)
      const synced = syncPeripheralFeatures({ ...s.config, trackballs })
      return {
        config: { ...s.config, trackballs, ...synced },
        selectedPeripheralId: s.selectedPeripheralId === id ? null : s.selectedPeripheralId,
        selectedPeripheralType: s.selectedPeripheralId === id ? null : s.selectedPeripheralType,
      }
    }),

  updateTrackball: (id, updates) =>
    set((s) => ({
      config: {
        ...s.config,
        trackballs: (s.config.trackballs ?? []).map((t) => t.id === id ? { ...t, ...updates } : t),
      },
    })),

  setCustomFiles: (files) =>
    set((s) => ({ config: { ...s.config, customFiles: files } })),

  setEncoderKeycode: (layerId, encoderId, dir, keycode) =>
    set((s) => ({
      config: {
        ...s.config,
        encoderKeycodes: {
          ...s.config.encoderKeycodes,
          [`${layerId}:${encoderId}:${dir}`]: keycode,
        },
      },
    })),

  addCombo: () =>
    set((s) => ({
      config: {
        ...s.config,
        combos: [...(s.config.combos ?? []), { id: uid(), keys: [], output: 'KC_NO' }],
      },
    })),

  removeCombo: (id) =>
    set((s) => ({
      config: {
        ...s.config,
        combos: (s.config.combos ?? []).filter((c) => c.id !== id),
      },
    })),

  updateCombo: (id, patch) =>
    set((s) => ({
      config: {
        ...s.config,
        combos: (s.config.combos ?? []).map((c) => c.id === id ? { ...c, ...patch } : c),
      },
    })),

  reset: () =>
    set(() => ({
      config: defaultConfig,
      selectedKeyId: null,
      selectedKeyIds: [],
      activeLayerId: 'layer0',
      selectedPeripheralId: null,
      selectedPeripheralType: null,
    })),
}), {
  name: 'keyboard-store',
  onRehydrateStorage: () => (state) => {
    if (!state?.config) return
    // Deep-merge defaults into each stored feature config so newly-added keys
    // are backfilled even when the feature entry already existed in storage.
    const merged: Record<string, Record<string, string>> = {}
    let changed = false
    for (const [feat, enabled] of Object.entries(state.config.features)) {
      if (!enabled) continue
      const stored = state.config.featureConfigs[feat] ?? {}
      const defaults = featureDefaults[feat] ?? {}
      const entry: Record<string, string> = { ...defaults, ...stored }
      merged[feat] = entry
      if (Object.keys(entry).length !== Object.keys(stored).length) changed = true
    }
    if (changed || Object.keys(merged).length !== Object.keys(state.config.featureConfigs).length) {
      state.config = { ...state.config, featureConfigs: merged }
    }
    // Backfill EncoderElement fields added after initial release
    if (state.config.encoders) {
      state.config.encoders = (state.config.encoders as unknown as Partial<EncoderElement>[]).map((e) => ({
        hasSwitch: false,
        diameter: 14,
        ...e,
      } as EncoderElement))
    }
    // Backfill OledElement fields, migrate contentBlocks → activeBlocks
    if (state.config.oleds) {
      state.config.oleds = (state.config.oleds as unknown as Array<Partial<OledElement> & { contentBlocks?: string[] }>).map((o) => {
        const { contentBlocks, ...rest } = o as Record<string, unknown> & { contentBlocks?: string[] }
        return {
          contentMode: 'preset' as const,
          startupBlocks: [] as string[],
          activeBlocks: (contentBlocks ?? []) as string[],
          idleBlocks: [] as string[],
          startupDuration: 15000,
          idleTimeout: 10000,
          customCode: '',
          customCodeTemplate: '',
          logoImage: '',
          logoBytes: [] as number[],
          displayRotation: 0 as const,
          ...rest,
        } as OledElement
      })
    }
    if (!state.config.encoderKeycodes) {
      state.config.encoderKeycodes = {}
    }
    state.config.encoderKeycodes = sanitizeEncoderKeycodes(
      state.config.encoderKeycodes,
      state.config.layers ?? [],
      state.config.encoders ?? [],
    )
    // Backfill TrackballElement diameter
    if (state.config.trackballs) {
      state.config.trackballs = (state.config.trackballs as unknown as Partial<TrackballElement>[]).map((t) => ({
        diameter: 34,
        ...t,
      } as TrackballElement))
    }
    state.config = normalizeKeyboardConfig(state.config)
  },
}))
