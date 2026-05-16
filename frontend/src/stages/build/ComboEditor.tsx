import { useKeyboardStore, ComboEntry } from '@/store/keyboard'
import { keycodeMap } from '@/stages/keymap/keycodes'
import styles from './ComboEditor.module.css'

export default function ComboEditor() {
  const keys = useKeyboardStore((s) => s.config.keys)
  const layers = useKeyboardStore((s) => s.config.layers)
  const combos = useKeyboardStore((s) => s.config.combos)
  const addCombo = useKeyboardStore((s) => s.addCombo)
  const removeCombo = useKeyboardStore((s) => s.removeCombo)
  const updateCombo = useKeyboardStore((s) => s.updateCombo)

  const baseKeycodes = layers[0]?.keycodes ?? {}
  const definedKeys = keys.filter((k) => k.row != null && k.col != null)

  return (
    <div className={styles.editor}>
      <div className={styles.header}>
        <h3 className={styles.title}>Combo Definitions</h3>
        <button className={styles.addBtn} onClick={addCombo}>+ Add Combo</button>
      </div>
      {(combos ?? []).length === 0 ? (
        <p className={styles.empty}>No combos defined. Add one to trigger an action when two or more keys are pressed simultaneously.</p>
      ) : (
        <div className={styles.list}>
          {(combos ?? []).map((combo) => (
            <ComboRow
              key={combo.id}
              combo={combo}
              definedKeys={definedKeys}
              baseKeycodes={baseKeycodes}
              onChange={(patch) => updateCombo(combo.id, patch)}
              onRemove={() => removeCombo(combo.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface KeyOption { id: string; row?: number | null; col?: number | null }

interface ComboRowProps {
  combo: ComboEntry
  definedKeys: KeyOption[]
  baseKeycodes: Record<string, string>
  onChange: (patch: Partial<Omit<ComboEntry, 'id'>>) => void
  onRemove: () => void
}

function ComboRow({ combo, definedKeys, baseKeycodes, onChange, onRemove }: ComboRowProps) {
  const keys = combo.keys.length >= 2 ? combo.keys : [...combo.keys, ...Array(2 - combo.keys.length).fill('')]
  const outputValid = isValidKeycode(combo.output)

  function setKey(index: number, keyId: string) {
    const next = [...keys]
    next[index] = keyId
    onChange({ keys: next })
  }

  function addKey() {
    onChange({ keys: [...keys, ''] })
  }

  function removeKey(index: number) {
    if (keys.length <= 2) return
    onChange({ keys: keys.filter((_, i) => i !== index) })
  }

  return (
    <div className={styles.row}>
      <div className={styles.keyList}>
        {keys.map((keyId, i) => (
          <span key={i} className={styles.keySlot}>
            <select
              className={styles.keySelect}
              value={keyId}
              onChange={(e) => setKey(i, e.target.value)}
            >
              <option value="">{`-- key ${i + 1} --`}</option>
              {definedKeys.map((k) => (
                <option key={k.id} value={k.id}>
                  {baseKeycodes[k.id] || k.id}
                </option>
              ))}
            </select>
            {i < keys.length - 1 && <span className={styles.plus}>+</span>}
            {keys.length > 2 && (
              <button
                type="button"
                className={styles.removeKeyBtn}
                onClick={() => removeKey(i)}
                title="Remove this key from combo"
              >
                ×
              </button>
            )}
          </span>
        ))}
        <button type="button" className={styles.addKeyBtn} onClick={addKey} title="Add another trigger key">
          + key
        </button>
      </div>
      <span className={styles.arrow}>→</span>
      <input
        className={`${styles.outputInput} ${outputValid ? '' : styles.outputInvalid}`}
        type="text"
        value={combo.output}
        placeholder="KC_ESC"
        onChange={(e) => onChange({ output: e.target.value })}
        title={outputValid ? undefined : 'Unknown keycode — build may fail'}
      />
      <button className={styles.removeBtn} onClick={onRemove} title="Remove combo">×</button>
    </div>
  )
}

function isValidKeycode(code: string): boolean {
  if (!code) return false
  if (keycodeMap.has(code)) return true
  // Accept layer/mod wrappers: LT(n, KC), MO(n), MT(...), LCTL(...), etc.
  // Bare prefix-known QMK keycodes (e.g. RGB_TOG, BL_UP) when not in the
  // picker (rare). Conservative: passing wrapper syntax + any KC_/QK_/etc.
  return /^[A-Z][A-Z0-9_]*\(.+\)$/.test(code) || /^(KC|QK|RM|RGB|UG|BL|MS|AU|EE|DB|DM|GU|CW|MAGIC)_[A-Z0-9_]+$/.test(code)
}
