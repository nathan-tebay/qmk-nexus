import { Line, Circle } from 'react-konva'
import type { KeyDef } from '@/store/keyboard'
import { UNIT, GAP } from './constants'

interface Props {
  keys: KeyDef[]
  pendingId?: string | null
}

function keyCenter(k: KeyDef) {
  const w = k.w * UNIT - GAP
  const h = k.h * UNIT - GAP
  return { x: k.x * UNIT + w / 2, y: k.y * UNIT + h / 2 }
}

export default function MatrixLines({ keys, pendingId }: Props) {
  const byRow = new Map<number, KeyDef[]>()
  const byCol = new Map<number, KeyDef[]>()

  for (const k of keys) {
    if (k.row !== null) {
      const arr = byRow.get(k.row) ?? []
      arr.push(k)
      byRow.set(k.row, arr)
    }
    if (k.col !== null) {
      const arr = byCol.get(k.col) ?? []
      arr.push(k)
      byCol.set(k.col, arr)
    }
  }

  const ledKeys = keys
    .filter((k) => k.ledIndex !== null)
    .sort((a, b) => a.ledIndex! - b.ledIndex!)

  const pending = pendingId ? keys.find((k) => k.id === pendingId) : null
  const pendingCenter = pending ? keyCenter(pending) : null

  return (
    <>
      {/* Row lines (red) */}
      {Array.from(byRow.entries()).map(([row, rowKeys]) => {
        const sorted = [...rowKeys].sort((a, b) => a.x - b.x)
        if (sorted.length < 2) return null
        const points = sorted.flatMap((k) => { const c = keyCenter(k); return [c.x, c.y] })
        return <Line key={`row-${row}`} points={points} stroke="#ef4444" strokeWidth={2} opacity={0.75} />
      })}

      {/* Col lines (green) */}
      {Array.from(byCol.entries()).map(([col, colKeys]) => {
        const sorted = [...colKeys].sort((a, b) => a.y - b.y)
        if (sorted.length < 2) return null
        const points = sorted.flatMap((k) => { const c = keyCenter(k); return [c.x, c.y] })
        return <Line key={`col-${col}`} points={points} stroke="#22c55e" strokeWidth={2} opacity={0.75} />
      })}

      {/* LED path (blue) */}
      {ledKeys.length >= 2 && (
        <Line
          points={ledKeys.flatMap((k) => { const c = keyCenter(k); return [c.x, c.y] })}
          stroke="#3b82f6"
          strokeWidth={2}
          opacity={0.75}
        />
      )}

      {/* Pending connection indicator */}
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
