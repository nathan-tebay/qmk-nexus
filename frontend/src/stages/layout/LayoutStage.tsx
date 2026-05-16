import { useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { nanoid } from './nanoid'
import KeyCanvas, { type KeyCanvasHandle } from './KeyCanvas'
import Toolbar from './Toolbar'
import KeyProperties from './KeyProperties'
import PeripheralProperties from './PeripheralProperties'
import PinPanel from './PinPanel'
import LoadKeyboardModal from './LoadKeyboardModal'
import styles from './LayoutStage.module.css'
import { useKeyboardStore } from '@/store/keyboard'
import type { KeyDef, Layer } from '@/store/keyboard'
import { validateMatrices, type MatrixValidationResult } from '@/utils/validateMatrices'
import { type ColorScheme, COLOR_SCHEME_LABELS, SCHEME_COLORS } from './MatrixLines'

type RightTab = 'properties' | 'pins'

const KEY_CLIPBOARD_TYPE = 'qmk-nexus/layout-keys'
const PASTE_OFFSET_U = 0.5

type ClipboardKey = Omit<KeyDef, 'id' | 'row' | 'col' | 'ledIndex'> & {
  dx: number
  dy: number
}

interface KeyClipboardPayload {
  type: typeof KEY_CLIPBOARD_TYPE
  keys: ClipboardKey[]
  keycodesByLayer: Record<string, Record<number, string>>
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return !!target.closest('input, textarea, select, button, a, [contenteditable="true"]')
}

function makeKeyClipboardPayload(keys: KeyDef[], layers: Layer[]): KeyClipboardPayload | null {
  if (keys.length === 0) return null
  const minX = Math.min(...keys.map((key) => key.x))
  const minY = Math.min(...keys.map((key) => key.y))
  const keysById = new Map(keys.map((key, index) => [key.id, index]))

  return {
    type: KEY_CLIPBOARD_TYPE,
    keys: keys.map((key) => ({
      x: key.x,
      y: key.y,
      dx: key.x - minX,
      dy: key.y - minY,
      w: key.w,
      h: key.h,
      rotation: key.rotation,
      label: key.label,
      shape: key.shape,
    })),
    keycodesByLayer: Object.fromEntries(
      layers.map((layer) => [
        layer.id,
        Object.fromEntries(
          Object.entries(layer.keycodes)
            .map(([keyId, keycode]) => [keysById.get(keyId), keycode] as const)
            .filter((entry): entry is [number, string] => entry[0] !== undefined)
        ),
      ])
    ),
  }
}

function parseKeyClipboardPayload(text: string): KeyClipboardPayload | null {
  try {
    const parsed = JSON.parse(text) as Partial<KeyClipboardPayload>
    if (parsed.type !== KEY_CLIPBOARD_TYPE || !Array.isArray(parsed.keys)) return null
    const keys = parsed.keys.filter((key): key is ClipboardKey => (
      typeof key === 'object' &&
      key !== null &&
      typeof key.x === 'number' &&
      typeof key.y === 'number' &&
      typeof key.dx === 'number' &&
      typeof key.dy === 'number' &&
      typeof key.w === 'number' &&
      typeof key.h === 'number' &&
      typeof key.rotation === 'number'
    ))
    return {
      type: KEY_CLIPBOARD_TYPE,
      keys,
      keycodesByLayer: parsed.keycodesByLayer ?? {},
    }
  } catch {
    return null
  }
}

export default function LayoutStage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [showMatrix, setShowMatrix] = useState(() => location.pathname.startsWith('/matrix'))
  const [snapGrid, setSnapGrid] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importTab, setImportTab] = useState<'user' | 'qmk'>('user')
  const [rightTab, setRightTab] = useState<RightTab>('properties')
  const [validation, setValidation] = useState<MatrixValidationResult | null>(null)
  const [colorScheme, setColorScheme] = useState<ColorScheme>('default')
  const config = useKeyboardStore((s) => s.config)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 })
  const canvasRef = useRef<KeyCanvasHandle>(null)
  const handledImportRef = useRef(false)
  const keyClipboardRef = useRef<KeyClipboardPayload | null>(null)
  const {
    selectedKeyIds, removeKey, setSelectedKeys, addKey, setConfig,
    activeLayerId, setActiveLayer,
    selectedPeripheralId, selectedPeripheralType,
    removeEncoder, removeOled, removeTrackball, setSelectedPeripheral,
  } = useKeyboardStore()

  function handleToggleMatrix() {
    const next = !showMatrix
    setShowMatrix(next)
    navigate(next ? '/matrix' : '/layout')
  }

  function handleStartFromScratch() {
    addKey({ id: nanoid(), x: 0, y: 0, w: 1, h: 1, rotation: 0, label: '', row: null, col: null, ledIndex: null, shape: 'rect' })
  }

  function handleImportKeyboard() {
    setShowImport(true)
  }

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
      if (isEditableTarget(e.target)) return

      const key = e.key.toLowerCase()
      const mod = e.metaKey || e.ctrlKey

      if (mod && key === 'c') {
        const selectedKeys = selectedKeyIds
          .map((id) => config.keys.find((keyDef) => keyDef.id === id))
          .filter((keyDef): keyDef is KeyDef => !!keyDef)
        const payload = makeKeyClipboardPayload(selectedKeys, config.layers)
        if (!payload) return
        e.preventDefault()
        keyClipboardRef.current = payload
        navigator.clipboard?.writeText(JSON.stringify(payload)).catch(() => {})
        return
      }

      if (mod && key === 'v') {
        e.preventDefault()
        const paste = (payload: KeyClipboardPayload | null) => {
          if (!payload || payload.keys.length === 0) return
          const newIds = payload.keys.map(() => nanoid())
          const minX = Math.min(...payload.keys.map((keyDef) => keyDef.x))
          const minY = Math.min(...payload.keys.map((keyDef) => keyDef.y))
          const baseX = minX + PASTE_OFFSET_U
          const baseY = minY + PASTE_OFFSET_U
          const pastedKeys: KeyDef[] = payload.keys.map((keyDef, index) => ({
            id: newIds[index],
            x: baseX + keyDef.dx,
            y: baseY + keyDef.dy,
            w: keyDef.w,
            h: keyDef.h,
            rotation: keyDef.rotation,
            label: keyDef.label,
            row: null,
            col: null,
            ledIndex: null,
            shape: keyDef.shape,
          }))
          const layers = config.layers.map((layer) => {
            const copiedKeycodes = payload.keycodesByLayer[layer.id] ?? {}
            const keycodes = { ...layer.keycodes }
            for (const [indexText, keycode] of Object.entries(copiedKeycodes)) {
              const index = Number(indexText)
              const id = newIds[index]
              if (id) keycodes[id] = keycode
            }
            return { ...layer, keycodes }
          })
          setConfig({ keys: [...config.keys, ...pastedKeys], layers })
          setActiveLayer(activeLayerId)
          setSelectedKeys(newIds)
          keyClipboardRef.current = {
            ...payload,
            keys: payload.keys.map((keyDef) => ({
              ...keyDef,
              x: keyDef.x + PASTE_OFFSET_U,
              y: keyDef.y + PASTE_OFFSET_U,
            })),
          }
        }

        if (keyClipboardRef.current) {
          paste(keyClipboardRef.current)
          return
        }

        navigator.clipboard?.readText()
          .then((text) => paste(parseKeyClipboardPayload(text)))
          .catch(() => {})
        return
      }

      if (e.key !== 'Delete' && e.key !== 'Backspace') return
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
  }, [activeLayerId, config.keys, config.layers, selectedKeyIds, removeKey, setActiveLayer, setConfig, setSelectedKeys, selectedPeripheralId, selectedPeripheralType, removeEncoder, removeOled, removeTrackball, setSelectedPeripheral])

  useEffect(() => {
    const shouldOpenImport = (location.state as { openImport?: boolean } | null)?.openImport
    if (!shouldOpenImport) {
      handledImportRef.current = false
      return
    }
    if (!handledImportRef.current) {
      handledImportRef.current = true
      setImportTab('qmk')
      setShowImport(true)
      navigate('/layout', { replace: true, state: {} })
    }
  }, [location.state, navigate])

  useEffect(() => {
    setShowMatrix(location.pathname.startsWith('/matrix'))
  }, [location.pathname])

  return (
    <>
    <div className={styles.root}>
      <aside className={styles.left}>
        <Toolbar
          showMatrix={showMatrix}
          snapGrid={snapGrid}
          onToggleMatrix={handleToggleMatrix}
          onToggleGrid={() => setSnapGrid((v) => !v)}
          onFitView={() => canvasRef.current?.fitView()}
          onImportQMK={handleImportKeyboard}
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
              <p className={styles.welcomeTagline}>Build QMK firmware visually.</p>
              <div className={styles.welcomeSteps}>
                <div className={styles.welcomeStep}>
                  <span className={styles.stepNum}>1</span>
                  <div>
                    <strong>Layout</strong>
                    <span>Place keys on a keyboard canvas.</span>
                  </div>
                </div>
                <div className={styles.welcomeStep}>
                  <span className={styles.stepNum}>2</span>
                  <div>
                    <strong>Matrix</strong>
                    <span>Connect row and column wires, then assign MCU pins.</span>
                  </div>
                </div>
                <div className={styles.welcomeStep}>
                  <span className={styles.stepNum}>3</span>
                  <div>
                    <strong>Keymap</strong>
                    <span>Assign keycodes per layer, manage layers, and configure encoder and OLED mappings.</span>
                  </div>
                </div>
                <div className={styles.welcomeStep}>
                  <span className={styles.stepNum}>4</span>
                  <div>
                    <strong>Features + Build</strong>
                    <span>Toggle feature modules, set USB metadata, compile and download firmware.</span>
                  </div>
                </div>
              </div>
              <div className={styles.welcomeActions}>
                <button
                  className={styles.welcomePrimary}
                  onClick={handleStartFromScratch}
                  title="Create a blank keyboard with one 1u key"
                  aria-label="Start from scratch"
                >
                  Start New Keyboard
                </button>
                <button
                  className={styles.welcomeSecondary}
                  onClick={handleImportKeyboard}
                  title="Load a saved keyboard or import a QMK keyboard"
                  aria-label="Load keyboard"
                >
                  Import Existing Keyboard
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
        <div className={styles.canvasHelpStack}>
          {!showMatrix && (
            <div className={styles.keybindInfo}>
              <strong>Keybinds</strong>
              <span><kbd>Shift</kbd> click selects multiple keys</span>
              <span><kbd>Ctrl</kbd>/<kbd>Cmd</kbd> <kbd>C</kbd> copies selected keys</span>
              <span><kbd>Ctrl</kbd>/<kbd>Cmd</kbd> <kbd>V</kbd> pastes copied keys</span>
              <span><kbd>Delete</kbd> removes selected keys</span>
            </div>
          )}
          {showMatrix && (
            <div className={styles.matrixInfo}>
              <strong>Matrix Mode</strong>
              <span>Click -&gt; Row <span style={{ color: SCHEME_COLORS[colorScheme].row }}>●</span></span>
              <span>Shift+click -&gt; Col <span style={{ color: SCHEME_COLORS[colorScheme].col }}>●</span></span>
              <span>Alt+click -&gt; LED <span style={{ color: SCHEME_COLORS[colorScheme].led }}>●</span></span>
              <span>Click two keys to connect / disconnect</span>
              <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center' }}>
                <button
                  onClick={handleValidate}
                  style={{ padding: '3px 8px', fontSize: 13.75, borderRadius: 4, border: '1px solid #555', background: '#2a2a2a', color: '#ccc', cursor: 'pointer' }}
                  title="Check matrix and LED wiring for missing or inconsistent assignments"
                  aria-label="Validate matrix wiring"
                >
                  Validate
                </button>
                <select
                  value={colorScheme}
                  onChange={(e) => setColorScheme(e.target.value as ColorScheme)}
                  style={{ fontSize: 13.75, borderRadius: 4, border: '1px solid #555', background: '#2a2a2a', color: '#ccc', padding: '2px 4px', cursor: 'pointer' }}
                >
                  {(Object.keys(COLOR_SCHEME_LABELS) as ColorScheme[]).map((s) => (
                    <option key={s} value={s}>{COLOR_SCHEME_LABELS[s]}</option>
                  ))}
                </select>
              </div>
              {validation && (
                <div style={{ marginTop: 4, fontSize: 13.75 }}>
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
      </div>

      <aside className={styles.right}>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${rightTab === 'properties' ? styles.activeTab : ''}`}
            onClick={() => setRightTab('properties')}
            title="Edit selected key or peripheral properties"
            aria-label="Show key properties"
          >
            Key
          </button>
          <button
            className={`${styles.tab} ${rightTab === 'pins' ? styles.activeTab : ''}`}
            onClick={() => setRightTab('pins')}
            title="Assign generated matrix rows and columns to MCU pins"
            aria-label="Show pin assignments"
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
    {showImport && <LoadKeyboardModal onClose={() => { setShowImport(false); setImportTab('user') }} initialTab={importTab} />}
    </>
  )
}
