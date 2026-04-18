import { useState, useRef, useEffect } from 'react'
import { useKeyboardStore } from '@/store/keyboard'
import { LayerManager } from './LayerManager'
import { KeycodePicker } from './KeycodePicker'
import KeymapCanvas from './KeymapCanvas'
import styles from './KeymapStage.module.css'

export default function KeymapStage() {
  const {
    config, activeLayerId,
    setActiveLayer, setKeycode, addLayer, removeLayer, renameLayer,
    selectedKeyId,
  } = useKeyboardStore()

  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerKeyId, setPickerKeyId] = useState<string | null>(null)

  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 })

  useEffect(() => {
    const el = canvasContainerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setCanvasSize({ width, height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  function handleKeyClick(keyId: string) {
    setPickerKeyId(keyId)
    setPickerOpen(true)
  }

  function handleSelect(code: string) {
    if (pickerKeyId) setKeycode(pickerKeyId, activeLayerId, code)
  }

  const activeLayer = config.layers.find((l) => l.id === activeLayerId)
  const currentCode = pickerKeyId ? (activeLayer?.keycodes[pickerKeyId] ?? '') : ''

  if (config.keys.length === 0) {
    return (
      <div className={styles.empty}>
        <span>No keys defined. Add keys in Stage 1 first.</span>
      </div>
    )
  }

  return (
    <div className={styles.root}>
      <LayerManager
        layers={config.layers}
        activeLayerId={activeLayerId}
        onSelect={setActiveLayer}
        onAdd={addLayer}
        onRemove={removeLayer}
        onRename={renameLayer}
      />

      <div className={styles.hint}>
        Click any key to assign a keycode · Double-click a layer tab to rename
      </div>

      <div className={styles.canvas} ref={canvasContainerRef}>
        <KeymapCanvas
          width={canvasSize.width}
          height={canvasSize.height}
          onKeyClick={handleKeyClick}
        />
      </div>

      {pickerOpen && pickerKeyId && (
        <KeycodePicker
          currentCode={currentCode}
          onSelect={handleSelect}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}
