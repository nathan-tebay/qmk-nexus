import { MCU_LIST } from './mcus'

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

const field: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 }
const label: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }
const input: React.CSSProperties = { background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 10px', color: 'var(--text)', fontSize: 13 }

export function MetadataForm({ name, manufacturer, mcu, usbVid, usbPid, softSerialPin, splitEnabled, onChange }: Props) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      <div style={field}>
        <label style={label}>Keyboard Name</label>
        <input style={input} value={name} onChange={(e) => onChange('name', e.target.value)} placeholder="My Keyboard" />
      </div>
      <div style={field}>
        <label style={label}>Manufacturer</label>
        <input style={input} value={manufacturer} onChange={(e) => onChange('manufacturer', e.target.value)} placeholder="Tebay" />
      </div>
      <div style={{ ...field, gridColumn: '1 / -1' }}>
        <label style={label}>MCU</label>
        <select style={input} value={mcu} onChange={(e) => onChange('mcu', e.target.value)}>
          {MCU_LIST.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}{!o.supported ? ' (coming soon)' : ''}
            </option>
          ))}
        </select>
      </div>
      <div style={field}>
        <label style={label}>USB VID</label>
        <input style={input} value={usbVid} onChange={(e) => onChange('usbVid', e.target.value)} placeholder="0xFEED" />
      </div>
      <div style={field}>
        <label style={label}>USB PID</label>
        <input style={input} value={usbPid} onChange={(e) => onChange('usbPid', e.target.value)} placeholder="0x0000" />
      </div>
      {splitEnabled && (
        <div style={field}>
          <label style={label}>Soft Serial Pin</label>
          <input style={input} value={softSerialPin} onChange={(e) => onChange('softSerialPin', e.target.value)} placeholder="D0" />
        </div>
      )}
    </div>
  )
}
