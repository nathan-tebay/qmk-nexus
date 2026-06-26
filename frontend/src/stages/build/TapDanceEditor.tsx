import { useKeyboardStore, TapDanceEntry } from '@/store/keyboard'
import { keycodeMap } from '@/stages/keymap/keycodes'
import styles from './TapDanceEditor.module.css'

export default function TapDanceEditor() {
  const tapDances = useKeyboardStore((s) => s.config.tapDances)
  const addTapDance = useKeyboardStore((s) => s.addTapDance)
  const removeTapDance = useKeyboardStore((s) => s.removeTapDance)
  const updateTapDance = useKeyboardStore((s) => s.updateTapDance)

  return (
    <div className={styles.editor}>
      <div className={styles.header}>
        <h3 className={styles.title}>Tap Dance Definitions</h3>
        <button className={styles.addBtn} onClick={addTapDance}>+ Add Tap Dance</button>
      </div>
      {(tapDances ?? []).length === 0 ? (
        <p className={styles.empty}>
          No tap dances defined. Add one to send a different keycode on single vs. double tap, then
          assign <code>TD(0)</code>, <code>TD(1)</code>, … to a key in the Keymap stage.
        </p>
      ) : (
        <div className={styles.list}>
          {(tapDances ?? []).map((td, i) => (
            <TapDanceRow
              key={td.id}
              index={i}
              entry={td}
              onChange={(patch) => updateTapDance(td.id, patch)}
              onRemove={() => removeTapDance(td.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface TapDanceRowProps {
  index: number
  entry: TapDanceEntry
  onChange: (patch: Partial<Omit<TapDanceEntry, 'id'>>) => void
  onRemove: () => void
}

function TapDanceRow({ index, entry, onChange, onRemove }: TapDanceRowProps) {
  const tapValid = isValidKeycode(entry.onTap)
  const doubleValid = isValidKeycode(entry.onDoubleTap)

  return (
    <div className={styles.row}>
      <span className={styles.tdLabel}>TD({index})</span>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>tap</span>
        <input
          className={`${styles.kcInput} ${tapValid ? '' : styles.kcInvalid}`}
          type="text"
          value={entry.onTap}
          placeholder="KC_SPC"
          onChange={(e) => onChange({ onTap: e.target.value })}
          title={tapValid ? undefined : 'Unknown keycode — build may fail'}
        />
      </div>
      <span className={styles.arrow}>↩↩</span>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>double-tap</span>
        <input
          className={`${styles.kcInput} ${doubleValid ? '' : styles.kcInvalid}`}
          type="text"
          value={entry.onDoubleTap}
          placeholder="KC_ENT"
          onChange={(e) => onChange({ onDoubleTap: e.target.value })}
          title={doubleValid ? undefined : 'Unknown keycode — build may fail'}
        />
      </div>
      <button className={styles.removeBtn} onClick={onRemove} title="Remove tap dance">×</button>
    </div>
  )
}

function isValidKeycode(code: string): boolean {
  if (!code) return false
  if (keycodeMap.has(code)) return true
  return /^[A-Z][A-Z0-9_]*\(.+\)$/.test(code) || /^(KC|QK|RM|RGB|UG|BL|MS|AU|EE|DB|DM|GU|CW|MAGIC)_[A-Z0-9_]+$/.test(code)
}
