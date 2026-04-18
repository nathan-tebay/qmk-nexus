import { useState, useRef, useEffect } from 'react'
import KeyCanvas, { type KeyCanvasHandle } from './KeyCanvas'
import Toolbar from './Toolbar'
import KeyProperties from './KeyProperties'
import PinPanel from './PinPanel'
import QMKImportModal from './QMKImportModal'
import styles from './LayoutStage.module.css'
import { useKeyboardStore } from '@/store/keyboard'

type RightTab = 'properties' | 'pins'

export default function LayoutStage() {
  const [showMatrix, setShowMatrix] = useState(false)
  const [snapGrid, setSnapGrid] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [rightTab, setRightTab] = useState<RightTab>('properties')
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 })
  const canvasRef = useRef<KeyCanvasHandle>(null)
  const { selectedKeyIds, removeKey, setSelectedKeys } = useKeyboardStore()

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

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (document.activeElement !== document.body) return
      if (selectedKeyIds.length === 0) return
      for (const id of selectedKeyIds) removeKey(id)
      setSelectedKeys([])
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedKeyIds, removeKey, setSelectedKeys])

  return (
    <>
    <div className={styles.root}>
      <aside className={styles.left}>
        <Toolbar
          showMatrix={showMatrix}
          snapGrid={snapGrid}
          onToggleMatrix={() => setShowMatrix((v) => !v)}
          onToggleGrid={() => setSnapGrid((v) => !v)}
          onFitView={() => canvasRef.current?.fitView()}
          onImportQMK={() => setShowImport(true)}
        />
      </aside>

      <div className={styles.canvasWrap} ref={canvasContainerRef} style={{ position: 'relative' }}>
        <KeyCanvas
          ref={canvasRef}
          showMatrix={showMatrix}
          snapGrid={snapGrid}
          width={canvasSize.width}
          height={canvasSize.height}
        />
        {showMatrix && (
          <div className={styles.matrixInfo}>
            <strong>Matrix Mode</strong>
            <span>Shift+click → Row <span style={{ color: '#ef4444' }}>●</span></span>
            <span>Ctrl+click → Col <span style={{ color: '#22c55e' }}>●</span></span>
            <span>Alt+click → LED <span style={{ color: '#3b82f6' }}>●</span></span>
            <span>Click two keys to connect / disconnect</span>
          </div>
        )}
      </div>

      <aside className={styles.right}>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${rightTab === 'properties' ? styles.activeTab : ''}`}
            onClick={() => setRightTab('properties')}
          >
            Key
          </button>
          <button
            className={`${styles.tab} ${rightTab === 'pins' ? styles.activeTab : ''}`}
            onClick={() => setRightTab('pins')}
          >
            Pins
          </button>
        </div>
        <div className={styles.tabContent}>
          {rightTab === 'properties' ? <KeyProperties /> : <PinPanel />}
        </div>
      </aside>
    </div>
    {showImport && <QMKImportModal onClose={() => setShowImport(false)} />}
    </>
  )
}
