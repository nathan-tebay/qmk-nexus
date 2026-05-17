import { useState, useEffect } from 'react'
import { useKeyboardStore, type KeyboardConfig } from '@/store/keyboard'
import { keyboardsApi } from '@/api/keyboards'
import { MAX_KEY_COUNT } from '@/utils/validateKeyboardConfig'
import styles from './KeyboardSwitcher.module.css'

const MAX_KEYBOARDS = 20

interface Props {
  onClose: () => void
}

export default function KeyboardSwitcher({ onClose }: Props) {
  const { config, setConfig } = useKeyboardStore()
  const [keyboards, setKeyboards] = useState<KeyboardConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    keyboardsApi.list()
      .then(setKeyboards)
      .catch(() => setError('Failed to load keyboards'))
      .finally(() => setLoading(false))
  }, [])

  function handleLoad(kb: KeyboardConfig) {
    setConfig(kb as Partial<KeyboardConfig>)
    onClose()
  }

  function handleNew() {
    setConfig({
      id: null,
      name: 'New Keyboard',
      mcu: 'atmega32u4',
      usbVid: '0xFEED',
      usbPid: '0x0000',
      manufacturer: '',
      keys: [],
      rowPins: [],
      colPins: [],
      matrixEdges: [],
      layers: [{ id: 'layer0', name: 'Base', keycodes: {} }],
      softSerialPin: 'D0',
      features: {
        rgb_matrix: false, backlight: false, encoder: false, oled: false,
        split_keyboard: false, nkro: true, bootmagic: true, mousekey: false, extrakey: true,
      },
    })
    onClose()
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this keyboard? This cannot be undone.')) return
    setDeleting(id)
    try {
      await keyboardsApi.delete(id)
      setKeyboards((prev) => prev.filter((k) => k.id !== id))
      if (config.id === id) {
        setConfig({ id: null })
      }
    } catch {
      setError('Delete failed')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>My Keyboards</span>
          <span className={styles.count}>{keyboards.length} / {MAX_KEYBOARDS}</span>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.list}>
          {loading && <div className={styles.empty}>Loading…</div>}
          {!loading && keyboards.length === 0 && (
            <div className={styles.empty}>No saved keyboards yet.</div>
          )}
          {keyboards.map((kb) => {
            const keyLimitExceeded = kb.keys.length > MAX_KEY_COUNT
            return (
            <div key={kb.id} className={`${styles.row} ${kb.id === config.id ? styles.active : ''}`}>
              <div className={styles.info}>
                <span className={styles.name}>{kb.name}</span>
                <span className={styles.meta}>
                  <span>{kb.mcu}</span>
                  <span>{kb.keys.length} keys</span>
                </span>
              </div>
              <div className={styles.actions}>
                {kb.id !== config.id && (
                  <button
                    className={styles.loadBtn}
                    onClick={() => handleLoad(kb)}
                    disabled={keyLimitExceeded}
                    title={keyLimitExceeded ? `Keyboard has ${kb.keys.length} keys; maximum is ${MAX_KEY_COUNT}` : undefined}
                  >
                    Load
                  </button>
                )}
                {kb.id === config.id && (
                  <span className={styles.current}>current</span>
                )}
                <button
                  className={styles.deleteBtn}
                  onClick={() => handleDelete(kb.id!)}
                  disabled={deleting === kb.id}
                >
                  {deleting === kb.id ? '…' : '✕'}
                </button>
              </div>
            </div>
            )
          })}
        </div>

        <div className={styles.footer}>
          <button
            className={styles.newBtn}
            onClick={handleNew}
            disabled={keyboards.length >= MAX_KEYBOARDS}
            title={keyboards.length >= MAX_KEYBOARDS ? `Limit of ${MAX_KEYBOARDS} reached` : undefined}
          >
            + New Keyboard
          </button>
          {keyboards.length >= MAX_KEYBOARDS && (
            <span className={styles.limitNote}>Delete a keyboard to create a new one</span>
          )}
        </div>
      </div>
    </div>
  )
}
