import { Line, Circle } from 'react-konva'
import type { KeyDef, MatrixEdge } from '@/store/keyboard'
import { UNIT, GAP } from './constants'

export type ColorScheme = 'default' | 'deuteranopia' | 'protanopia' | 'tritanopia' | 'highContrast'

export const COLOR_SCHEME_LABELS: Record<ColorScheme, string> = {
  default: 'Default',
  deuteranopia: 'Deuteranopia',
  protanopia: 'Protanopia',
  tritanopia: 'Tritanopia',
  highContrast: 'High Contrast',
}

export const SCHEME_COLORS: Record<ColorScheme, Record<MatrixEdge['type'], string>> = {
  default:      { row: '#ef4444', col: '#22c55e', led: '#3b82f6' },
  deuteranopia: { row: '#d55e00', col: '#0173b2', led: '#cc78bc' },
  protanopia:   { row: '#0173b2', col: '#de8f05', led: '#cc78bc' },
  tritanopia:   { row: '#ee7733', col: '#0077bb', led: '#009988' },
  highContrast: { row: '#ffff00', col: '#00ffff', led: '#ff00ff' },
}

interface Props {
  keys: KeyDef[]
  edges: MatrixEdge[]
  pendingId?: string | null
  colorScheme?: ColorScheme
}

function keyCenter(k: KeyDef) {
  const w = k.w * UNIT - GAP
  const h = k.h * UNIT - GAP
  return { x: k.x * UNIT + w / 2, y: k.y * UNIT + h / 2 }
}

// Perpendicular offset keeps row/col lines visually distinct when they share key centers
const OFFSETS: Record<MatrixEdge['type'], { x: number; y: number }> = {
  row: { x: 0, y: -4 },
  col: { x: 4, y: 0 },
  led: { x: 0, y: 4 },
}

export default function MatrixLines({ keys, edges, pendingId, colorScheme = 'default' }: Props) {
  const colors = SCHEME_COLORS[colorScheme]
  const keyMap = new Map(keys.map((k) => [k.id, k]))
  const pending = pendingId ? keyMap.get(pendingId) : undefined
  const pendingCenter = pending ? keyCenter(pending) : null

  return (
    <>
      {edges.map((edge, i) => {
        const from = keyMap.get(edge.from)
        const to = keyMap.get(edge.to)
        if (!from || !to) return null
        const fc = keyCenter(from)
        const tc = keyCenter(to)
        const off = OFFSETS[edge.type]
        return (
          <Line
            key={`edge-${i}`}
            points={[fc.x + off.x, fc.y + off.y, tc.x + off.x, tc.y + off.y]}
            stroke={colors[edge.type]}
            strokeWidth={2}
            opacity={0.9}
          />
        )
      })}

      {pendingCenter && (
        <Circle
          x={pendingCenter.x}
          y={pendingCenter.y}
          radius={10}
          stroke="#f59e0b"
          strokeWidth={2}
          dash={[4, 4]}
        />
      )}
    </>
  )
}
