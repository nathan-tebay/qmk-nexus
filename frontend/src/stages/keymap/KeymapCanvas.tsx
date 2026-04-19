import { useRef, useEffect } from 'react'
import { Stage, Layer, Group, Rect, Text, Shape } from 'react-konva'
import type Konva from 'konva'
import type { Context } from 'konva/lib/Context'
import { useKeyboardStore } from '@/store/keyboard'
import { parseAssignedCode } from '@/utils/parseCode'
import { UNIT, GAP, CANVAS_BG, KEY_FILL, KEY_STROKE, KEY_SELECTED_STROKE, KEY_RADIUS, LABEL_COLOR } from '../layout/constants'

interface Props {
  width: number
  height: number
  onKeyClick: (keyId: string) => void
  onTooltip?: (code: string, x: number, y: number) => void
  onTooltipHide?: () => void
}

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

const ZOOM_FACTOR = 1.15
const MIN_SCALE = 0.2
const MAX_SCALE = 4

export default function KeymapCanvas({ width, height, onKeyClick, onTooltip, onTooltipHide }: Props) {
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
          const assignedCode = activeLayer?.keycodes[key.id] ?? ''
          const { tap, hold } = parseAssignedCode(assignedCode)
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
                if (!assignedCode || !onTooltip) return
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
                    const notch = UNIT * 0.25, mid = UNIT, inset = 3
                    ctx.beginPath()
                    ctx.moveTo(notch + inset, inset); ctx.lineTo(w - inset, inset); ctx.lineTo(w - inset, h - inset)
                    ctx.lineTo(inset, h - inset); ctx.lineTo(inset, mid + inset); ctx.lineTo(notch + inset, mid + inset)
                    ctx.closePath(); ctx.fillStrokeShape(s)
                  }} fill="#333" />
                </>
              ) : (
                <>
                  <Shape sceneFunc={(ctx, s) => { steppedCapsPath(ctx, w, h); ctx.fillStrokeShape(s) }} fill={KEY_FILL} stroke={stroke} strokeWidth={strokeWidth} {...shadow} />
                  <Rect x={3} y={3} width={w - 6} height={h - 8} fill="#333" cornerRadius={KEY_RADIUS - 2} />
                </>
              )}

              {hold ? (
                <>
                  <Text x={4} y={4} width={w - 8} text={hold} fontSize={9} fill="#888" align="center" listening={false} />
                  <Text x={4} y={0} width={w - 8} height={h} text={tap} fontSize={assignedCode ? 13 : 10} fill={assignedCode ? LABEL_COLOR : '#444'} align="center" verticalAlign="middle" listening={false} />
                </>
              ) : (
                <Text x={4} y={0} width={w - 8} height={h} text={tap} fontSize={assignedCode ? 13 : 10} fill={assignedCode ? LABEL_COLOR : '#444'} align="center" verticalAlign="middle" listening={false} />
              )}
            </Group>
          )
        })}
      </Layer>
    </Stage>
  )
}
