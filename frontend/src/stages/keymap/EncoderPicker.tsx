import { useState } from 'react'
import { useKeyboardStore } from '@/store/keyboard'
import { KeycodePicker } from './KeycodePicker'
import { keycodeMap } from './keycodes'
import styles from './EncoderPicker.module.css'

type Dir = 'cw' | 'ccw'

interface Props {
  encoderId: string
  encoderIndex: number
  onClose: () => void
}

const DIR_LABELS: Record<Dir, string> = { cw: 'CW ↻', ccw: 'CCW ↺' }

export function EncoderPicker({ encoderId, encoderIndex, onClose }: Props) {
  const { config, activeLayerId, setEncoderKeycode, updateEncoder } = useKeyboardStore()
  const [localLayerId, setLocalLayerId] = useState(activeLayerId)
  const [activeSlot, setActiveSlot] = useState<Dir | null>(null)

  const encoder = config.encoders.find((e) => e.id === encoderId)
  const hasSwitch = encoder?.hasSwitch ?? false
  const dirs: Dir[] = ['cw', 'ccw']

  function getCode(dir: Dir) {
    return config.encoderKeycodes?.[`${localLayerId}:${encoderId}:${dir}`] ?? 'KC_TRNS'
  }

  function getLabel(dir: Dir) {
    const code = getCode(dir)
    if (!code || code === 'KC_TRNS') return '(transparent)'
    return keycodeMap.get(code)?.label ?? code.replace(/^KC_/, '').slice(0, 10)
  }

  function handleSelect(code: string) {
    if (!activeSlot) return
    setEncoderKeycode(localLayerId, encoderId, activeSlot, code)
    setActiveSlot(null)
  }

  function toggleSwitch() {
    updateEncoder(encoderId, { hasSwitch: !hasSwitch })
  }

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>Encoder {encoderIndex + 1}</span>
          <button
            className={`${styles.switchToggle} ${hasSwitch ? styles.switchToggleOn : ''}`}
            onClick={toggleSwitch}
            title="Toggle whether this encoder has a physical click switch"
          >
            {hasSwitch ? 'Switch: ON' : 'Switch: OFF'}
          </button>
          <button onClick={onClose} className={styles.closeBtn}>×</button>
        </div>

        <div className={styles.layerStrip}>
          {config.layers.map((l) => (
            <button
              key={l.id}
              className={`${styles.layerTab} ${l.id === localLayerId ? styles.layerTabActive : ''}`}
              onClick={() => { setLocalLayerId(l.id); setActiveSlot(null) }}
            >
              {l.name}
            </button>
          ))}
        </div>

        <div className={styles.body}>
          <div className={styles.slots}>
            {dirs.map((dir) => (
              <button
                key={dir}
                className={`${styles.slotRow} ${activeSlot === dir ? styles.slotActive : ''}`}
                onClick={() => setActiveSlot(activeSlot === dir ? null : dir)}
              >
                <span className={styles.slotLabel}>{DIR_LABELS[dir]}</span>
                <span className={styles.slotCode}>{getLabel(dir)}</span>
                <span className={styles.slotHint}>{activeSlot === dir ? '▲' : '▼'}</span>
              </button>
            ))}
          </div>

          <div className={styles.pickerArea}>
            {activeSlot ? (
              <KeycodePicker
                inline
                currentCode={getCode(activeSlot)}
                onSelect={handleSelect}
                onClose={() => setActiveSlot(null)}
                layerCount={config.layers.length}
              />
            ) : (
              <div className={styles.pickerPlaceholder}>Select a slot above to assign a keycode</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
