import { Group, Rect, Text, Shape } from 'react-konva'
import type Konva from 'konva'
import type { Context } from 'konva/lib/Context'
import type { KeyDef } from '@/store/keyboard'
import {
  UNIT, GAP, KEY_FILL, KEY_STROKE, KEY_SELECTED_STROKE,
  KEY_RADIUS, LABEL_COLOR,
} from './constants'
import { parseAssignedCode } from '@/utils/parseCode'

interface Props {
  keyDef: KeyDef
  selected: boolean
  showMatrix: boolean
  keycodeLabel?: string
  snapGrid?: boolean
  onSelect: (id: string, shiftKey: boolean) => void
  onChange: (id: string, updates: Partial<KeyDef>) => void
  onMatrixClick?: (id: string, mods: { shift: boolean; ctrl: boolean; alt: boolean }) => void
}

const SNAP_UNIT = UNIT * 0.25

function isoEnterPath(ctx: Context, w: number, h: number) {
  const notch = UNIT * 0.25
  const mid = UNIT
  ctx.beginPath()
  ctx.moveTo(notch, 0)
  ctx.lineTo(w, 0)
  ctx.lineTo(w, h)
  ctx.lineTo(0, h)
  ctx.lineTo(0, mid)
  ctx.lineTo(notch, mid)
  ctx.closePath()
}

function steppedCapsPath(ctx: Context, w: number, h: number) {
  const stepX = UNIT * 1.25 - GAP / 2
  const stepDepth = 6
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(w, 0)
  ctx.lineTo(w, h)
  ctx.lineTo(stepX, h)
  ctx.lineTo(stepX, h - stepDepth)
  ctx.lineTo(0, h - stepDepth)
  ctx.closePath()
}

export default function KeyShape({
  keyDef, selected, showMatrix, keycodeLabel, snapGrid,
  onSelect, onChange, onMatrixClick,
}: Props) {
  const w = keyDef.w * UNIT - GAP
  const h = keyDef.h * UNIT - GAP
  const isRect = keyDef.shape === 'rect' || !keyDef.shape

  function handleDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    const node = e.target
    if (keyDef.rotation !== 0) {
      onChange(keyDef.id, { x: node.x() / UNIT, y: node.y() / UNIT })
      return
    }
    const snap = snapGrid ? SNAP_UNIT : UNIT
    const snappedX = Math.round(node.x() / snap) * snap
    const snappedY = Math.round(node.y() / snap) * snap
    node.position({ x: snappedX, y: snappedY })
    onChange(keyDef.id, { x: snappedX / UNIT, y: snappedY / UNIT })
  }

  function handleClick(e: Konva.KonvaEventObject<MouseEvent>) {
    if (showMatrix && onMatrixClick) {
      onMatrixClick(keyDef.id, {
        shift: e.evt.shiftKey,
        ctrl: e.evt.ctrlKey,
        alt: e.evt.altKey,
      })
      return
    }
    onSelect(keyDef.id, e.evt.shiftKey)
  }

  const fill = KEY_FILL
  const stroke = selected ? KEY_SELECTED_STROKE : KEY_STROKE
  const strokeWidth = selected ? 2 : 1
  const shadow = selected ? { shadowColor: KEY_SELECTED_STROKE, shadowBlur: 8, shadowOpacity: 0.4 } : {}

  const labelText = showMatrix ? '' : (keycodeLabel ?? '')

  return (
    <Group
      id={keyDef.id}
      x={keyDef.x * UNIT}
      y={keyDef.y * UNIT}
      width={w}
      height={h}
      rotation={keyDef.rotation}
      draggable={!showMatrix}
      onClick={handleClick}
      onTap={handleClick}
      onDragEnd={handleDragEnd}
    >
      {isRect ? (
        <>
          <Rect
            width={w} height={h}
            fill={fill} stroke={stroke} strokeWidth={strokeWidth}
            cornerRadius={KEY_RADIUS}
            {...shadow}
          />
          <Rect x={3} y={3} width={w - 6} height={h - 8} fill="#333" cornerRadius={KEY_RADIUS - 2} />
        </>
      ) : keyDef.shape === 'iso-enter' ? (
        <>
          <Shape
            sceneFunc={(ctx, shape) => { isoEnterPath(ctx, w, h); ctx.fillStrokeShape(shape) }}
            fill={fill} stroke={stroke} strokeWidth={strokeWidth}
            {...shadow}
          />
          <Shape
            sceneFunc={(ctx, shape) => {
              const notch = UNIT * 0.25
              const mid = UNIT
              const inset = 3
              ctx.beginPath()
              ctx.moveTo(notch + inset, inset)
              ctx.lineTo(w - inset, inset)
              ctx.lineTo(w - inset, h - inset)
              ctx.lineTo(inset, h - inset)
              ctx.lineTo(inset, mid + inset)
              ctx.lineTo(notch + inset, mid + inset)
              ctx.closePath()
              ctx.fillStrokeShape(shape)
            }}
            fill="#333"
          />
        </>
      ) : keyDef.shape === 'stepped-caps' ? (
        <>
          <Shape
            sceneFunc={(ctx, shape) => { steppedCapsPath(ctx, w, h); ctx.fillStrokeShape(shape) }}
            fill={fill} stroke={stroke} strokeWidth={strokeWidth}
            {...shadow}
          />
          <Rect x={3} y={3} width={w - 6} height={h - 8} fill="#333" cornerRadius={KEY_RADIUS - 2} />
        </>
      ) : (
        /* iso-shift and fallback: rect */
        <>
          <Rect
            width={w} height={h}
            fill={fill} stroke={stroke} strokeWidth={strokeWidth}
            cornerRadius={KEY_RADIUS}
            {...shadow}
          />
          <Rect x={3} y={3} width={w - 6} height={h - 8} fill="#333" cornerRadius={KEY_RADIUS - 2} />
        </>
      )}

      {/* Keycode label — hidden in matrix mode, rendered in keymap format */}
      {!showMatrix && labelText && (() => {
        const { tap, hold } = parseAssignedCode(labelText)
        return hold ? (
          <>
            <Text x={4} y={4} width={w - 8} text={hold} fontSize={9} fill="#888" align="center" listening={false} />
            <Text x={4} y={0} width={w - 8} height={h} text={tap} fontSize={13} fill={LABEL_COLOR} align="center" verticalAlign="middle" listening={false} />
          </>
        ) : (
          <Text x={4} y={0} width={w - 8} height={h} text={tap} fontSize={13} fill={LABEL_COLOR} align="center" verticalAlign="middle" listening={false} />
        )
      })()}
    </Group>
  )
}
