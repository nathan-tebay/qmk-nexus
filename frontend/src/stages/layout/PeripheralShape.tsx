import { Group, Circle, Rect, Text, Line } from 'react-konva'
import type Konva from 'konva'
import { UNIT } from './constants'
import type { EncoderElement, OledElement, TrackballElement } from '@/store/keyboard'

const SNAP = 0.25

function snap(v: number) {
  return Math.round(v / SNAP) * SNAP
}

// Encoder: 2u × 2u circle
const ENC_R = UNIT

interface EncoderShapeProps {
  el: EncoderElement
  selected: boolean
  onSelect: (id: string) => void
  onChange: (id: string, updates: Partial<EncoderElement>) => void
}

export function EncoderShape({ el, selected, onSelect, onChange }: EncoderShapeProps) {
  function handleDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    const x = snap(e.target.x() / UNIT)
    const y = snap(e.target.y() / UNIT)
    e.target.position({ x: x * UNIT, y: y * UNIT })
    onChange(el.id, { x, y })
  }

  const accent = '#4fc3f7'

  return (
    <Group
      x={el.x * UNIT}
      y={el.y * UNIT}
      draggable
      onClick={(e) => { e.cancelBubble = true; onSelect(el.id) }}
      onDragEnd={handleDragEnd}
    >
      <Circle
        x={ENC_R} y={ENC_R} radius={ENC_R}
        fill={selected ? 'rgba(79,195,247,0.18)' : 'rgba(255,255,255,0.05)'}
        stroke={selected ? accent : 'rgba(255,255,255,0.22)'}
        strokeWidth={selected ? 2 : 1.5}
      />
      {/* inner ring */}
      <Circle
        x={ENC_R} y={ENC_R} radius={ENC_R * 0.45}
        fill={selected ? 'rgba(79,195,247,0.12)' : 'rgba(255,255,255,0.06)'}
        stroke={selected ? accent : 'rgba(255,255,255,0.15)'}
        strokeWidth={1}
      />
      {/* notch */}
      <Line
        points={[ENC_R, ENC_R * 0.25, ENC_R, ENC_R * 0.62]}
        stroke={selected ? accent : '#888'}
        strokeWidth={2}
        lineCap="round"
      />
      <Text
        text="ENC"
        x={0} y={ENC_R * 1.35}
        width={ENC_R * 2}
        align="center"
        fontSize={9}
        fill={selected ? accent : '#666'}
        fontStyle="bold"
      />
    </Group>
  )
}

// OLED: variable width based on displaySize, fixed 1.5u tall
const OLED_SIZES: Record<OledElement['displaySize'], { w: number; h: number }> = {
  '128_64': { w: 2.5, h: 1.5 },
  '128_32': { w: 2.5, h: 1.0 },
  '64_48':  { w: 1.5, h: 1.2 },
  '64_32':  { w: 1.5, h: 1.0 },
}

interface OledShapeProps {
  el: OledElement
  selected: boolean
  onSelect: (id: string) => void
  onChange: (id: string, updates: Partial<OledElement>) => void
}

export function OledShape({ el, selected, onSelect, onChange }: OledShapeProps) {
  const { w, h } = OLED_SIZES[el.displaySize] ?? OLED_SIZES['128_32']
  const pw = w * UNIT
  const ph = h * UNIT
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
        x={6} y={5}
        width={pw - 12} height={ph - 16}
        fill={selected ? 'rgba(102,187,106,0.2)' : 'rgba(0,0,0,0.5)'}
        cornerRadius={2}
      />
      <Text
        text="OLED"
        x={0} y={ph - 13}
        width={pw}
        align="center"
        fontSize={9}
        fill={selected ? accent : '#666'}
        fontStyle="bold"
      />
    </Group>
  )
}

// Trackball: 2u × 2u with ball
const TB_R = UNIT

interface TrackballShapeProps {
  el: TrackballElement
  selected: boolean
  onSelect: (id: string) => void
  onChange: (id: string, updates: Partial<TrackballElement>) => void
}

export function TrackballShape({ el, selected, onSelect, onChange }: TrackballShapeProps) {
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
        x={TB_R} y={TB_R} radius={TB_R}
        fill={selected ? 'rgba(171,71,188,0.12)' : 'rgba(255,255,255,0.05)'}
        stroke={selected ? accent : 'rgba(255,255,255,0.22)'}
        strokeWidth={selected ? 2 : 1.5}
      />
      {/* ball */}
      <Circle
        x={TB_R} y={TB_R} radius={TB_R * 0.55}
        fill={selected ? 'rgba(171,71,188,0.4)' : 'rgba(255,255,255,0.12)'}
        stroke={selected ? accent : 'rgba(255,255,255,0.1)'}
        strokeWidth={1}
      />
      <Text
        text="TB"
        x={0} y={TB_R * 1.35}
        width={TB_R * 2}
        align="center"
        fontSize={9}
        fill={selected ? accent : '#666'}
        fontStyle="bold"
      />
    </Group>
  )
}
