import { useKeyboardStore } from '@/store/keyboard'
import styles from './PinPanel.module.css'

export default function PinPanel() {
  const { config, setConfig } = useKeyboardStore()

  const rowCount = config.keys.reduce((max, k) =>
    k.row !== null ? Math.max(max, k.row + 1) : max, 0)
  const colCount = config.keys.reduce((max, k) =>
    k.col !== null ? Math.max(max, k.col + 1) : max, 0)
  const singleKeyDirect = config.keys.length === 1 && rowCount === 0 && colCount === 0
  const splitEnabled = !!config.features['split_keyboard']
  const splitRows = splitEnabled && rowCount % 2 === 0 && rowCount > 0
  const pinRowCount = singleKeyDirect ? 1 : (splitRows ? rowCount / 2 : rowCount)
  const pinColCount = singleKeyDirect ? 1 : colCount

  const hasDirectPins = (config.directPins?.length ?? 0) > 0

  const isQmkNative = config.sourceMode === 'qmk_native'
  const customMatrixCols = isQmkNative && colCount > 0 && config.colPins.length === 0

  function setRowPin(row: number, pin: string) {
    const pins = [...config.rowPins]
    const idx = pins.findIndex((p) => p.row === row)
    if (idx >= 0) pins[idx] = { row, pin }
    else pins.push({ row, pin })
    setConfig({ rowPins: pins })
  }

  function setColPin(col: number, pin: string) {
    const pins = [...config.colPins]
    const idx = pins.findIndex((p) => p.col === col)
    if (idx >= 0) pins[idx] = { col, pin }
    else pins.push({ col, pin })
    setConfig({ colPins: pins })
  }

  function getRowPin(row: number) {
    return config.rowPins.find((p) => p.row === row)?.pin ?? ''
  }

  function getColPin(col: number) {
    return config.colPins.find((p) => p.col === col)?.pin ?? ''
  }

  if (hasDirectPins) {
    return (
      <div className={styles.empty}>
        This keyboard uses a direct-pin matrix — each key connects directly to a GPIO pin.
        <br />
        Pin assignments are embedded in the upstream firmware and managed automatically.
      </div>
    )
  }

  if (pinRowCount === 0 && pinColCount === 0) {
    return (
      <div className={styles.empty}>
        Assign row/col to keys first, then map pins here.
        <br />
        Enable Matrix Mode in the toolbar to wire row/col edges between keys.
      </div>
    )
  }

  return (
    <div className={styles.panel}>
      {pinRowCount > 0 && (
        <section>
          <h4 className={styles.sectionTitle}>{singleKeyDirect ? 'Switch Pins' : 'Row Pins'}</h4>
          {splitRows && (
            <p className={styles.splitHint}>
              Split keyboard — assign pins for one half only (rows 0–{pinRowCount - 1}).
              Both halves use the same row pins.
            </p>
          )}
          {Array.from({ length: pinRowCount }, (_, i) => (
            <div key={i} className={styles.pinRow}>
              <span className={styles.pinLabel}>{singleKeyDirect ? 'Pin A' : `Row ${i}`}</span>
              <input
                value={getRowPin(i)}
                onChange={(e) => setRowPin(i, e.target.value)}
                placeholder="e.g. B0"
                className={styles.pinInput}
              />
            </div>
          ))}
        </section>
      )}

      {customMatrixCols ? (
        <section>
          <h4 className={styles.sectionTitle}>Col Pins</h4>
          <p className={styles.customMatrixNote}>
            This keyboard uses a custom matrix (e.g. shift register) for column scanning.
            Col pins are managed by the keyboard's firmware — no GPIO pin assignments needed here.
          </p>
        </section>
      ) : pinColCount > 0 && (
        <section>
          <h4 className={styles.sectionTitle}>{singleKeyDirect ? 'Return Pin' : 'Col Pins'}</h4>
          {Array.from({ length: pinColCount }, (_, i) => (
            <div key={i} className={styles.pinRow}>
              <span className={styles.pinLabel}>{singleKeyDirect ? 'Pin B' : `Col ${i}`}</span>
              <input
                value={getColPin(i)}
                onChange={(e) => setColPin(i, e.target.value)}
                placeholder="e.g. D0"
                className={styles.pinInput}
              />
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
