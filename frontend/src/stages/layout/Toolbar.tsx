import { useKeyboardStore, type KeyDef, type KeyShapeType } from '@/store/keyboard'
import { maxSupportedOleds } from '@/utils/validateKeyboardConfig'
import styles from './Toolbar.module.css'
import { nanoid } from './nanoid'

interface Props {
  showMatrix: boolean
  snapGrid: boolean
  onToggleMatrix: () => void
  onToggleGrid: () => void
  onFitView: () => void
  onImportQMK: () => void
}

const KEY_SIZES: { label: string; w: number; h: number; shape?: KeyShapeType }[] = [
  { label: '1u', w: 1, h: 1 },
  { label: '1.25u', w: 1.25, h: 1 },
  { label: '1.5u', w: 1.5, h: 1 },
  { label: '1.75u', w: 1.75, h: 1 },
  { label: '2u', w: 2, h: 1 },
  { label: '2.25u', w: 2.25, h: 1 },
  { label: '2.75u', w: 2.75, h: 1 },
  { label: 'ISO ↵', w: 1.5, h: 2, shape: 'iso-enter' },
]

export default function Toolbar({ showMatrix, snapGrid, onToggleMatrix, onToggleGrid, onFitView, onImportQMK }: Props) {
  const { config, selectedKeyIds, addKey, removeKey, addEncoder, addOled, addTrackball } = useKeyboardStore()
  const oledLimitReached = (config.oleds?.length ?? 0) >= maxSupportedOleds(config)

  const WRAP_U = 15

  function addNewKey(w: number, h: number, shape: KeyShapeType = 'rect') {
    const existing = config.keys
    let nextX = 0
    let nextY = 0

    if (existing.length > 0) {
      const lastY = Math.max(...existing.map((k) => k.y))
      const lastRowKeys = existing.filter((k) => k.y === lastY)
      const rowRightEdge = Math.max(...lastRowKeys.map((k) => k.x + k.w))
      const maxBottom = Math.max(...existing.map((k) => k.y + k.h))

      if (rowRightEdge + w > WRAP_U) {
        nextX = 0
        nextY = maxBottom
      } else {
        nextX = rowRightEdge
        nextY = lastY
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
      shape,
    }
    addKey(key)
  }

  function handleDelete() {
    for (const id of selectedKeyIds) removeKey(id)
  }

  return (
    <div className={styles.toolbar}>
      <div className={styles.group}>
        <button className={styles.importQmkBtn} onClick={onImportQMK}>
          Load Keyboard
        </button>
      </div>

      <div className={styles.group}>
        <span className={styles.groupLabel}>Add Key</span>
        <div className={styles.sizeGrid}>
          {KEY_SIZES.map((s) => (
            <button
              key={s.label}
              className={styles.sizeBtn}
              onClick={() => addNewKey(s.w, s.h, s.shape)}
              title={`Add ${s.label} key`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.group}>
        <span className={styles.groupLabel}>Add Peripheral</span>
        <button className={styles.sizeBtn} onClick={addEncoder} title="Add rotary encoder">Encoder</button>
        <button
          className={styles.sizeBtn}
          onClick={addOled}
          title={oledLimitReached ? 'Current firmware generator supports 1 OLED, or 2 on split keyboards' : 'Add OLED display'}
          disabled={oledLimitReached}
        >
          OLED
        </button>
        <button className={styles.sizeBtn} onClick={addTrackball} title="Add trackball">Trackball</button>
      </div>

      <div className={styles.group}>
        <span className={styles.groupLabel}>View</span>
        <button
          className={`${styles.toggleBtn} ${showMatrix ? styles.active : ''}`}
          onClick={onToggleMatrix}
        >
          {showMatrix ? 'Matrix On' : 'Matrix Off'}
        </button>
        <button
          className={`${styles.toggleBtn} ${snapGrid ? styles.active : ''}`}
          onClick={onToggleGrid}
        >
          {snapGrid ? 'Grid On' : 'Grid Off'}
        </button>
        <button className={styles.toggleBtn} onClick={onFitView}>
          Fit
        </button>
      </div>

      <div className={styles.group}>
        <button
          className={styles.deleteBtn}
          onClick={handleDelete}
          disabled={selectedKeyIds.length === 0}
        >
          Delete {selectedKeyIds.length > 1 ? `(${selectedKeyIds.length})` : 'Key'}
        </button>
      </div>
    </div>
  )
}
