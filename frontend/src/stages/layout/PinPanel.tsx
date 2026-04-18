import { useKeyboardStore } from '@/store/keyboard'
import styles from './PinPanel.module.css'

export default function PinPanel() {
  const { config, setConfig } = useKeyboardStore()

  const rowCount = config.keys.reduce((max, k) =>
    k.row !== null ? Math.max(max, k.row + 1) : max, 0)
  const colCount = config.keys.reduce((max, k) =>
    k.col !== null ? Math.max(max, k.col + 1) : max, 0)

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

  if (rowCount === 0 && colCount === 0) {
    return (
      <div className={styles.empty}>
        Assign row/col to keys first, then map pins here.
      </div>
    )
  }

  return (
    <div className={styles.panel}>
      {rowCount > 0 && (
        <section>
          <h4 className={styles.sectionTitle}>Row Pins</h4>
          {Array.from({ length: rowCount }, (_, i) => (
            <div key={i} className={styles.pinRow}>
              <span className={styles.pinLabel}>Row {i}</span>
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

      {colCount > 0 && (
        <section>
          <h4 className={styles.sectionTitle}>Col Pins</h4>
          {Array.from({ length: colCount }, (_, i) => (
            <div key={i} className={styles.pinRow}>
              <span className={styles.pinLabel}>Col {i}</span>
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
