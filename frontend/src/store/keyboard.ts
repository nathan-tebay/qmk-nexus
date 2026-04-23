import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
  matrixEdges: MatrixEdge[]
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
  matrixEdges: [],
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
  selectedKeyIds: string[]
  activeLayerId: string
  setConfig: (config: Partial<KeyboardConfig>) => void
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
}

export const useKeyboardStore = create<KeyboardStore>()(persist((set) => ({
  config: defaultConfig,
  selectedKeyId: null,
  selectedKeyIds: [],
  activeLayerId: 'layer0',

  setConfig: (updates) =>
    set((s) => ({ config: { ...s.config, ...updates } })),

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
    set((s) => ({
      config: {
        ...s.config,
        keys: s.config.keys.map((k) => (k.id === id ? { ...k, ...updates } : k)),
      },
    })),

  removeKey: (id) =>
    set((s) => {
      const edges = (s.config.matrixEdges ?? []).filter((e) => e.from !== id && e.to !== id)
      const keys = deriveIndices(s.config.keys.filter((k) => k.id !== id), edges)
      return {
        config: { ...s.config, keys, matrixEdges: edges },
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

  addMatrixEdge: (edge) =>
    set((s) => {
      const edges = [...(s.config.matrixEdges ?? []), edge]
      return { config: { ...s.config, matrixEdges: edges, keys: deriveIndices(s.config.keys, edges) } }
    }),

  removeMatrixEdge: (from, to, type) =>
    set((s) => {
      const edges = (s.config.matrixEdges ?? []).filter(
        (e) => !(e.type === type && ((e.from === from && e.to === to) || (e.from === to && e.to === from)))
      )
      return { config: { ...s.config, matrixEdges: edges, keys: deriveIndices(s.config.keys, edges) } }
    }),
}), { name: 'keyboard-store' }))
