import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle, useState } from 'react'
import { Stage, Layer, Line } from 'react-konva'
import type Konva from 'konva'
import { useKeyboardStore } from '@/store/keyboard'
import KeyShape from './KeyShape'
import SelectionTransformer from './SelectionTransformer'
import MatrixLines, { type ColorScheme } from './MatrixLines'
import { CANVAS_BG, UNIT } from './constants'

interface Props {
  showMatrix: boolean
  snapGrid: boolean
  width: number
  height: number
  colorScheme?: ColorScheme
}

export interface KeyCanvasHandle {
  fitView: () => void
}

type MatrixMode = 'row' | 'col' | 'led'
interface MatrixPending {
  id: string
  mode: MatrixMode
}

const ZOOM_FACTOR = 1.15
const MIN_SCALE = 0.2
const MAX_SCALE = 4
const GRID_U = 40
const SNAP_U = 0.25

const KeyCanvas = forwardRef<KeyCanvasHandle, Props>(function KeyCanvas(
  { showMatrix, snapGrid, width, height, colorScheme = 'default' },
  ref,
) {
  const stageRef = useRef<Konva.Stage>(null)
  const {
    config, selectedKeyIds, activeLayerId,
    setSelectedKey, setSelectedKeys, toggleSelectedKey, updateKey,
    addMatrixEdge, removeMatrixEdge,
  } = useKeyboardStore()

  const [matrixPending, setMatrixPending] = useState<MatrixPending | null>(null)

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
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    }
    stage.scale({ x: newScale, y: newScale })
    stage.position({ x: pointer.x - mousePointTo.x * newScale, y: pointer.y - mousePointTo.y * newScale })
  }

  function handleStageClick(e: Konva.KonvaEventObject<MouseEvent>) {
    if (e.target === e.currentTarget) {
      setSelectedKeys([])
      setMatrixPending(null)
    }
  }

  function handleKeySelect(id: string, shiftKey: boolean) {
    if (shiftKey) {
      toggleSelectedKey(id)
    } else {
      setSelectedKey(id)
    }
  }

  function handleMatrixClick(id: string, mods: { shift: boolean; ctrl: boolean; alt: boolean }) {
    const mode: MatrixMode = mods.ctrl ? 'col' : mods.alt ? 'led' : 'row'

    if (!matrixPending) {
      setMatrixPending({ id, mode })
      return
    }

    if (matrixPending.id === id) {
      setMatrixPending(null)
      return
    }

    const type = matrixPending.mode === 'col' ? 'col' : matrixPending.mode === 'led' ? 'led' : 'row'
    const edges = config.matrixEdges ?? []
    const exists = edges.some(
      (e) => e.type === type &&
        ((e.from === matrixPending.id && e.to === id) || (e.from === id && e.to === matrixPending.id))
    )

    if (exists) {
      removeMatrixEdge(matrixPending.id, id, type)
    } else {
      addMatrixEdge({ from: matrixPending.id, to: id, type })
    }

    setMatrixPending(null)
  }

  const fitView = useCallback(() => {
    const stage = stageRef.current
    if (!stage || config.keys.length === 0) return
    const maxX = Math.max(...config.keys.map((k) => (k.x + k.w) * UNIT))
    const maxY = Math.max(...config.keys.map((k) => (k.y + k.h) * UNIT))
    const padding = 60
    const scaleX = (width - padding * 2) / maxX
    const scaleY = (height - padding * 2) / maxY
    const scale = Math.min(scaleX, scaleY, MAX_SCALE)
    stage.scale({ x: scale, y: scale })
    stage.position({ x: padding, y: padding })
  }, [config.keys, width, height])

  useImperativeHandle(ref, () => ({ fitView }), [fitView])

  useEffect(() => {
    if (config.keys.length > 0) fitView()
  }, [config.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cancel matrix pending when matrix mode turns off
  useEffect(() => {
    if (!showMatrix) setMatrixPending(null)
  }, [showMatrix])

  // Grid lines at 0.25u intervals
  const gridLines: React.ReactNode[] = []
  if (snapGrid) {
    const snapPx = UNIT * SNAP_U
    const totalW = GRID_U * UNIT
    const totalH = GRID_U * UNIT * 0.6
    for (let x = 0; x <= totalW; x += snapPx) {
      gridLines.push(
        <Line key={`gv-${x}`} points={[x, 0, x, totalH]} stroke="#ffffff" opacity={0.15} strokeWidth={0.5} />
      )
    }
    for (let y = 0; y <= totalH; y += snapPx) {
      gridLines.push(
        <Line key={`gh-${y}`} points={[0, y, totalW, y]} stroke="#ffffff" opacity={0.15} strokeWidth={0.5} />
      )
    }
  }

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
        {gridLines}
        {config.keys.map((key) => {
          const keycodeLabel = !showMatrix ? (activeLayer?.keycodes[key.id] ?? undefined) : undefined
          return (
            <KeyShape
              key={key.id}
              keyDef={key}
              selected={selectedKeyIds.includes(key.id)}
              showMatrix={showMatrix}
              keycodeLabel={keycodeLabel}
              snapGrid={snapGrid}
              onSelect={handleKeySelect}
              onChange={updateKey}
              onMatrixClick={handleMatrixClick}
            />
          )
        })}
        {showMatrix && <MatrixLines keys={config.keys} edges={config.matrixEdges ?? []} pendingId={matrixPending?.id} colorScheme={colorScheme} />}
        {!showMatrix && <SelectionTransformer stageRef={stageRef} />}
      </Layer>
    </Stage>
  )
})

export default KeyCanvas
