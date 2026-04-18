import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import { Stage, Layer } from 'react-konva'
import type Konva from 'konva'
import { useKeyboardStore } from '@/store/keyboard'
import KeyShape from './KeyShape'
import SelectionTransformer from './SelectionTransformer'
import { CANVAS_BG, UNIT } from './constants'

interface Props {
  showMatrix: boolean
  width: number
  height: number
}

export interface KeyCanvasHandle {
  fitView: () => void
}

const ZOOM_FACTOR = 1.15
const MIN_SCALE = 0.2
const MAX_SCALE = 4

const KeyCanvas = forwardRef<KeyCanvasHandle, Props>(function KeyCanvas(
  { showMatrix, width, height },
  ref,
) {
  const stageRef = useRef<Konva.Stage>(null)
  const { config, selectedKeyId, setSelectedKey, updateKey } = useKeyboardStore()

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
    stage.position({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    })
  }

  function handleStageClick(e: Konva.KonvaEventObject<MouseEvent>) {
    if (e.target === e.currentTarget) setSelectedKey(null)
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

  // Fit when keyboard id changes (different keyboard loaded)
  useEffect(() => {
    if (config.keys.length > 0) fitView()
  }, [config.id]) // eslint-disable-line react-hooks/exhaustive-deps

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
        {config.keys.map((key) => (
          <KeyShape
            key={key.id}
            keyDef={key}
            selected={key.id === selectedKeyId}
            showMatrix={showMatrix}
            onSelect={setSelectedKey}
            onChange={updateKey}
          />
        ))}
        <SelectionTransformer stageRef={stageRef} />
      </Layer>
    </Stage>
  )
})

export default KeyCanvas
