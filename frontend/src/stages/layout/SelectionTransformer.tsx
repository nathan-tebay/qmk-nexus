import { useEffect, useRef } from 'react'
import { Transformer } from 'react-konva'
import type Konva from 'konva'
import { useKeyboardStore } from '@/store/keyboard'
import { UNIT } from './constants'

interface Props {
  stageRef: React.RefObject<Konva.Stage>
}

export default function SelectionTransformer({ stageRef }: Props) {
  const trRef = useRef<Konva.Transformer>(null)
  const { selectedKeyId, updateKey } = useKeyboardStore()

  useEffect(() => {
    const tr = trRef.current
    const stage = stageRef.current
    if (!tr || !stage) return

    if (selectedKeyId) {
      const node = stage.findOne(`#${selectedKeyId}`)
      if (node) {
        tr.nodes([node])
        tr.getLayer()?.batchDraw()
      }
    } else {
      tr.nodes([])
      tr.getLayer()?.batchDraw()
    }
  }, [selectedKeyId, stageRef])

  function handleTransformEnd() {
    const tr = trRef.current
    if (!tr || !selectedKeyId) return
    const node = tr.nodes()[0]
    if (!node) return

    const scaleX = node.scaleX()
    const scaleY = node.scaleY()
    node.scaleX(1)
    node.scaleY(1)

    const STEP = 0.25
    const newW = Math.max(0.5, Math.round((node.width() * scaleX) / (UNIT * STEP)) * STEP)
    const newH = Math.max(0.5, Math.round((node.height() * scaleY) / (UNIT * STEP)) * STEP)

    updateKey(selectedKeyId, {
      w: newW,
      h: newH,
      rotation: node.rotation(),
    })
  }

  return (
    <Transformer
      ref={trRef}
      onTransformEnd={handleTransformEnd}
      rotateEnabled
      enabledAnchors={['middle-right', 'bottom-center', 'bottom-right']}
      boundBoxFunc={(_, newBox) => ({
        ...newBox,
        width: Math.max(UNIT, newBox.width),
        height: Math.max(UNIT, newBox.height),
      })}
    />
  )
}
