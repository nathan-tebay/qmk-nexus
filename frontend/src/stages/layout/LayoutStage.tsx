import { useState, useRef, useEffect } from 'react'
import KeyCanvas, { type KeyCanvasHandle } from './KeyCanvas'
import Toolbar from './Toolbar'
import KeyProperties from './KeyProperties'
import PinPanel from './PinPanel'
import styles from './LayoutStage.module.css'

type RightTab = 'properties' | 'pins'

export default function LayoutStage() {
  const [showMatrix, setShowMatrix] = useState(false)
  const [rightTab, setRightTab] = useState<RightTab>('properties')
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 })
  const canvasRef = useRef<KeyCanvasHandle>(null)

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

  return (
    <div className={styles.root}>
      <aside className={styles.left}>
        <Toolbar
          showMatrix={showMatrix}
          onToggleMatrix={() => setShowMatrix((v) => !v)}
          onFitView={() => canvasRef.current?.fitView()}
        />
      </aside>

      <div className={styles.canvasWrap} ref={canvasContainerRef}>
        <KeyCanvas
          ref={canvasRef}
          showMatrix={showMatrix}
          width={canvasSize.width}
          height={canvasSize.height}
        />
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
  )
}
