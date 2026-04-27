import { useState, useEffect, useRef } from 'react'
import { qmkApi, type QMKKeyboardSummary } from '@/api/keyboards'
import { useKeyboardStore } from '@/store/keyboard'
import styles from './QMKImportModal.module.css'

interface Props {
  onClose: () => void
}

export default function QMKImportModal({ onClose }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<QMKKeyboardSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
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

  async function handleImport(entry: QMKKeyboardSummary) {
    setImporting(entry.path)
    setError(null)
    try {
      const config = await qmkApi.importKeyboard(entry.path)
      setConfig(config)
      onClose()
    } catch {
      setError(`Failed to import ${entry.name}`)
      setImporting(null)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose()
  }

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal} onKeyDown={handleKeyDown}>
        <div className={styles.header}>
          <span className={styles.title}>Import QMK Keyboard</span>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        <div className={styles.search}>
          <input
            ref={searchRef}
            className={styles.searchInput}
            placeholder="Search by name, manufacturer, or path…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.results}>
          {loading && results.length === 0 && (
            <div className={styles.empty}>Loading index…</div>
          )}
          {!loading && results.length === 0 && (
            <div className={styles.empty}>
              No keyboards found.
              {!query && <span style={{ display: 'block', marginTop: 6, fontSize: 13.75, color: 'var(--text-muted)' }}>
                The QMK keyboard index is empty. Populate <code>qmk_firmware/keyboards/</code> with QMK source files to enable import.
              </span>}
            </div>
          )}
          {results.map((entry) => (
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
                disabled={importing === entry.path}
              >
                {importing === entry.path ? '…' : 'Import'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
