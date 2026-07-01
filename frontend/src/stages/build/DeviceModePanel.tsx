import { useKeyboardStore } from '@/store/keyboard'
import styles from './DeviceModePanel.module.css'

interface ModeOption {
  id: string
  label: string
}

const MODE_OPTIONS: ModeOption[] = [
  { id: 'keyboard', label: 'Keyboard' },
  { id: 'mouse', label: 'Mouse' },
  { id: 'joystick', label: 'Joystick' },
]

export default function DeviceModePanel() {
  const features = useKeyboardStore((s) => s.config.features)
  const deviceModes = useKeyboardStore((s) => s.config.deviceModes)
  const setDeviceModes = useKeyboardStore((s) => s.setDeviceModes)

  const mouseAvailable = !!features.pointing_device || !!features.mousekeys
  const joystickAvailable = !!features.joystick

  function isDisabled(modeId: string): boolean {
    if (modeId === 'mouse') return !mouseAvailable
    if (modeId === 'joystick') return !joystickAvailable
    return false
  }

  function toggleMode(modeId: string) {
    if (isDisabled(modeId)) return
    const next = deviceModes.includes(modeId)
      ? deviceModes.filter((m) => m !== modeId)
      : [...deviceModes, modeId]
    setDeviceModes(next)
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Device Modes</span>
        <span className={styles.subtitle}>
          Select which HID modes the MODE_NEXT keycode cycles between at runtime.
        </span>
      </div>

      <div className={styles.options}>
        {MODE_OPTIONS.map((opt) => {
          const disabled = isDisabled(opt.id)
          const checked = deviceModes.includes(opt.id)
          let hint = ''
          if (opt.id === 'mouse' && disabled) hint = 'Enable Mouse Keys or a Pointing Device to use this mode.'
          if (opt.id === 'joystick' && disabled) hint = 'Enable the Joystick feature to use this mode.'

          return (
            <label
              key={opt.id}
              className={`${styles.option} ${disabled ? styles.optionDisabled : ''}`}
              title={hint || undefined}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => toggleMode(opt.id)}
              />
              <span className={styles.optionLabel}>{opt.label}</span>
              {hint && <span className={styles.optionHint}>{hint}</span>}
            </label>
          )
        })}
      </div>

      {deviceModes.length > 0 && deviceModes.length < 2 && (
        <div className={styles.advisory}>
          Select at least 2 device modes to enable mode switching.
        </div>
      )}
    </div>
  )
}
