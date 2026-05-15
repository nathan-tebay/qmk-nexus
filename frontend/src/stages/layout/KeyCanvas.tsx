import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle, useState } from 'react'
import { Stage, Layer, Line } from 'react-konva'
import type Konva from 'konva'
import { useKeyboardStore } from '@/store/keyboard'
import KeyShape from './KeyShape'
import SelectionTransformer from './SelectionTransformer'
import MatrixLines, { type ColorScheme } from './MatrixLines'
import { EncoderShape, OledShape, TrackballShape } from './PeripheralShape'
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

interface MultiDragState {
  draggedId: string
  startX: number
  startY: number
  positions: Map<string, { x: number; y: number }>
}

const ZOOM_FACTOR = 1.15
const MIN_SCALE = 0.2
const MAX_SCALE = 4
const GRID_U = 40
const SNAP_U = 0.25
const SNAP_UNIT = UNIT * SNAP_U

const KeyCanvas = forwardRef<KeyCanvasHandle, Props>(function KeyCanvas(
  { showMatrix, snapGrid, width, height, colorScheme = 'default' },
  ref,
) {
  const stageRef = useRef<Konva.Stage>(null)
  const multiDragRef = useRef<MultiDragState | null>(null)
  const {
    config, selectedKeyIds, activeLayerId,
    setSelectedKey, setSelectedKeys, toggleSelectedKey, updateKey,
    addMatrixEdge, removeMatrixEdge,
    selectedPeripheralId, setSelectedPeripheral,
    updateEncoder, updateOled, updateTrackball,
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
      setSelectedPeripheral(null, null)
      setMatrixPending(null)
    }
  }

  function handlePeripheralSelect(id: string, type: 'encoder' | 'oled' | 'trackball') {
    setSelectedKeys([])
    setSelectedPeripheral(id, type)
  }

  function handleKeySelect(id: string, shiftKey: boolean) {
    if (shiftKey) {
      toggleSelectedKey(id)
    } else {
      setSelectedKey(id)
    }
  }

  function handleMatrixClick(id: string, mods: { shift: boolean; alt: boolean }) {
    const mode: MatrixMode = mods.alt ? 'led' : mods.shift ? 'col' : 'row'

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

  function handleKeyDragStart(id: string, node: Konva.Node) {
    if (!selectedKeyIds.includes(id) || selectedKeyIds.length < 2) {
      multiDragRef.current = null
      return
    }
    const stage = stageRef.current
    if (!stage) return

    const positions = new Map<string, { x: number; y: number }>()
    for (const keyId of selectedKeyIds) {
      const selectedNode = stage.findOne(`#${keyId}`)
      if (!selectedNode) continue
      positions.set(keyId, { x: selectedNode.x(), y: selectedNode.y() })
    }
    multiDragRef.current = {
      draggedId: id,
      startX: node.x(),
      startY: node.y(),
      positions,
    }
  }

  function handleKeyDragMove(id: string, node: Konva.Node) {
    const drag = multiDragRef.current
    const stage = stageRef.current
    if (!drag || drag.draggedId !== id || !stage) return

    const dx = node.x() - drag.startX
    const dy = node.y() - drag.startY
    for (const [keyId, start] of drag.positions) {
      if (keyId === id) continue
      const selectedNode = stage.findOne(`#${keyId}`)
      selectedNode?.position({ x: start.x + dx, y: start.y + dy })
    }
    stage.batchDraw()
  }

  function handleKeyDragEnd(id: string, node: Konva.Node): boolean {
    const drag = multiDragRef.current
    const stage = stageRef.current
    if (!drag || drag.draggedId !== id || !stage) return false

    const draggedKey = config.keys.find((key) => key.id === id)
    const snap = snapGrid ? SNAP_UNIT : UNIT
    const finalX = draggedKey?.rotation
      ? node.x()
      : Math.round(node.x() / snap) * snap
    const finalY = draggedKey?.rotation
      ? node.y()
      : Math.round(node.y() / snap) * snap
    const dx = finalX - drag.startX
    const dy = finalY - drag.startY

    for (const [keyId, start] of drag.positions) {
      const selectedNode = stage.findOne(`#${keyId}`)
      const x = start.x + dx
      const y = start.y + dy
      selectedNode?.position({ x, y })
      updateKey(keyId, { x: x / UNIT, y: y / UNIT })
    }

    multiDragRef.current = null
    stage.batchDraw()
    return true
  }

  const fitView = useCallback(() => {
    const stage = stageRef.current
    const allBounds: number[][] = [
      ...config.keys.map((k) => [(k.x + k.w) * UNIT, (k.y + k.h) * UNIT]),
      ...(config.encoders ?? []).map((e) => [(e.x + 2) * UNIT, (e.y + 2) * UNIT]),
      ...(config.oleds ?? []).map((o) => [(o.x + 2.5) * UNIT, (o.y + 1.5) * UNIT]),
      ...(config.trackballs ?? []).map((t) => [(t.x + 2) * UNIT, (t.y + 2) * UNIT]),
    ]
    if (!stage || allBounds.length === 0) return
    const maxX = Math.max(...allBounds.map((b) => b[0]))
    const maxY = Math.max(...allBounds.map((b) => b[1]))
    const padding = 60
    const scaleX = (width - padding * 2) / maxX
    const scaleY = (height - padding * 2) / maxY
    const scale = Math.min(scaleX, scaleY, MAX_SCALE)
    stage.scale({ x: scale, y: scale })
    stage.position({ x: padding, y: padding })
  }, [config.keys, config.encoders, config.oleds, config.trackballs, width, height])

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
          const keycodeLabel = !showMatrix ? (activeLayer?.keycodes[key.id] ?? 'KC_TRNS') : undefined
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
              onDragStart={handleKeyDragStart}
              onDragMove={handleKeyDragMove}
              onDragEnd={handleKeyDragEnd}
            />
          )
        })}
        {(config.encoders ?? []).map((enc) => (
          <EncoderShape
            key={enc.id}
            el={enc}
            selected={selectedPeripheralId === enc.id}
            onSelect={(id) => handlePeripheralSelect(id, 'encoder')}
            onChange={updateEncoder}
          />
        ))}
        {(config.oleds ?? []).map((oled) => (
          <OledShape
            key={oled.id}
            el={oled}
            selected={selectedPeripheralId === oled.id}
            onSelect={(id) => handlePeripheralSelect(id, 'oled')}
            onChange={updateOled}
          />
        ))}
        {(config.trackballs ?? []).map((tb) => (
          <TrackballShape
            key={tb.id}
            el={tb}
            selected={selectedPeripheralId === tb.id}
            onSelect={(id) => handlePeripheralSelect(id, 'trackball')}
            onChange={updateTrackball}
          />
        ))}
        {showMatrix && <MatrixLines keys={config.keys} edges={config.matrixEdges ?? []} pendingId={matrixPending?.id} colorScheme={colorScheme} />}
        {!showMatrix && <SelectionTransformer stageRef={stageRef} />}
      </Layer>
    </Stage>
  )
})

export default KeyCanvas
