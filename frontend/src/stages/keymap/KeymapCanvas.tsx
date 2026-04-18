import { useRef, useEffect } from 'react'
import { Stage, Layer, Group, Rect, Text } from 'react-konva'
import type Konva from 'konva'
import { useKeyboardStore } from '@/store/keyboard'
import { keycodeMap } from './keycodes'
import { UNIT, GAP, CANVAS_BG, KEY_FILL, KEY_STROKE, KEY_SELECTED_STROKE, KEY_RADIUS, LABEL_COLOR } from '../layout/constants'

interface Props {
  width: number
  height: number
  onKeyClick: (keyId: string) => void
}

interface ParsedCode {
  tap: string
  hold?: string
}

function parseAssignedCode(code: string): ParsedCode {
  const mt = code.match(/^MT\(([^,]+),\s*(.+)\)$/)
  if (mt) {
    const bits = mt[1].trim()
    const tap = keycodeMap.get(mt[2].trim())?.label ?? mt[2].trim().replace(/^KC_/, '')
    const holdParts = bits.split('|').map((b) => b.trim())
    const modLabels: Record<string, string> = {
      MOD_LSFT: 'Sft', MOD_LCTL: 'Ctl', MOD_LALT: 'Alt', MOD_LGUI: 'OS',
    }
    const hold = holdParts.map((b) => modLabels[b] ?? b).join('+')
    return { tap, hold: `${hold}↓` }
  }
  const lt = code.match(/^LT\((\d+),\s*(.+)\)$/)
  if (lt) {
    const layer = lt[1]
    const tap = keycodeMap.get(lt[2].trim())?.label ?? lt[2].trim().replace(/^KC_/, '')
    return { tap, hold: `L${layer}↓` }
  }
  const kc = keycodeMap.get(code)
  return { tap: kc?.label ?? code.replace(/^KC_/, '').slice(0, 8) }
}

const ZOOM_FACTOR = 1.15
const MIN_SCALE = 0.2
const MAX_SCALE = 4

export default function KeymapCanvas({ width, height, onKeyClick }: Props) {
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

          return (
            <Group
              key={key.id}
              x={key.x * UNIT}
              y={key.y * UNIT}
              rotation={key.rotation}
              onClick={() => handleKeyClick(key.id)}
              onTap={() => handleKeyClick(key.id)}
            >
              <Rect
                width={w} height={h}
                fill={KEY_FILL}
                stroke={isSelected ? KEY_SELECTED_STROKE : KEY_STROKE}
                strokeWidth={isSelected ? 2 : 1}
                cornerRadius={KEY_RADIUS}
                shadowColor={isSelected ? KEY_SELECTED_STROKE : undefined}
                shadowBlur={isSelected ? 8 : 0}
                shadowOpacity={0.4}
              />
              <Rect x={3} y={3} width={w - 6} height={h - 8} fill="#333" cornerRadius={KEY_RADIUS - 2} />

              {hold ? (
                /* Hold/Tap two-line display */
                <>
                  <Text
                    x={4} y={4}
                    width={w - 8}
                    text={hold}
                    fontSize={9}
                    fill="#888"
                    align="center"
                    listening={false}
                  />
                  <Text
                    x={4} y={0}
                    width={w - 8} height={h}
                    text={tap}
                    fontSize={assignedCode ? 13 : 10}
                    fill={assignedCode ? LABEL_COLOR : '#444'}
                    align="center"
                    verticalAlign="middle"
                    listening={false}
                  />
                </>
              ) : (
                <Text
                  x={4} y={0}
                  width={w - 8} height={h}
                  text={tap}
                  fontSize={assignedCode ? 13 : 10}
                  fill={assignedCode ? LABEL_COLOR : '#444'}
                  align="center"
                  verticalAlign="middle"
                  listening={false}
                />
              )}
            </Group>
          )
        })}
      </Layer>
    </Stage>
  )
}
