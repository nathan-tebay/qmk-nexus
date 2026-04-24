import { useState, useRef, useEffect } from 'react'
import { useKeyboardStore } from '@/store/keyboard'
import { LayerManager } from './LayerManager'
import { KeycodePicker } from './KeycodePicker'
import KeymapCanvas from './KeymapCanvas'
import styles from './KeymapStage.module.css'

interface Tooltip { code: string; x: number; y: number }

export default function KeymapStage() {
  const {
    config, activeLayerId,
    setActiveLayer, setKeycode, addLayer, removeLayer, renameLayer,
  } = useKeyboardStore()

  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerKeyId, setPickerKeyId] = useState<string | null>(null)
  // Let's stick to what was there.
  const [tooltip, setTooltip] = useState<Tooltip | null>(null)

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
      <div className={styles.root}>
        <div className={styles.empty}>
          <span>No keys defined. Add keys in Stage 1 first.</span>
        </div>
      </div>
    )
  }

  if (config.layers.length === 0) {
    return (
      <div className={styles.root}>
        <div className={styles.empty}>
          <div className={styles.welcomeCard}>
            <h3>No Layers Found</h3>
            <p>You haven't created any layers yet. Go to Stage 1 to define your keys, then come back here to assign keycodes.</p>
          </div>
        </div>
      </div>
    )
  }

  if (!activeLayer) {
    return (
      <div className={styles.root}>
        <div className={styles.empty}>
          <span className={styles.error}>Active layer not found. Please ensure a layer is selected.</span>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.root}>
      <div className={styles.sidebar}>
        <LayerManager
          layers={config.layers}
          activeLayerId={activeLayerId}
          onSelect={setActiveLayer}
          onAdd={addLayer}
          onRemove={removeLayer}
          onRename={renameLayer}
        />
      </div>

      <div className={styles.mainContent}>
        <div className={styles.hint}>
          Click any key to assign a keycode · Double-key a layer tab to rename
        </div>

        <div className={styles.canvas} ref={canvasContainerRef} style={{ position: 'relative' }}>
          <KeymapCanvas
            width={canvasSize.width}
            height={canvasSize.height}
            onKeyClick={handleKeyClick}
            onTooltip={(code, x, y) => setTooltip({ code, x, y })}
            onTooltipHide={() => setTooltip(null)}
          />
          {tooltip && (
            <div
              style={{
                position: 'absolute',
                left: tooltip.x + 12,
                top: tooltip.y - 8,
                background: '#1a1a1a',
                border: '1px solid #444',
                borderRadius: 4,
                padding: '4px 8px',
                fontSize: 11,
                color: '#ccc',
                fontFamily: 'monospace',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                zIndex: 100,
              }}
            >
              {tooltip.code}
            </div>
          )}
        </div>
      </div>

      {pickerOpen && pickerKeyId && (
        <KeycodePicker
          currentCode={currentCode}
          onSelect={handleSelect}
          onClose={() => setPickerOpen(false)}
          layerCount={config.layers.length}
        />
      )}
    </div>
  )
}
