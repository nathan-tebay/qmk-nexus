import { useEffect, useRef, useState } from 'react'
import { Transformer, Text } from 'react-konva'
import type Konva from 'konva'
import { useKeyboardStore } from '@/store/keyboard'
import { UNIT } from './constants'

interface Props {
  stageRef: React.RefObject<Konva.Stage>
}

const STEP = 0.25
const NEAR_THRESHOLD_PX = 100

export default function SelectionTransformer({ stageRef }: Props) {
  const trRef = useRef<Konva.Transformer>(null)
  const { selectedKeyIds, selectedKeyId, updateKey, config } = useKeyboardStore()
  const [liveRotation, setLiveRotation] = useState<number | null>(null)
  const [labelPos, setLabelPos] = useState<{ x: number; y: number } | null>(null)

  const selectedKey = config.keys.find((k) => k.id === selectedKeyId)
  const isNonRect = selectedKey && selectedKey.shape !== 'rect' && selectedKey.shape != null

  useEffect(() => {
    let raf = 0

    function attachNodes() {
      const tr = trRef.current
      const stage = stageRef.current
      if (!tr || !stage) return

      if (selectedKeyIds.length > 0) {
        const nodes = selectedKeyIds
          .map((id) => stage.findOne(`#${id}`))
          .filter(Boolean) as Konva.Node[]
        tr.nodes(nodes)
        tr.getLayer()?.batchDraw()
        return
      }

      tr.nodes([])
      tr.getLayer()?.batchDraw()
    }

    raf = requestAnimationFrame(attachNodes)
    return () => cancelAnimationFrame(raf)
  }, [config.keys, selectedKeyIds, stageRef])

  function handleTransform() {
    const tr = trRef.current
    const stage = stageRef.current
    if (!tr || !stage) return
    const node = tr.nodes()[0]
    if (!node) return

    const pointer = stage.getPointerPosition()
    if (pointer) {
      const absPos = node.getAbsolutePosition()
      const nodeW = node.width() * stage.scaleX()
      const nodeH = node.height() * stage.scaleY()
      const centerX = absPos.x + nodeW / 2
      const centerY = absPos.y + nodeH / 2
      const dist = Math.sqrt((pointer.x - centerX) ** 2 + (pointer.y - centerY) ** 2)
      const snapDeg = dist < NEAR_THRESHOLD_PX ? 5 : 1
      const raw = node.rotation()
      const snapped = Math.round(raw / snapDeg) * snapDeg
      node.rotation(snapped)
      setLiveRotation(snapped)
      setLabelPos({ x: node.x(), y: node.y() })
    }
  }

  function handleTransformEnd() {
    const tr = trRef.current
    if (!tr || !selectedKeyIds.length) return
    const nodes = tr.nodes()

    for (const node of nodes) {
      const id = node.id()
      if (!id) continue
      const scaleX = node.scaleX()
      const scaleY = node.scaleY()
      node.scaleX(1)
      node.scaleY(1)

      const isResized = Math.abs(scaleX - 1) > 0.01 || Math.abs(scaleY - 1) > 0.01
      const updates: Parameters<typeof updateKey>[1] = {
        rotation: Math.round(node.rotation()),
        x: node.x() / UNIT,
        y: node.y() / UNIT,
      }
      if (isResized) {
        updates.w = Math.max(STEP, Math.round((node.width() * scaleX) / (UNIT * STEP)) * STEP)
        updates.h = Math.max(STEP, Math.round((node.height() * scaleY) / (UNIT * STEP)) * STEP)
      }
      updateKey(id, updates)
    }

    setLiveRotation(null)
    setLabelPos(null)
  }

  return (
    <>
      <Transformer
        ref={trRef}
        onTransform={handleTransform}
        onTransformEnd={handleTransformEnd}
        rotateEnabled
        enabledAnchors={
          isNonRect
            ? []
            : ['middle-right', 'bottom-center', 'bottom-right']
        }
        boundBoxFunc={(oldBox, newBox) => {
          // During rotation the axis-aligned bbox grows — don't constrain size then
          if (Math.abs(newBox.rotation - oldBox.rotation) > 0.001) return newBox
          return {
            ...newBox,
            width: Math.max(UNIT * STEP, newBox.width),
            height: Math.max(UNIT * STEP, newBox.height),
          }
        }}
      />
      {liveRotation !== null && labelPos && (
        <Text
          x={labelPos.x}
          y={labelPos.y - 28}
          text={`${liveRotation}°`}
          fontSize={16.25}
          fontStyle="bold"
          fill="#ffffff"
          padding={4}
          listening={false}
        />
      )}
    </>
  )
}
