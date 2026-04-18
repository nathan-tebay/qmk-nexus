import { useKeyboardStore, type KeyDef } from '@/store/keyboard'
import styles from './Toolbar.module.css'
import { nanoid } from './nanoid'

interface Props {
  showMatrix: boolean
  onToggleMatrix: () => void
  onFitView: () => void
}

const KEY_SIZES: { label: string; w: number; h: number }[] = [
  { label: '1u', w: 1, h: 1 },
  { label: '1.25u', w: 1.25, h: 1 },
  { label: '1.5u', w: 1.5, h: 1 },
  { label: '1.75u', w: 1.75, h: 1 },
  { label: '2u', w: 2, h: 1 },
  { label: '2.25u', w: 2.25, h: 1 },
  { label: '2.75u', w: 2.75, h: 1 },
  { label: 'ISO Enter', w: 1.5, h: 2 },
]

export default function Toolbar({ showMatrix, onToggleMatrix, onFitView }: Props) {
  const { config, selectedKeyId, addKey, removeKey } = useKeyboardStore()

  const WRAP_U = 15

  function addNewKey(w: number, h: number) {
    const existing = config.keys
    let nextX = 0
    let nextY = 0

    if (existing.length > 0) {
      const lastRowKeys = existing.filter((k) => k.y === Math.max(...existing.map((k2) => k2.y)))
      const curX = Math.max(...existing.map((k) => k.x + k.w))
      const maxY = Math.max(...existing.map((k) => k.y + k.h))

      if (curX + w > WRAP_U) {
        nextX = 0
        nextY = maxY
      } else {
        nextX = curX
        nextY = lastRowKeys[0]?.y ?? 0
      }
    }

    const key: KeyDef = {
      id: nanoid(),
      x: nextX,
      y: nextY,
      w,
      h,
      rotation: 0,
      label: '',
      row: null,
      col: null,
      ledIndex: null,
    }
    addKey(key)
  }

  function handleDelete() {
    if (selectedKeyId) removeKey(selectedKeyId)
  }

  return (
    <div className={styles.toolbar}>
      <div className={styles.group}>
        <span className={styles.groupLabel}>Add Key</span>
        <div className={styles.sizeGrid}>
          {KEY_SIZES.map((s) => (
            <button
              key={s.label}
              className={styles.sizeBtn}
              onClick={() => addNewKey(s.w, s.h)}
              title={`Add ${s.label} key`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.group}>
        <span className={styles.groupLabel}>View</span>
        <button
          className={`${styles.toggleBtn} ${showMatrix ? styles.active : ''}`}
          onClick={onToggleMatrix}
        >
          {showMatrix ? 'Matrix On' : 'Matrix Off'}
        </button>
        <button className={styles.toggleBtn} onClick={onFitView}>
          Fit
        </button>
      </div>

      <div className={styles.group}>
        <button
          className={styles.deleteBtn}
          onClick={handleDelete}
          disabled={!selectedKeyId}
        >
          Delete Key
        </button>
      </div>
    </div>
  )
}
