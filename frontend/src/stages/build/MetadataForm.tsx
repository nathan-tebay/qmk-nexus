import { MCU_LIST } from './mcus'
import styles from './MetadataForm.module.css'

interface Props {
  name: string
  manufacturer: string
  mcu: string
  usbVid: string
  usbPid: string
  onChange: (field: string, value: string) => void
}

const SHARED_VID = '0xfeed'

export function MetadataForm({ name, manufacturer, mcu, usbVid, usbPid, onChange }: Props) {
  const isSharedVid = usbVid.toLowerCase() === SHARED_VID

  return (
    <div className={styles.grid}>
      <div className={styles.field}>
        <label className={styles.label}>Keyboard Name</label>
        <input className={styles.input} value={name} onChange={(e) => onChange('name', e.target.value)} placeholder="My Keyboard" />
      </div>
      <div className={styles.field}>
        <label className={styles.label}>Manufacturer</label>
        <input className={styles.input} value={manufacturer} onChange={(e) => onChange('manufacturer', e.target.value)} placeholder="e.g. My Workshop" />
      </div>
      <div className={`${styles.field} ${styles.fieldFull}`}>
        <label className={styles.label}>MCU</label>
        <select className={styles.input} value={mcu} onChange={(e) => onChange('mcu', e.target.value)}>
          {MCU_LIST.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.field}>
        <label className={styles.label}>USB VID</label>
        <input className={styles.input} value={usbVid} onChange={(e) => onChange('usbVid', e.target.value)} placeholder="0xFEED" />
        {isSharedVid && (
          <span className={styles.vidHint}>
            <code>0xFEED</code> is the QMK shared testing VID. For personal firmware this is fine, but request a real VID at{' '}
            <a href="https://pid.codes" target="_blank" rel="noreferrer">pid.codes</a> if you intend to distribute.
          </span>
        )}
      </div>
      <div className={styles.field}>
        <label className={styles.label}>USB PID</label>
        <input className={styles.input} value={usbPid} onChange={(e) => onChange('usbPid', e.target.value)} placeholder="0x0000" />
      </div>
    </div>
  )
}
