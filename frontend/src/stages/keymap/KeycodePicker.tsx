import { useEffect, useState, useMemo } from 'react'
import { KEYCODES, CATEGORIES, keycodeMap, isKeycodeAvailable } from './keycodes'
import { useKeyboardStore } from '@/store/keyboard'
import styles from './KeycodePicker.module.css'

interface Props {
  onSelect: (code: string) => void
  onClose: () => void
  currentCode?: string
  layerCount?: number
  inline?: boolean
}

type ModKey = 'ctrl' | 'shift' | 'alt' | 'gui' | 'meh' | 'hyper'

interface CapturedShortcut {
  code: string
  label: string
  warning?: string
}

const MODS: { key: ModKey; label: string; qmk: string }[] = [
  { key: 'ctrl',  label: 'Ctrl',  qmk: 'LCTL' },
  { key: 'shift', label: 'Shift', qmk: 'LSFT' },
  { key: 'alt',   label: 'Alt',   qmk: 'LALT' },
  { key: 'gui',   label: 'OS',    qmk: 'LGUI' },
  { key: 'meh',   label: 'Meh',   qmk: 'MEH'  },
  { key: 'hyper', label: 'Hyper', qmk: 'HYPR' },
]

const MT_MODS: { key: ModKey; label: string; bit: string }[] = [
  { key: 'shift', label: 'Shift', bit: 'MOD_LSFT' },
  { key: 'ctrl',  label: 'Ctrl',  bit: 'MOD_LCTL' },
  { key: 'alt',   label: 'Alt',   bit: 'MOD_LALT' },
  { key: 'gui',   label: 'OS',    bit: 'MOD_LGUI' },
]

function wrapMods(code: string, mods: Partial<Record<ModKey, boolean>>): string {
  let result = code
  if (mods.hyper) return `HYPR(${result})`
  if (mods.meh)   return `MEH(${result})`
  if (mods.gui)   result = `LGUI(${result})`
  if (mods.alt)   result = `LALT(${result})`
  if (mods.shift) result = `LSFT(${result})`
  if (mods.ctrl)  result = `LCTL(${result})`
  return result
}

function buildMT(tapCode: string, holdMods: Partial<Record<ModKey, boolean>>): string {
  const bits = MT_MODS.filter((m) => holdMods[m.key]).map((m) => m.bit)
  if (bits.length === 0) return tapCode
  return `MT(${bits.join(' | ')}, ${tapCode})`
}

function buildLT(tapCode: string, layer: number): string {
  return `LT(${layer}, ${tapCode})`
}

function exactKeycodeMatch(query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return null
  return KEYCODES.find((k) => k.code.toLowerCase() === q)
    ?? KEYCODES.find((k) => k.label.toLowerCase() === q)
    ?? null
}

const EVENT_CODE_TO_QMK: Record<string, string> = {
  Space:       'KC_SPACE',
  Escape:      'KC_ESC',
  Backspace:   'KC_BSPC',
  Enter:       'KC_ENT',
  Tab:         'KC_TAB',
  Delete:      'KC_DEL',
  Insert:      'KC_INS',
  CapsLock:    'KC_CAPS',
  ArrowUp:     'KC_UP',
  ArrowDown:   'KC_DOWN',
  ArrowLeft:   'KC_LEFT',
  ArrowRight:  'KC_RGHT',
  Home:        'KC_HOME',
  End:         'KC_END',
  PageUp:      'KC_PGUP',
  PageDown:    'KC_PGDN',
  PrintScreen: 'KC_PSCR',
  ScrollLock:  'KC_SCRL',
  Pause:       'KC_PAUS',
  NumLock:     'KC_NLCK',
  Minus:       'KC_MINUS',
  Equal:       'KC_EQUAL',
  BracketLeft: 'KC_LBRC',
  BracketRight:'KC_RBRC',
  Backslash:   'KC_BSLS',
  Semicolon:   'KC_SCLN',
  Quote:       'KC_QUOT',
  Backquote:   'KC_GRV',
  Comma:       'KC_COMM',
  Period:      'KC_DOT',
  Slash:       'KC_SLSH',
  AudioVolumeMute: 'KC_MUTE',
  AudioVolumeUp:   'KC_VOLU',
  AudioVolumeDown: 'KC_VOLD',
  MediaPlayPause:  'KC_MPLY',
  MediaTrackNext:  'KC_MNXT',
  MediaTrackPrevious: 'KC_MPRV',
  MediaStop:       'KC_MSTP',
}

const EVENT_KEY_TO_QMK: Record<string, string> = {
  ' ':           'KC_SPACE',
  Escape:        'KC_ESC',
  Backspace:     'KC_BSPC',
  Enter:         'KC_ENT',
  Tab:           'KC_TAB',
  Delete:        'KC_DEL',
  Insert:        'KC_INS',
  CapsLock:      'KC_CAPS',
  ArrowUp:       'KC_UP',
  ArrowDown:     'KC_DOWN',
  ArrowLeft:     'KC_LEFT',
  ArrowRight:    'KC_RGHT',
  Home:          'KC_HOME',
  End:           'KC_END',
  PageUp:        'KC_PGUP',
  PageDown:      'KC_PGDN',
  PrintScreen:   'KC_PSCR',
  ScrollLock:    'KC_SCRL',
  Pause:         'KC_PAUS',
  NumLock:       'KC_NLCK',
  AudioVolumeMute: 'KC_MUTE',
  AudioVolumeUp:   'KC_VOLU',
  AudioVolumeDown: 'KC_VOLD',
  MediaPlayPause:  'KC_MPLY',
  MediaTrackNext:  'KC_MNXT',
  MediaTrackPrevious: 'KC_MPRV',
  MediaStop:       'KC_MSTP',
}

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta'])

function eventToBaseKeycode(e: KeyboardEvent | React.KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null
  if (/^Key[A-Z]$/.test(e.code)) return `KC_${e.code.slice(3)}`
  if (/^Digit[0-9]$/.test(e.code)) return `KC_${e.code.slice(5)}`
  if (/^F([1-9]|1[0-2])$/.test(e.key)) return `KC_${e.key}`
  if (/^Numpad[0-9]$/.test(e.code)) return `KC_P${e.code.slice(6)}`
  if (e.code === 'NumpadAdd') return 'KC_PPLS'
  if (e.code === 'NumpadSubtract') return 'KC_PMNS'
  if (e.code === 'NumpadMultiply') return 'KC_PAST'
  if (e.code === 'NumpadDivide') return 'KC_PSLS'
  if (e.code === 'NumpadEnter') return 'KC_PENT'
  if (e.code === 'NumpadDecimal') return 'KC_PDOT'
  return EVENT_CODE_TO_QMK[e.code] ?? EVENT_KEY_TO_QMK[e.key] ?? null
}

function shortcutConflictWarning(baseCode: string, mods: Partial<Record<ModKey, boolean>>): string | undefined {
  const ctrl = !!mods.ctrl
  const shift = !!mods.shift
  const alt = !!mods.alt
  const gui = !!mods.gui
  const browserCtrlKeys = new Set(['KC_W', 'KC_R', 'KC_L', 'KC_T', 'KC_N', 'KC_O', 'KC_P', 'KC_S', 'KC_F'])

  if (ctrl && shift && ['KC_T', 'KC_N', 'KC_R'].includes(baseCode)) {
    return 'Browser may intercept this shortcut before QMK Nexus can capture it.'
  }
  if (ctrl && browserCtrlKeys.has(baseCode)) {
    return 'Browser may close, reload, focus the address bar, or open browser UI for this shortcut.'
  }
  if (alt && ['KC_LEFT', 'KC_RGHT', 'KC_HOME'].includes(baseCode)) {
    return 'Browser may navigate history for this shortcut.'
  }
  if (gui) {
    return 'Operating system may intercept OS-key shortcuts before the browser receives them.'
  }
  if (!ctrl && !alt && !gui && ['KC_F1', 'KC_F3', 'KC_F5', 'KC_F6', 'KC_F11', 'KC_F12'].includes(baseCode)) {
    return 'Browser may reserve this function key.'
  }
  if (['KC_MPLY', 'KC_MSTP', 'KC_MPRV', 'KC_MNXT', 'KC_MUTE', 'KC_VOLU', 'KC_VOLD', 'KC_BRIU', 'KC_BRID'].includes(baseCode)) {
    return 'Operating system or browser may intercept media/function keys.'
  }
  return undefined
}

function keyboardEventToShortcut(e: KeyboardEvent | React.KeyboardEvent): CapturedShortcut | null {
  const baseCode = eventToBaseKeycode(e)
  if (!baseCode) return null
  const eventMods: Partial<Record<ModKey, boolean>> = {
    ctrl: e.ctrlKey,
    shift: e.shiftKey,
    alt: e.altKey,
    gui: e.metaKey,
  }
  const code = wrapMods(baseCode, eventMods)
  const parts = [
    e.ctrlKey ? 'Ctrl' : null,
    e.shiftKey ? 'Shift' : null,
    e.altKey ? 'Alt' : null,
    e.metaKey ? 'OS' : null,
    keycodeMap.get(baseCode)?.label ?? baseCode.replace(/^KC_/, ''),
  ].filter(Boolean)
  return {
    code,
    label: parts.join('+'),
    warning: shortcutConflictWarning(baseCode, eventMods),
  }
}

export function KeycodePicker({ onSelect, onClose, currentCode = '', layerCount = 5, inline = false }: Props) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('basic')
  const [mods, setMods] = useState<Partial<Record<ModKey, boolean>>>({})
  const [holdTap, setHoldTap] = useState(false)
  const [tapCode, setTapCode] = useState('')
  const [holdMods, setHoldMods] = useState<Partial<Record<ModKey, boolean>>>({})
  const [holdLayer, setHoldLayer] = useState<number | null>(null)
  const [tapSearch, setTapSearch] = useState('')
  const [captureMode, setCaptureMode] = useState(false)
  const [capturedShortcut, setCapturedShortcut] = useState<CapturedShortcut | null>(null)
  const [manualCode, setManualCode] = useState('')
  const [shortcutNotice, setShortcutNotice] = useState('')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    if (!captureMode) return
    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.repeat) return
      if (MODIFIER_KEYS.has(e.key)) {
        setShortcutNotice('Hold modifiers, then press the non-modifier key to capture a shortcut.')
        return
      }
      const shortcut = keyboardEventToShortcut(e)
      if (!shortcut) {
        setShortcutNotice('Could not map that key. Use manual QMK entry below.')
        return
      }
      setCapturedShortcut(shortcut)
      setShortcutNotice(shortcut.warning ?? 'Shortcut captured. Review and assign.')
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [captureMode])

  const features = useKeyboardStore((s) => s.config.features)

  const availableKeycodes = useMemo(
    () => KEYCODES.filter((k) => isKeycodeAvailable(k, features)),
    [features],
  )

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return availableKeycodes.filter((k) => {
      if (q) return k.code.toLowerCase().includes(q) || k.label.toLowerCase().includes(q)
      return k.category === category
    })
  }, [search, category, availableKeycodes])

  const tapFiltered = useMemo(() => {
    const q = tapSearch.toLowerCase()
    return availableKeycodes.filter((k) =>
      !q || k.code.toLowerCase().includes(q) || k.label.toLowerCase().includes(q)
    )
  }, [tapSearch, availableKeycodes])

  function handlePickKey(code: string) {
    if (holdTap) {
      setTapCode(code)
      return
    }
    const final = wrapMods(code, mods)
    onSelect(final)
    onClose()
  }

  function handleAssignCaptured() {
    if (!capturedShortcut) return
    onSelect(capturedShortcut.code)
    onClose()
  }

  function handleAssignManual() {
    const code = manualCode.trim()
    if (!code) return
    onSelect(code)
    onClose()
  }

  function handleAssignHoldTap() {
    if (!tapCode) return
    let final: string
    if (holdLayer !== null) {
      final = buildLT(tapCode, holdLayer)
    } else {
      final = buildMT(tapCode, holdMods)
    }
    onSelect(final)
    onClose()
  }

  function handleClearKey() {
    onSelect('KC_NO')
    onClose()
  }

  function handleShortcutConflictKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const shortcut = keyboardEventToShortcut(e)
    if (!shortcut?.warning) return false
    e.preventDefault()
    e.stopPropagation()
    setCaptureMode(false)
    setCapturedShortcut(shortcut)
    setShortcutNotice(`${shortcut.warning} Captured ${shortcut.label}; assign captured or enter QMK manually.`)
    return true
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (handleShortcutConflictKeyDown(e)) return
    if (!search) {
      const blankKeyMap: Record<string, string> = {
        ' ':           'KC_SPACE',
        'Escape':      'KC_ESC',
        'Backspace':   'KC_BSPC',
        'Enter':       'KC_ENT',
        'Tab':         'KC_TAB',
        'Delete':      'KC_DEL',
        'Insert':      'KC_INS',
        'CapsLock':    'KC_CAPS',
        'Control':     'KC_LCTL',
        'Shift':       'KC_LSFT',
        'Alt':         'KC_LALT',
        'Meta':        'KC_LGUI',
        'ArrowUp':     'KC_UP',
        'ArrowDown':   'KC_DOWN',
        'ArrowLeft':   'KC_LEFT',
        'ArrowRight':  'KC_RGHT',
        'Home':        'KC_HOME',
        'End':         'KC_END',
        'PageUp':      'KC_PGUP',
        'PageDown':    'KC_PGDN',
        'PrintScreen': 'KC_PSCR',
        'ScrollLock':  'KC_SCRL',
        'Pause':       'KC_PAUS',
        'NumLock':     'KC_NLCK',
        'F1':  'KC_F1',  'F2':  'KC_F2',  'F3':  'KC_F3',  'F4':  'KC_F4',
        'F5':  'KC_F5',  'F6':  'KC_F6',  'F7':  'KC_F7',  'F8':  'KC_F8',
        'F9':  'KC_F9',  'F10': 'KC_F10', 'F11': 'KC_F11', 'F12': 'KC_F12',
      }
      const code = blankKeyMap[e.key]
      if (code) {
        e.preventDefault()
        e.stopPropagation()
        handlePickKey(code)
        return
      }
    }
    if (e.key !== 'Enter') return
    const exact = exactKeycodeMatch(search)
    if (!exact) return
    e.preventDefault()
    handlePickKey(exact.code)
  }

  function handleTapSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (handleShortcutConflictKeyDown(e)) return
    if (e.key !== 'Enter') return
    const exact = exactKeycodeMatch(tapSearch)
    if (!exact) return
    e.preventDefault()
    setTapCode(exact.code)
  }

  function toggleMod(key: ModKey) {
    setMods((m) => ({ ...m, [key]: !m[key] }))
  }

  function toggleHoldMod(key: ModKey) {
    setHoldMods((m) => ({ ...m, [key]: !m[key] }))
    setHoldLayer(null)
  }

  const tapLabel = tapCode ? (keycodeMap.get(tapCode)?.label ?? tapCode) : ''

  const inner = (
    <>
      <div className={styles.holdTapRow}>
        <button
          className={`${styles.toggleBtn} ${holdTap ? styles.toggleActive : ''}`}
          onClick={() => { setHoldTap((v) => !v); setTapCode('') }}
          title="Create a key that sends one code when tapped and another action when held"
        >
          Hold / Tap
        </button>
        <button
          className={styles.clearBtn}
          onClick={handleClearKey}
          title="Clear this key on the current layer by assigning KC_NO"
          aria-label="Clear key on this layer"
        >
          Clear Key
        </button>
        {holdTap && tapCode && (
          <span className={styles.tapPreview}>Tap: <strong>{tapLabel}</strong></span>
        )}
      </div>

      {holdTap ? (
        <div className={styles.holdTapLayout}>
          <div className={styles.holdSection}>
            <span className={styles.sectionLabel}>Hold action</span>
            <div className={styles.modRow}>
              {MT_MODS.map((m) => (
                <button
                  key={m.key}
                  className={`${styles.modBtn} ${holdMods[m.key] ? styles.modActive : ''}`}
                  onClick={() => toggleHoldMod(m.key)}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className={styles.layerRow}>
              <span className={styles.sectionLabel}>or Layer:</span>
              <div className={styles.layerBtns}>
                {Array.from({ length: Math.max(0, layerCount - 1) }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    className={`${styles.modBtn} ${holdLayer === n ? styles.modActive : ''}`}
                    onClick={() => { setHoldLayer(holdLayer === n ? null : n); setHoldMods({}) }}
                  >
                    L{n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className={styles.tapSection}>
            <span className={styles.sectionLabel}>Tap key {tapCode && `→ ${tapLabel}`}</span>
            <input
              autoFocus={!inline}
              placeholder="Search tap key…"
              value={tapSearch}
              onChange={(e) => setTapSearch(e.target.value)}
              onKeyDown={handleTapSearchKeyDown}
              className={styles.searchInput}
            />
            <div className={`${styles.grid} ${styles.gridCompact}`}>
              {tapFiltered.slice(0, 60).map((k) => (
                <button
                  key={k.code}
                  title={k.code}
                  onClick={() => setTapCode(k.code)}
                  className={`${styles.cell} ${k.shifted ? '' : styles.cellSingle} ${tapCode === k.code ? styles.cellActive : ''}`}
                >
                  {k.shifted && <span className={styles.cellTop}>{k.shifted.label}</span>}
                  <span className={k.shifted ? styles.cellBottom : undefined}>{k.label}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            className={styles.assignBtn}
            onClick={handleAssignHoldTap}
            disabled={!tapCode || (Object.values(holdMods).every((v) => !v) && holdLayer === null)}
            title="Assign this hold/tap keycode"
          >
            Assign
          </button>
        </div>
      ) : (
        <>
          <div className={styles.searchBar}>
            <input
              autoFocus={!inline}
              placeholder="Search keycodes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className={styles.searchInput}
            />
          </div>

          {!search && (
            <div className={styles.chips}>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  className={`${styles.chip} ${category === cat.id ? styles.chipActive : ''}`}
                  onClick={() => setCategory(cat.id)}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          )}

          <div className={styles.modRow}>
            {MODS.map((m) => (
              <button
                key={m.key}
                className={`${styles.modBtn} ${mods[m.key] ? styles.modActive : ''}`}
                onClick={() => toggleMod(m.key)}
                title={`Wrap with ${m.qmk}()`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className={styles.shortcutPanel}>
            <div className={styles.shortcutHeader}>
              <button
                className={`${styles.captureBtn} ${captureMode ? styles.captureActive : ''}`}
                onClick={() => {
                  setCaptureMode((v) => !v)
                  setCapturedShortcut(null)
                  setShortcutNotice('')
                }}
                title="Capture browser-conflicting shortcuts safely before assigning them"
              >
                {captureMode ? 'Capturing… press shortcut' : 'Capture shortcut'}
              </button>
              <span className={styles.shortcutHint}>
                Use for Ctrl+W, Ctrl+R, Alt+Left, function/media keys.
              </span>
            </div>
            {capturedShortcut && (
              <div className={styles.capturePreview}>
                <span>
                  Captured <strong>{capturedShortcut.label}</strong> → <code>{capturedShortcut.code}</code>
                </span>
                <button className={styles.assignSmallBtn} onClick={handleAssignCaptured}>
                  Assign captured
                </button>
              </div>
            )}
            {shortcutNotice && (
              <div className={capturedShortcut?.warning ? styles.shortcutWarning : styles.shortcutNotice}>
                {shortcutNotice}
              </div>
            )}
            <div className={styles.manualEntry}>
              <input
                placeholder="Manual QMK code, e.g. LCTL(KC_W)"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                onFocus={() => setCaptureMode(false)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  handleAssignManual()
                }}
                className={styles.manualInput}
              />
              <button
                className={styles.assignSmallBtn}
                onClick={handleAssignManual}
                disabled={!manualCode.trim()}
              >
                Assign manual
              </button>
            </div>
          </div>

          <div className={styles.grid}>
            {filtered.map((k) => (
              <button
                key={k.code}
                title={`${k.code}${k.description ? ` — ${k.description}` : ''}`}
                onClick={() => handlePickKey(k.code)}
                className={`${styles.cell} ${k.shifted ? '' : styles.cellSingle} ${currentCode === k.code ? styles.cellActive : ''}`}
              >
                {k.shifted && <span className={styles.cellTop}>{k.shifted.label}</span>}
                <span className={k.shifted ? styles.cellBottom : undefined}>{k.label}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <span className={styles.empty}>No keycodes match</span>
            )}
          </div>
        </>
      )}
    </>
  )

  if (inline) {
    return <div className={styles.inlineRoot}>{inner}</div>
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      className={styles.overlay}
    >
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>Assign Keycode</span>
          <button onClick={onClose} className={styles.closeBtn}>×</button>
        </div>

        {inner}
      </div>
    </div>
  )
}
