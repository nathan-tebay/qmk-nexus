import { Group, Rect, Text } from 'react-konva'
import type Konva from 'konva'
import type { KeyDef } from '@/store/keyboard'
import {
  UNIT, GAP, KEY_FILL, KEY_STROKE, KEY_SELECTED_STROKE,
  KEY_RADIUS, LABEL_COLOR, MATRIX_LABEL_COLOR,
} from './constants'

interface Props {
  keyDef: KeyDef
  selected: boolean
  showMatrix: boolean
  onSelect: (id: string) => void
  onChange: (id: string, updates: Partial<KeyDef>) => void
}

export default function KeyShape({ keyDef, selected, showMatrix, onSelect, onChange }: Props) {
  const w = keyDef.w * UNIT - GAP
  const h = keyDef.h * UNIT - GAP

  function handleDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    const node = e.target
    if (keyDef.rotation !== 0) {
      onChange(keyDef.id, { x: node.x() / UNIT, y: node.y() / UNIT })
      return
    }
    const snappedX = Math.round(node.x() / UNIT) * UNIT
    const snappedY = Math.round(node.y() / UNIT) * UNIT
    node.position({ x: snappedX, y: snappedY })
    onChange(keyDef.id, { x: snappedX / UNIT, y: snappedY / UNIT })
  }

  const matrixLabel =
    keyDef.row !== null && keyDef.col !== null
      ? `R${keyDef.row}C${keyDef.col}`
      : showMatrix ? '?' : ''

  return (
    <Group
      id={keyDef.id}
      x={keyDef.x * UNIT}
      y={keyDef.y * UNIT}
      rotation={keyDef.rotation}
      draggable
      onClick={() => onSelect(keyDef.id)}
      onTap={() => onSelect(keyDef.id)}
      onDragEnd={handleDragEnd}
    >
      <Rect
        width={w}
        height={h}
        fill={KEY_FILL}
        stroke={selected ? KEY_SELECTED_STROKE : KEY_STROKE}
        strokeWidth={selected ? 2 : 1}
        cornerRadius={KEY_RADIUS}
        shadowColor={selected ? KEY_SELECTED_STROKE : undefined}
        shadowBlur={selected ? 8 : 0}
        shadowOpacity={0.4}
      />
      {/* top face */}
      <Rect
        x={3}
        y={3}
        width={w - 6}
        height={h - 8}
        fill='#333'
        cornerRadius={KEY_RADIUS - 2}
      />
      {/* key label */}
      <Text
        x={6}
        y={8}
        width={w - 12}
        height={h - 16}
        text={keyDef.label}
        fontSize={12}
        fill={LABEL_COLOR}
        align='left'
        verticalAlign='top'
        listening={false}
      />
      {/* matrix label */}
      {matrixLabel && (
        <Text
          x={6}
          y={h - 18}
          width={w - 12}
          text={matrixLabel}
          fontSize={9}
          fill={MATRIX_LABEL_COLOR}
          align='right'
          listening={false}
        />
      )}
    </Group>
  )
}
