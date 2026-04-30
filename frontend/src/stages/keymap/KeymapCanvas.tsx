import { useRef, useEffect } from 'react'
import { Stage, Layer, Group, Rect, Text, Shape, Circle } from 'react-konva'
import type Konva from 'konva'
import type { Context } from 'konva/lib/Context'
import { useKeyboardStore } from '@/store/keyboard'
import { parseAssignedCode } from '@/utils/parseCode'
import { UNIT, GAP, CANVAS_BG, KEY_FILL, KEY_STROKE, KEY_SELECTED_STROKE, KEY_RADIUS, LABEL_COLOR } from '../layout/constants'

import { encoderRadiusPx, trackballRadiusPx, oledSizePx } from '../peripheralSizes'

interface Props {
  width: number
  height: number
  onKeyClick: (keyId: string) => void
  onEncoderClick: (encoderId: string) => void
  onOledClick: (oledId: string) => void
  onTooltip?: (code: string, x: number, y: number) => void
  onTooltipHide?: () => void
}

function isoEnterPath(ctx: Context, w: number, h: number) {
  const notch = UNIT * 0.25
  const mid = h - UNIT
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(w, 0)
  ctx.lineTo(w, h)
  ctx.lineTo(notch, h)
  ctx.lineTo(notch, mid)
  ctx.lineTo(0, mid)
  ctx.closePath()
}

const ZOOM_FACTOR = 1.15
const MIN_SCALE = 0.2
const MAX_SCALE = 4

export default function KeymapCanvas({ width, height, onKeyClick, onEncoderClick, onOledClick, onTooltip, onTooltipHide }: Props) {
  const stageRef = useRef<Konva.Stage>(null)
  const { config, selectedKeyId, activeLayerId, setSelectedKey } = useKeyboardStore()

  const activeLayer = config.layers.find((l) => l.id === activeLayerId)

  function handleWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return
    const oldScale = stage.scaleX()
    const pointer = stage.getPointerPosition()
    if (!pointer) return
    const direction = e.evt.deltaY < 0 ? 1 : -1
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, oldScale * (direction > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR)))
    const mousePointTo = { x: (pointer.x - stage.x()) / oldScale, y: (pointer.y - stage.y()) / oldScale }
    stage.scale({ x: newScale, y: newScale })
    stage.position({ x: pointer.x - mousePointTo.x * newScale, y: pointer.y - mousePointTo.y * newScale })
  }

  function handleStageClick(e: Konva.KonvaEventObject<MouseEvent>) {
    if (e.target === e.currentTarget) setSelectedKey(null)
  }

  function handleKeyClick(keyId: string) {
    setSelectedKey(keyId)
    onKeyClick(keyId)
  }

  useEffect(() => {
    const stage = stageRef.current
    if (!stage || config.keys.length === 0) return
    const maxX = Math.max(...config.keys.map((k) => (k.x + k.w) * UNIT))
    const maxY = Math.max(...config.keys.map((k) => (k.y + k.h) * UNIT))
    const padding = 60
    const scale = Math.min((width - padding * 2) / maxX, (height - padding * 2) / maxY, MAX_SCALE)
    stage.scale({ x: scale, y: scale })
    stage.position({ x: padding, y: padding })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Stage
      ref={stageRef}
      width={width}
      height={height}
      style={{ background: CANVAS_BG }}
      draggable
      onWheel={handleWheel}
      onClick={handleStageClick}
    >
      <Layer>
        {config.keys.map((key) => {
          const w = key.w * UNIT - GAP
          const h = key.h * UNIT - GAP
          const assignedCode = activeLayer?.keycodes[key.id] ?? 'KC_TRNS'
          const { tap, hold } = parseAssignedCode(assignedCode)
          const isCleared = assignedCode === 'KC_NO' || assignedCode === 'XXXXXXX'
          const isSelected = key.id === selectedKeyId
          const isRect = key.shape === 'rect' || !key.shape
          const stroke = isSelected ? KEY_SELECTED_STROKE : KEY_STROKE
          const strokeWidth = isSelected ? 2 : 1
          const shadow = isSelected ? { shadowColor: KEY_SELECTED_STROKE, shadowBlur: 8, shadowOpacity: 0.4 } : {}

          return (
            <Group
              key={key.id}
              x={key.x * UNIT}
              y={key.y * UNIT}
              rotation={key.rotation}
              onClick={() => handleKeyClick(key.id)}
              onTap={() => handleKeyClick(key.id)}
              onMouseEnter={(e) => {
                if (!onTooltip) return
                const stage = e.target.getStage()
                const pos = stage?.getPointerPosition()
                if (pos) onTooltip(assignedCode, pos.x, pos.y)
              }}
              onMouseLeave={() => onTooltipHide?.()}
            >
              {isRect ? (
                <>
                  <Rect width={w} height={h} fill={KEY_FILL} stroke={stroke} strokeWidth={strokeWidth} cornerRadius={KEY_RADIUS} {...shadow} />
                  <Rect x={3} y={3} width={w - 6} height={h - 8} fill="#333" cornerRadius={KEY_RADIUS - 2} />
                </>
              ) : key.shape === 'iso-enter' ? (
                <>
                  <Shape sceneFunc={(ctx, s) => { isoEnterPath(ctx, w, h); ctx.fillStrokeShape(s) }} fill={KEY_FILL} stroke={stroke} strokeWidth={strokeWidth} {...shadow} />
                  <Shape sceneFunc={(ctx, s) => {
                    const notch = UNIT * 0.25, mid = h - UNIT, inset = 3
                    ctx.beginPath()
                    ctx.moveTo(inset, inset); ctx.lineTo(w - inset, inset); ctx.lineTo(w - inset, h - inset)
                    ctx.lineTo(notch + inset, h - inset); ctx.lineTo(notch + inset, mid - inset); ctx.lineTo(inset, mid - inset)
                    ctx.closePath(); ctx.fillStrokeShape(s)
                  }} fill="#333" />
                </>
              ) : (
                <>
                  <Rect width={w} height={h} fill={KEY_FILL} stroke={stroke} strokeWidth={strokeWidth} cornerRadius={KEY_RADIUS} {...shadow} />
                  <Rect x={3} y={3} width={w - 6} height={h - 8} fill="#333" cornerRadius={KEY_RADIUS - 2} />
                </>
              )}

              {hold ? (
                <>
                  <Text x={4} y={4} width={w - 8} text={hold} fontSize={11.25} fill="#888" align="center" listening={false} />
                  <Text x={4} y={0} width={w - 8} height={h} text={tap} fontSize={16.25} fill={isCleared ? '#444' : LABEL_COLOR} align="center" verticalAlign="middle" listening={false} />
                </>
              ) : (
                <Text x={4} y={0} width={w - 8} height={h} text={tap} fontSize={16.25} fill={isCleared ? '#444' : LABEL_COLOR} align="center" verticalAlign="middle" listening={false} />
              )}
            </Group>
          )
        })}
      </Layer>

      {/* Encoders + OLEDs */}
      <Layer>
        {(config.encoders ?? []).map((enc, encIdx) => {
          const r = encoderRadiusPx(enc.diameter)
          const cwCode = config.encoderKeycodes?.[`${activeLayerId}:${enc.id}:cw`] ?? ''
          const cwLabel = cwCode ? cwCode.replace(/^KC_/, '').slice(0, 6) : '—'
          return (
            <Group
              key={enc.id}
              x={enc.x * UNIT}
              y={enc.y * UNIT}
              onClick={() => onEncoderClick(enc.id)}
              onTap={() => onEncoderClick(enc.id)}
              style={{ cursor: 'pointer' }}
            >
              <Circle radius={r} fill="#1a2a1a" stroke="#3a7a3a" strokeWidth={2} />
              <Circle radius={r * 0.45} fill="#112211" stroke="#2a5a2a" strokeWidth={1} />
              {enc.hasSwitch && <Circle radius={r * 0.15} fill="#3a7a3a" />}
              <Text text={`E${encIdx}`} width={r * 2} x={-r} y={-r * 0.6} align="center" fontSize={11.25} fill="#6dbf6d" listening={false} />
              <Text text={cwLabel} width={r * 2} x={-r} y={-r * 0.1} align="center" fontSize={10} fill={cwCode ? LABEL_COLOR : '#444'} listening={false} />
            </Group>
          )
        })}

        {(config.trackballs ?? []).map((tb, tbIdx) => {
          const r = trackballRadiusPx(tb.diameter)
          return (
            <Group key={tb.id} x={tb.x * UNIT} y={tb.y * UNIT}>
              <Circle radius={r} fill="#1a1a2e" stroke="#4a4a8a" strokeWidth={2} />
              <Circle radius={r * 0.55} fill="#2a2a4a" stroke="#5a5a9a" strokeWidth={1} />
              <Text text={`TB${tbIdx}`} width={r * 2} x={-r} y={-r * 0.25} align="center" fontSize={11.25} fill="#9a9adf" listening={false} />
            </Group>
          )
        })}

        {(config.oleds ?? []).map((oled, oledIdx) => {
          const size = oledSizePx(oled.displaySize)
          const blockCount = oled.startupBlocks.length + oled.activeBlocks.length + oled.idleBlocks.length
          const sublabel = oled.contentMode === 'custom' ? 'custom' : blockCount > 0 ? `${blockCount} block${blockCount !== 1 ? 's' : ''}` : 'empty'
          return (
            <Group
              key={oled.id}
              x={oled.x * UNIT}
              y={oled.y * UNIT}
              rotation={oled.rotation}
              onClick={() => onOledClick(oled.id)}
              onTap={() => onOledClick(oled.id)}
              style={{ cursor: 'pointer' }}
            >
              <Rect width={size.w} height={size.h} fill="#0d0d0d" stroke="#555" strokeWidth={1} cornerRadius={3} />
              <Text text={`OLED ${oledIdx}`} x={4} y={3} fontSize={10} fill="#aaa" listening={false} />
              <Text text={sublabel} x={4} y={size.h - 11} fontSize={8.75} fill="#666" listening={false} />
            </Group>
          )
        })}
      </Layer>
    </Stage>
  )
}
