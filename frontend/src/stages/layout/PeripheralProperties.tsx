import { useKeyboardStore, type OledElement, type TrackballElement } from '@/store/keyboard'
import styles from './KeyProperties.module.css'

export default function PeripheralProperties() {
  const {
    config,
    selectedPeripheralId,
    selectedPeripheralType,
    updateEncoder,
    removeEncoder,
    updateOled,
    removeOled,
    updateTrackball,
    removeTrackball,
    setSelectedPeripheral,
  } = useKeyboardStore()

  if (!selectedPeripheralId || !selectedPeripheralType) {
    return (
      <div className={styles.empty}>
        <span>Select a peripheral to edit its properties</span>
      </div>
    )
  }

  function num(v: string, fallback: number): number {
    const n = parseFloat(v)
    return isNaN(n) ? fallback : n
  }

  if (selectedPeripheralType === 'encoder') {
    const enc = config.encoders?.find((e) => e.id === selectedPeripheralId)
    if (!enc) return null
    return (
      <div className={styles.panel}>
        <h3 className={styles.title}>Encoder</h3>
        <div className={styles.row}>
          <Field label="X (u)">
            <input type="number" step={0.25} value={enc.x}
              onChange={(e) => updateEncoder(enc.id, { x: num(e.target.value, 0) })} />
          </Field>
          <Field label="Y (u)">
            <input type="number" step={0.25} value={enc.y}
              onChange={(e) => updateEncoder(enc.id, { y: num(e.target.value, 0) })} />
          </Field>
        </div>
        <span className={styles.note}>Pin config in Features + Build → Encoder</span>
        <div className={styles.divider} />
        <button
          className={styles.removeBtn}
          onClick={() => { removeEncoder(enc.id); setSelectedPeripheral(null, null) }}
        >
          Remove Encoder
        </button>
      </div>
    )
  }

  if (selectedPeripheralType === 'oled') {
    const oled = config.oleds?.find((o) => o.id === selectedPeripheralId)
    if (!oled) return null
    return (
      <div className={styles.panel}>
        <h3 className={styles.title}>OLED Display</h3>
        <div className={styles.row}>
          <Field label="X (u)">
            <input type="number" step={0.25} value={oled.x}
              onChange={(e) => updateOled(oled.id, { x: num(e.target.value, 0) })} />
          </Field>
          <Field label="Y (u)">
            <input type="number" step={0.25} value={oled.y}
              onChange={(e) => updateOled(oled.id, { y: num(e.target.value, 0) })} />
          </Field>
        </div>
        <Field label="Rotation (°)">
          <input type="number" step={90} value={oled.rotation}
            onChange={(e) => updateOled(oled.id, { rotation: num(e.target.value, 0) })} />
        </Field>
        <Field label="Display Size">
          <select
            value={oled.displaySize}
            onChange={(e) => updateOled(oled.id, { displaySize: e.target.value as OledElement['displaySize'] })}
          >
            <option value="128_64">128×64</option>
            <option value="128_32">128×32</option>
            <option value="64_48">64×48</option>
            <option value="64_32">64×32</option>
          </select>
        </Field>
        <span className={styles.note}>Pin config in Features + Build → OLED Display</span>
        <div className={styles.divider} />
        <button
          className={styles.removeBtn}
          onClick={() => { removeOled(oled.id); setSelectedPeripheral(null, null) }}
        >
          Remove OLED
        </button>
      </div>
    )
  }

  if (selectedPeripheralType === 'trackball') {
    const tb = config.trackballs?.find((t) => t.id === selectedPeripheralId)
    if (!tb) return null
    return (
      <div className={styles.panel}>
        <h3 className={styles.title}>Trackball</h3>
        <div className={styles.row}>
          <Field label="X (u)">
            <input type="number" step={0.25} value={tb.x}
              onChange={(e) => updateTrackball(tb.id, { x: num(e.target.value, 0) })} />
          </Field>
          <Field label="Y (u)">
            <input type="number" step={0.25} value={tb.y}
              onChange={(e) => updateTrackball(tb.id, { y: num(e.target.value, 0) })} />
          </Field>
        </div>
        <Field label="Driver">
          <select
            value={tb.driver}
            onChange={(e) => updateTrackball(tb.id, { driver: e.target.value as TrackballElement['driver'] })}
          >
            <option value="pmw3360">PMW3360</option>
            <option value="pmw3389">PMW3389</option>
            <option value="adns9800">ADNS9800</option>
            <option value="cirque_pinnacle_spi">Cirque Pinnacle (SPI)</option>
            <option value="pimoroni_trackball">Pimoroni Trackball</option>
          </select>
        </Field>
        <span className={styles.note}>Pin config in Features + Build → Pointing Device</span>
        <div className={styles.divider} />
        <button
          className={styles.removeBtn}
          onClick={() => { removeTrackball(tb.id); setSelectedPeripheral(null, null) }}
        >
          Remove Trackball
        </button>
      </div>
    )
  }

  return null
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      {children}
    </div>
  )
}
