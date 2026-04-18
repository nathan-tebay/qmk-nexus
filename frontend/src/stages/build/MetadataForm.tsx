import { MCU_LIST } from './mcus'
import styles from './MetadataForm.module.css'

interface Props {
  name: string
  manufacturer: string
  mcu: string
  usbVid: string
  usbPid: string
  softSerialPin: string
  splitEnabled: boolean
  onChange: (field: string, value: string) => void
}

export function MetadataForm({ name, manufacturer, mcu, usbVid, usbPid, softSerialPin, splitEnabled, onChange }: Props) {
  return (
    <div className={styles.grid}>
      <div className={styles.field}>
        <label className={styles.label}>Keyboard Name</label>
        <input className={styles.input} value={name} onChange={(e) => onChange('name', e.target.value)} placeholder="My Keyboard" />
      </div>
      <div className={styles.field}>
        <label className={styles.label}>Manufacturer</label>
        <input className={styles.input} value={manufacturer} onChange={(e) => onChange('manufacturer', e.target.value)} placeholder="Tebay" />
      </div>
      <div className={`${styles.field} ${styles.fieldFull}`}>
        <label className={styles.label}>MCU</label>
        <select className={styles.input} value={mcu} onChange={(e) => onChange('mcu', e.target.value)}>
          {MCU_LIST.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}{!o.supported ? ' (coming soon)' : ''}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.field}>
        <label className={styles.label}>USB VID</label>
        <input className={styles.input} value={usbVid} onChange={(e) => onChange('usbVid', e.target.value)} placeholder="0xFEED" />
      </div>
      <div className={styles.field}>
        <label className={styles.label}>USB PID</label>
        <input className={styles.input} value={usbPid} onChange={(e) => onChange('usbPid', e.target.value)} placeholder="0x0000" />
      </div>
      {splitEnabled && (
        <div className={styles.field}>
          <label className={styles.label}>Soft Serial Pin</label>
          <input className={styles.input} value={softSerialPin} onChange={(e) => onChange('softSerialPin', e.target.value)} placeholder="D0" />
        </div>
      )}
    </div>
  )
}
