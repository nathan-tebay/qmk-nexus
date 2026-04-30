import { useEffect, useState, useMemo } from 'react'
import { KEYCODES, CATEGORIES, keycodeMap } from './keycodes'
import styles from './KeycodePicker.module.css'

interface Props {
  onSelect: (code: string) => void
  onClose: () => void
  currentCode?: string
  layerCount?: number
  inline?: boolean
}

type ModKey = 'ctrl' | 'shift' | 'alt' | 'gui' | 'meh' | 'hyper'

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

export function KeycodePicker({ onSelect, onClose, currentCode = '', layerCount = 5, inline = false }: Props) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('basic')
  const [mods, setMods] = useState<Partial<Record<ModKey, boolean>>>({})
  const [holdTap, setHoldTap] = useState(false)
  const [tapCode, setTapCode] = useState('')
  const [holdMods, setHoldMods] = useState<Partial<Record<ModKey, boolean>>>({})
  const [holdLayer, setHoldLayer] = useState<number | null>(null)
  const [tapSearch, setTapSearch] = useState('')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return KEYCODES.filter((k) => {
      if (q) return k.code.toLowerCase().includes(q) || k.label.toLowerCase().includes(q)
      return k.category === category
    })
  }, [search, category])

  const tapFiltered = useMemo(() => {
    const q = tapSearch.toLowerCase()
    return KEYCODES.filter((k) =>
      !q || k.code.toLowerCase().includes(q) || k.label.toLowerCase().includes(q)
    )
  }, [tapSearch])

  function handlePickKey(code: string) {
    if (holdTap) {
      setTapCode(code)
      return
    }
    const final = wrapMods(code, mods)
    onSelect(final)
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
              className={styles.searchInput}
            />
            <div className={`${styles.grid} ${styles.gridCompact}`}>
              {tapFiltered.slice(0, 60).map((k) => (
                <button
                  key={k.code}
                  title={k.code}
                  onClick={() => setTapCode(k.code)}
                  className={`${styles.cell} ${tapCode === k.code ? styles.cellActive : ''}`}
                >
                  {k.label}
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

          <div className={styles.grid}>
            {filtered.map((k) => (
              <button
                key={k.code}
                title={`${k.code}${k.description ? ` — ${k.description}` : ''}`}
                onClick={() => handlePickKey(k.code)}
                className={`${styles.cell} ${currentCode === k.code ? styles.cellActive : ''}`}
              >
                {k.label}
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
