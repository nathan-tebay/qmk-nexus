import { Group, Circle, Rect, Text, Line } from 'react-konva'
import type Konva from 'konva'
import { UNIT } from './constants'
import type { EncoderElement, OledElement, TrackballElement } from '@/store/keyboard'
import { encoderRadiusPx, trackballRadiusPx, oledSizePx } from '../peripheralSizes'

const SNAP = 0.25

function snap(v: number) {
  return Math.round(v / SNAP) * SNAP
}

interface EncoderShapeProps {
  el: EncoderElement
  selected: boolean
  onSelect: (id: string) => void
  onChange: (id: string, updates: Partial<EncoderElement>) => void
}

export function EncoderShape({ el, selected, onSelect, onChange }: EncoderShapeProps) {
  const r = encoderRadiusPx(el.diameter)

  function handleDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    const x = snap(e.target.x() / UNIT)
    const y = snap(e.target.y() / UNIT)
    e.target.position({ x: x * UNIT, y: y * UNIT })
    onChange(el.id, { x, y })
  }

  const accent = '#d18a00'

  return (
    <Group
      x={el.x * UNIT}
      y={el.y * UNIT}
      draggable
      onClick={(e) => { e.cancelBubble = true; onSelect(el.id) }}
      onDragEnd={handleDragEnd}
    >
      <Circle
        x={r} y={r} radius={r}
        fill={selected ? 'rgba(209,138,0,0.18)' : 'rgba(255,255,255,0.05)'}
        stroke={selected ? accent : 'rgba(255,255,255,0.22)'}
        strokeWidth={selected ? 2 : 1.5}
      />
      {/* inner ring */}
      <Circle
        x={r} y={r} radius={r * 0.45}
        fill={selected ? 'rgba(209,138,0,0.12)' : 'rgba(255,255,255,0.06)'}
        stroke={selected ? accent : 'rgba(255,255,255,0.15)'}
        strokeWidth={1}
      />
      {/* notch */}
      <Line
        points={[r, r * 0.25, r, r * 0.62]}
        stroke={selected ? accent : '#888'}
        strokeWidth={2}
        lineCap="round"
      />
      <Text
        text="ENC"
        x={0} y={r * 1.35}
        width={r * 2}
        align="center"
        fontSize={11.25}
        fill={selected ? accent : '#666'}
        fontStyle="bold"
      />
    </Group>
  )
}

interface OledShapeProps {
  el: OledElement
  selected: boolean
  onSelect: (id: string) => void
  onChange: (id: string, updates: Partial<OledElement>) => void
}

export function OledShape({ el, selected, onSelect, onChange }: OledShapeProps) {
  const { w: pw, h: ph } = oledSizePx(el.displaySize)
  const accent = '#66bb6a'

  function handleDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    if (el.rotation !== 0) {
      onChange(el.id, { x: e.target.x() / UNIT, y: e.target.y() / UNIT })
      return
    }
    const x = snap(e.target.x() / UNIT)
    const y = snap(e.target.y() / UNIT)
    e.target.position({ x: x * UNIT, y: y * UNIT })
    onChange(el.id, { x, y })
  }

  return (
    <Group
      x={el.x * UNIT}
      y={el.y * UNIT}
      rotation={el.rotation}
      draggable
      onClick={(e) => { e.cancelBubble = true; onSelect(el.id) }}
      onDragEnd={handleDragEnd}
    >
      {/* bezel */}
      <Rect
        width={pw} height={ph}
        fill={selected ? 'rgba(102,187,106,0.12)' : 'rgba(255,255,255,0.04)'}
        stroke={selected ? accent : 'rgba(255,255,255,0.22)'}
        strokeWidth={selected ? 2 : 1.5}
        cornerRadius={4}
      />
      {/* screen */}
      <Rect
        x={4} y={3}
        width={pw - 8} height={ph - 12}
        fill={selected ? 'rgba(102,187,106,0.2)' : 'rgba(0,0,0,0.5)'}
        cornerRadius={2}
      />
      <Text
        text="OLED"
        x={0} y={ph - 11}
        width={pw}
        align="center"
        fontSize={10}
        fill={selected ? accent : '#666'}
        fontStyle="bold"
      />
    </Group>
  )
}

interface TrackballShapeProps {
  el: TrackballElement
  selected: boolean
  onSelect: (id: string) => void
  onChange: (id: string, updates: Partial<TrackballElement>) => void
}

export function TrackballShape({ el, selected, onSelect, onChange }: TrackballShapeProps) {
  const r = trackballRadiusPx(el.diameter)
  const accent = '#ab47bc'

  function handleDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    const x = snap(e.target.x() / UNIT)
    const y = snap(e.target.y() / UNIT)
    e.target.position({ x: x * UNIT, y: y * UNIT })
    onChange(el.id, { x, y })
  }

  return (
    <Group
      x={el.x * UNIT}
      y={el.y * UNIT}
      draggable
      onClick={(e) => { e.cancelBubble = true; onSelect(el.id) }}
      onDragEnd={handleDragEnd}
    >
      {/* housing ring */}
      <Circle
        x={r} y={r} radius={r}
        fill={selected ? 'rgba(171,71,188,0.12)' : 'rgba(255,255,255,0.05)'}
        stroke={selected ? accent : 'rgba(255,255,255,0.22)'}
        strokeWidth={selected ? 2 : 1.5}
      />
      {/* ball */}
      <Circle
        x={r} y={r} radius={r * 0.55}
        fill={selected ? 'rgba(171,71,188,0.4)' : 'rgba(255,255,255,0.12)'}
        stroke={selected ? accent : 'rgba(255,255,255,0.1)'}
        strokeWidth={1}
      />
      <Text
        text="TB"
        x={0} y={r * 1.35}
        width={r * 2}
        align="center"
        fontSize={11.25}
        fill={selected ? accent : '#666'}
        fontStyle="bold"
      />
    </Group>
  )
}
