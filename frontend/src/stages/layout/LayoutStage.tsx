import { useState, useRef, useEffect } from 'react'
import { nanoid } from './nanoid'
import KeyCanvas, { type KeyCanvasHandle } from './KeyCanvas'
import Toolbar from './Toolbar'
import KeyProperties from './KeyProperties'
import PeripheralProperties from './PeripheralProperties'
import PinPanel from './PinPanel'
import LoadKeyboardModal from './LoadKeyboardModal'
import styles from './LayoutStage.module.css'
import { useKeyboardStore } from '@/store/keyboard'
import { validateMatrices, type MatrixValidationResult } from '@/utils/validateMatrices'
import { type ColorScheme, COLOR_SCHEME_LABELS, SCHEME_COLORS } from './MatrixLines'

type RightTab = 'properties' | 'pins'

export default function LayoutStage() {
  const [showMatrix, setShowMatrix] = useState(false)
  const [snapGrid, setSnapGrid] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [rightTab, setRightTab] = useState<RightTab>('properties')
  const [validation, setValidation] = useState<MatrixValidationResult | null>(null)
  const [colorScheme, setColorScheme] = useState<ColorScheme>('default')
  const config = useKeyboardStore((s) => s.config)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 })
  const canvasRef = useRef<KeyCanvasHandle>(null)
  const {
    selectedKeyIds, removeKey, setSelectedKeys, addKey,
    selectedPeripheralId, selectedPeripheralType,
    removeEncoder, removeOled, removeTrackball, setSelectedPeripheral,
  } = useKeyboardStore()

  function handleValidate() {
    setValidation(validateMatrices(config))
  }

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
      if (selectedPeripheralId && selectedPeripheralType) {
        if (selectedPeripheralType === 'encoder') removeEncoder(selectedPeripheralId)
        else if (selectedPeripheralType === 'oled') removeOled(selectedPeripheralId)
        else if (selectedPeripheralType === 'trackball') removeTrackball(selectedPeripheralId)
        setSelectedPeripheral(null, null)
        return
      }
      if (selectedKeyIds.length === 0) return
      for (const id of selectedKeyIds) removeKey(id)
      setSelectedKeys([])
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedKeyIds, removeKey, setSelectedKeys, selectedPeripheralId, selectedPeripheralType, removeEncoder, removeOled, removeTrackball, setSelectedPeripheral])

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
          colorScheme={colorScheme}
        />
        {config.keys.length === 0 && (
          <div className={styles.welcome}>
            <div className={styles.welcomeCard}>
              <h1 className={styles.welcomeTitle}>QMK Nexus</h1>
              <p className={styles.welcomeTagline}>A modernised firmware editor for custom keyboards.</p>
              <div className={styles.welcomeSteps}>
                <div className={styles.welcomeStep}>
                  <span className={styles.stepNum}>1</span>
                  <div>
                    <strong>Layout + Wiring</strong>
                    <span>Place keys on a canvas, assign matrix rows/cols and MCU pins.</span>
                  </div>
                </div>
                <div className={styles.welcomeStep}>
                  <span className={styles.stepNum}>2</span>
                  <div>
                    <strong>Keymap / Layers</strong>
                    <span>Assign keycodes per layer, configure tap-dance, combos and macros.</span>
                  </div>
                </div>
                <div className={styles.welcomeStep}>
                  <span className={styles.stepNum}>3</span>
                  <div>
                    <strong>Features + Build</strong>
                    <span>Toggle feature modules, set USB metadata, compile and download firmware.</span>
                  </div>
                </div>
              </div>
              <div className={styles.welcomeActions}>
                <button className={styles.welcomePrimary} onClick={() => setShowImport(true)}>
                  Load Keyboard
                </button>
                <button className={styles.welcomeSecondary} onClick={() => addKey({ id: nanoid(), x: 0, y: 0, w: 1, h: 1, rotation: 0, label: '', row: null, col: null, ledIndex: null, shape: 'rect' })}>
                  Start from Scratch
                </button>
              </div>
              <p className={styles.welcomeCredits}>
                Built on{' '}
                <a href="https://qmk.fm" target="_blank" rel="noreferrer">QMK Firmware</a>,{' '}
                <a href="http://www.keyboard-layout-editor.com" target="_blank" rel="noreferrer">Keyboard Layout Editor</a>{' '}
                and{' '}
                <a href="https://kbfirmware.com" target="_blank" rel="noreferrer">QMK Builder</a>.
              </p>
            </div>
          </div>
        )}
        {showMatrix && (
          <div className={styles.matrixInfo}>
            <strong>Matrix Mode</strong>
            <span>Click → Row <span style={{ color: SCHEME_COLORS[colorScheme].row }}>●</span></span>
            <span>Ctrl+click → Col <span style={{ color: SCHEME_COLORS[colorScheme].col }}>●</span></span>
            <span>Alt+click → LED <span style={{ color: SCHEME_COLORS[colorScheme].led }}>●</span></span>
            <span>Click two keys to connect / disconnect</span>
            <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center' }}>
              <button
                onClick={handleValidate}
                style={{ padding: '3px 8px', fontSize: 11, borderRadius: 4, border: '1px solid #555', background: '#2a2a2a', color: '#ccc', cursor: 'pointer' }}
              >
                Validate
              </button>
              <select
                value={colorScheme}
                onChange={(e) => setColorScheme(e.target.value as ColorScheme)}
                style={{ fontSize: 11, borderRadius: 4, border: '1px solid #555', background: '#2a2a2a', color: '#ccc', padding: '2px 4px', cursor: 'pointer' }}
              >
                {(Object.keys(COLOR_SCHEME_LABELS) as ColorScheme[]).map((s) => (
                  <option key={s} value={s}>{COLOR_SCHEME_LABELS[s]}</option>
                ))}
              </select>
            </div>
            {validation && (
              <div style={{ marginTop: 4, fontSize: 11 }}>
                {validation.errors.length === 0 ? (
                  <span style={{ color: SCHEME_COLORS[colorScheme].col }}>✓ Matrix valid</span>
                ) : (
                  validation.errors.map((e, i) => (
                    <div key={i} style={{ color: SCHEME_COLORS[colorScheme].row }}>✗ {e}</div>
                  ))
                )}
              </div>
            )}
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
          {rightTab === 'properties'
            ? (selectedPeripheralId ? <PeripheralProperties /> : <KeyProperties />)
            : <PinPanel />}
        </div>
      </aside>
    </div>
    {showImport && <LoadKeyboardModal onClose={() => setShowImport(false)} />}
    </>
  )
}
