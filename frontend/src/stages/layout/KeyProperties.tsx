import { useKeyboardStore, type KeyDef } from '@/store/keyboard'
import styles from './KeyProperties.module.css'

export default function KeyProperties() {
  const { config, selectedKeyId, updateKey } = useKeyboardStore()
  const key = config.keys.find((k) => k.id === selectedKeyId)

  if (!key) {
    return (
      <div className={styles.empty}>
        <span>Select a key to edit its properties</span>
      </div>
    )
  }

  function set<K extends keyof KeyDef>(field: K, value: KeyDef[K]) {
    updateKey(key!.id, { [field]: value })
  }

  function num(v: string, fallback: number): number {
    const n = parseFloat(v)
    return isNaN(n) ? fallback : n
  }

  return (
    <div className={styles.panel}>
      <h3 className={styles.title}>Key Properties</h3>

      <Field label="Label">
        <input
          value={key.label}
          onChange={(e) => set('label', e.target.value)}
          placeholder="e.g. Esc"
        />
      </Field>

      <div className={styles.row}>
        <Field label="Width (u)">
          <input
            type="number"
            min={0.25}
            step={0.25}
            value={key.w}
            onChange={(e) => set('w', num(e.target.value, 1))}
          />
        </Field>
        <Field label="Height (u)">
          <input
            type="number"
            min={0.25}
            step={0.25}
            value={key.h}
            onChange={(e) => set('h', num(e.target.value, 1))}
          />
        </Field>
      </div>

      <div className={styles.row}>
        <Field label="X (u)">
          <input
            type="number"
            step={0.25}
            value={key.x}
            onChange={(e) => set('x', num(e.target.value, 0))}
          />
        </Field>
        <Field label="Y (u)">
          <input
            type="number"
            step={0.25}
            value={key.y}
            onChange={(e) => set('y', num(e.target.value, 0))}
          />
        </Field>
      </div>

      <Field label="Rotation (°)">
        <input
          type="number"
          step={1}
          value={key.rotation}
          onChange={(e) => set('rotation', num(e.target.value, 0))}
        />
      </Field>

      <div className={styles.divider} />
      <h3 className={styles.title}>Matrix</h3>

      <div className={styles.row}>
        <Field label="Row">
          <input
            type="number"
            min={0}
            step={1}
            value={key.row ?? ''}
            placeholder="—"
            onChange={(e) =>
              set('row', e.target.value === '' ? null : parseInt(e.target.value))
            }
          />
        </Field>
        <Field label="Col">
          <input
            type="number"
            min={0}
            step={1}
            value={key.col ?? ''}
            placeholder="—"
            onChange={(e) =>
              set('col', e.target.value === '' ? null : parseInt(e.target.value))
            }
          />
        </Field>
      </div>

      <Field label="LED Index">
        <input
          type="number"
          min={0}
          step={1}
          value={key.ledIndex ?? ''}
          placeholder="None"
          onChange={(e) =>
            set('ledIndex', e.target.value === '' ? null : parseInt(e.target.value))
          }
        />
      </Field>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      {children}
    </div>
  )
}
