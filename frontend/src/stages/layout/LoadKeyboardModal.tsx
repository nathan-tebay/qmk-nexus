import { useState, useEffect, useRef } from 'react'
import { useKeyboardStore, type KeyboardConfig } from '@/store/keyboard'
import { useBuildStore } from '@/store/build'
import { useAuthStore } from '@/store/auth'
import { keyboardsApi, qmkApi, type QMKKeyboardSummary } from '@/api/keyboards'
import { MAX_KEY_COUNT } from '@/utils/validateKeyboardConfig'
import styles from './LoadKeyboardModal.module.css'

interface Props {
  onClose: () => void
  initialTab?: 'user' | 'qmk'
}

type Tab = 'user' | 'qmk'
type QMKImportMode = 'nexus' | 'legacy'

const MAX_KEYBOARDS = 20

export default function LoadKeyboardModal({ onClose, initialTab = 'user' }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab)

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose()
  }

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal} onKeyDown={handleKeyDown}>
        <div className={styles.header}>
          <span className={styles.title}>Load Keyboard</span>
          <button className={styles.closeBtn} onClick={onClose} title="Close keyboard loader" aria-label="Close keyboard loader">×</button>
        </div>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === 'user' ? styles.activeTab : ''}`}
            onClick={() => setTab('user')}
            title="Show keyboards saved to your account"
            aria-label="Show saved keyboards"
          >
            User Keyboards
          </button>
          <button
            className={`${styles.tab} ${tab === 'qmk' ? styles.activeTab : ''}`}
            onClick={() => setTab('qmk')}
            title="Search and import keyboards from the QMK index"
            aria-label="Show QMK keyboards"
          >
            QMK Keyboards
          </button>
        </div>
        {tab === 'user'
          ? <UserKeyboardsPanel onClose={onClose} />
          : <QMKKeyboardsPanel onClose={onClose} />
        }
      </div>
    </div>
  )
}

function UserKeyboardsPanel({ onClose }: { onClose: () => void }) {
  const { config, setConfig } = useKeyboardStore()
  const user = useAuthStore((state) => state.user)
  const [keyboards, setKeyboards] = useState<KeyboardConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function loadKeyboards() {
    setLoading(true)
    setError(null)
    keyboardsApi.list()
      .then(setKeyboards)
      .catch(() => setError('Failed to load keyboards'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (user) loadKeyboards()
    else setLoading(false)
  }, [user])

  function handleLoad(kb: KeyboardConfig) {
    setConfig(kb as Partial<KeyboardConfig>)
    useBuildStore.getState().clearActiveBuild()
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
        split_keyboard: false, nkro: true, bootmagic: true, mousekeys: false, extrakeys: true,
        pointing_device: false,
      },
    })
    useBuildStore.getState().clearActiveBuild()
    onClose()
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this keyboard? This cannot be undone.')) return
    setDeleting(id)
    try {
      await keyboardsApi.delete(id)
      setKeyboards((prev) => prev.filter((k) => k.id !== id))
      if (config.id === id) setConfig({ id: null })
    } catch {
      setError('Delete failed')
    } finally {
      setDeleting(null)
    }
  }

  if (!user) {
    return (
      <>
        <div className={styles.empty}>
          Sign in to save/load account keyboards. Your current draft still auto-saves locally in this browser; clearing browser data can delete anonymous work.
        </div>
        <div className={styles.footer}>
          <button className={styles.newBtn} onClick={handleNew} title="Start a blank local draft">
            + New Local Draft
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      {error && (
        <div className={styles.error}>
          {error}&nbsp;
          <button className={styles.loadBtn} onClick={loadKeyboards}>Retry</button>
        </div>
      )}
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
              {kb.id !== config.id
                ? (
                  <button
                    className={styles.loadBtn}
                    onClick={() => handleLoad(kb)}
                    title={keyLimitExceeded ? `Keyboard has ${kb.keys.length} keys; maximum is ${MAX_KEY_COUNT}` : `Load ${kb.name}`}
                    aria-label={`Load ${kb.name}`}
                    disabled={keyLimitExceeded}
                  >
                    Load
                  </button>
                )
                : <span className={styles.current}>current</span>
              }
              <button
                className={styles.deleteBtn}
                onClick={() => handleDelete(kb.id!)}
                disabled={deleting === kb.id}
                title={`Delete ${kb.name}`}
                aria-label={`Delete ${kb.name}`}
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
          title={keyboards.length >= MAX_KEYBOARDS ? `Limit of ${MAX_KEYBOARDS} reached` : 'Create a new blank keyboard'}
          aria-label="Create new keyboard"
        >
          + New Keyboard
        </button>
        <span className={styles.count}>{keyboards.length} / {MAX_KEYBOARDS}</span>
        {keyboards.length >= MAX_KEYBOARDS && (
          <span className={styles.limitNote}>Delete a keyboard to create a new one</span>
        )}
      </div>
    </>
  )
}

function QMKKeyboardsPanel({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<QMKKeyboardSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState<string | null>(null)
  const [fileImporting, setFileImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [importMode, setImportMode] = useState<QMKImportMode>('nexus')
  const user = useAuthStore((state) => state.user)
  const [pendingConfirm, setPendingConfirm] = useState<{ entry: QMKKeyboardSummary; config: KeyboardConfig } | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { setConfig } = useKeyboardStore()

  useEffect(() => {
    searchRef.current?.focus()
    doSearch('')
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(query), 250)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  async function doSearch(q: string) {
    setLoading(true)
    setError(null)
    try {
      const data = await qmkApi.search(q)
      setResults(data)
    } catch {
      setError('Failed to load keyboard index')
    } finally {
      setLoading(false)
    }
  }

  async function applyImportedConfig(imported: KeyboardConfig) {
    if (imported.keys.length > MAX_KEY_COUNT) {
      throw new Error(`Keyboard has ${imported.keys.length} keys; maximum is ${MAX_KEY_COUNT}.`)
    }

    const existingId = useKeyboardStore.getState().config.id
    if (user && existingId) {
      const merged: KeyboardConfig = { ...imported, id: existingId }
      await keyboardsApi.update(existingId, merged)
      setConfig(merged)
    } else {
      setConfig(user ? imported : { ...imported, id: null })
    }
    useBuildStore.getState().clearActiveBuild()
    onClose()
  }

  async function handleImport(entry: QMKKeyboardSummary) {
    setImporting(entry.path)
    setError(null)
    try {
      const imported = await qmkApi.importKeyboard(entry.path, { layoutOnly: importMode === 'nexus' })
      const hasPositionedPeripherals =
        (imported.oleds?.length ?? 0) > 0 ||
        (imported.encoders?.length ?? 0) > 0 ||
        (imported.trackballs?.length ?? 0) > 0

      if (hasPositionedPeripherals) {
        setPendingConfirm({ entry, config: imported })
        setImporting(null)
        return
      }

      await applyImportedConfig(imported)
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to import ${entry.name}`)
      setImporting(null)
      setPendingConfirm(null)
    }
  }

  async function confirmImport() {
    if (!pendingConfirm) return
    setImporting(pendingConfirm.entry.path)
    setError(null)
    try {
      await applyImportedConfig(pendingConfirm.config)
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to import ${pendingConfirm.entry.name}`)
      setImporting(null)
      setPendingConfirm(null)
    }
  }

  async function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0]
    e.currentTarget.value = ''
    if (!file) return

    setFileImporting(true)
    setError(null)
    try {
      const imported = await qmkApi.importConfiguratorFile(file, { anonymous: !user })
      if (imported.keys.length > MAX_KEY_COUNT) {
        throw new Error(`Keyboard has ${imported.keys.length} keys; maximum is ${MAX_KEY_COUNT}.`)
      }
      setConfig(user ? imported : { ...imported, id: null })
      useBuildStore.getState().clearActiveBuild()
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to import QMK download file'
      setError(message)
    } finally {
      setFileImporting(false)
    }
  }

  return (
    <>
      <div className={styles.search}>
        <div className={styles.fileImport}>
          <div>
            <strong>Load QMK Download File</strong>
            <span>Import a downloaded QMK Configurator JSON or ZIP keymap.</span>
          </div>
          <input
            ref={fileInputRef}
            className={styles.hiddenFileInput}
            type="file"
            accept=".json,.zip,application/json,application/zip"
            onChange={handleFileImport}
          />
          <button
            className={styles.importBtn}
            onClick={() => fileInputRef.current?.click()}
            disabled={fileImporting}
            title="Choose a QMK Configurator JSON or ZIP download"
            aria-label="Choose QMK download file"
          >
            {fileImporting ? 'Importing…' : 'Choose File'}
          </button>
        </div>
        <input
          ref={searchRef}
          className={styles.searchInput}
          placeholder="Search by name, manufacturer, or path…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className={styles.importModeGroup} role="radiogroup" aria-label="QMK import mode">
          <label className={`${styles.importMode} ${importMode === 'nexus' ? styles.importModeActive : ''}`}>
            <input
              type="radio"
              name="qmk-import-mode"
              checked={importMode === 'nexus'}
              onChange={() => setImportMode('nexus')}
            />
            <span>
              <strong>Nexus</strong>
              <small>Default. Import as a generated Nexus keyboard, using QMK metadata, pins, keymap, wiring, features, and peripherals where available.</small>
            </span>
          </label>
          <label className={`${styles.importMode} ${importMode === 'legacy' ? styles.importModeActive : ''}`}>
            <input
              type="radio"
              name="qmk-import-mode"
              checked={importMode === 'legacy'}
              onChange={() => setImportMode('legacy')}
            />
            <span>
              <strong>QMK Legacy</strong>
              <small>Use upstream QMK build behavior. Select this only when Nexus imports run into firmware build or flashing problems.</small>
            </span>
          </label>
        </div>
      </div>
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.results}>
        {loading && results.length === 0 && <div className={styles.empty}>Loading index…</div>}
        {!loading && results.length === 0 && (
          <div className={styles.empty}>
            No keyboards found.
            {!query && (
              <span style={{ display: 'block', marginTop: 6, fontSize: 13.75, color: 'var(--text-muted)' }}>
                The QMK keyboard index is empty. Populate <code>qmk_firmware/keyboards/</code> to enable import.
              </span>
            )}
          </div>
        )}
        {results.map((entry) => {
          const keyLimitExceeded = entry.key_count > MAX_KEY_COUNT
          return (
          <div key={entry.path} className={styles.row}>
            <div className={styles.info}>
              <span className={styles.name}>{entry.name || entry.path}</span>
              <span className={styles.meta}>
                {entry.manufacturer && <span>{entry.manufacturer}</span>}
                <span className={styles.badge}>{entry.mcu}</span>
                <span className={styles.badge}>{entry.key_count} keys</span>
                <span className={styles.path}>{entry.path}</span>
              </span>
            </div>
            <button
              className={styles.importBtn}
              onClick={() => handleImport(entry)}
              disabled={importing === entry.path || keyLimitExceeded}
              title={keyLimitExceeded
                ? `Keyboard has ${entry.key_count} keys; maximum is ${MAX_KEY_COUNT}`
                : importMode === 'nexus'
                ? `Import ${entry.name || entry.path} as a generated Nexus keyboard`
                : `Import ${entry.name || entry.path} using QMK Legacy`}
              aria-label={`Import ${entry.name || entry.path}`}
            >
              {importing === entry.path ? '…' : 'Import'}
            </button>
          </div>
          )
        })}
      </div>
      {pendingConfirm && (
        <div className={styles.advisoryOverlay} onClick={(e) => { if (e.target === e.currentTarget) setPendingConfirm(null) }}>
          <div className={styles.advisoryModal} role="dialog" aria-modal="true" aria-labelledby="qmk-import-advisory-title">
            <div className={styles.advisoryHeader}>
              <h3 id="qmk-import-advisory-title">Import QMK Keyboard</h3>
              <button className={styles.closeBtn} onClick={() => setPendingConfirm(null)} title="Cancel import" aria-label="Cancel import">×</button>
            </div>
            <div className={styles.advisoryBody}>
              <p>
                This import includes OLEDs, encoders, or trackballs, check their positions in the Layout stage and reposition them as needed.
              </p>
            </div>
            <div className={styles.advisoryActions}>
              <button
                className={styles.importBtn}
                onClick={confirmImport}
                disabled={importing === pendingConfirm.entry.path}
              >
                {importing === pendingConfirm.entry.path ? 'Importing…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
