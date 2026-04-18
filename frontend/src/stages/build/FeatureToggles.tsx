import { FEATURE_MODULES, incompatMap } from './modules'
import styles from './FeatureToggles.module.css'

interface Props {
  features: Record<string, boolean>
  onToggle: (id: string) => void
}

export function FeatureToggles({ features, onToggle }: Props) {
  function isDisabled(id: string): boolean {
    const incompat = incompatMap.get(id)
    if (!incompat) return false
    return [...incompat].some((dep) => features[dep])
  }

  return (
    <div className={styles.list}>
      {FEATURE_MODULES.map((mod) => {
        const enabled = !!features[mod.id]
        const disabled = !enabled && isDisabled(mod.id)
        const rowCls = [
          styles.row,
          enabled ? styles.enabled : '',
          disabled ? styles.disabled : '',
        ].filter(Boolean).join(' ')
        const pillCls = `${styles.pill} ${enabled ? styles.pillOn : ''}`
        return (
          <div
            key={mod.id}
            onClick={() => !disabled && onToggle(mod.id)}
            title={disabled ? `Incompatible with: ${mod.incompatibleWith.join(', ')}` : mod.description}
            className={rowCls}
          >
            <div className={pillCls}>
              <div className={styles.knob} />
            </div>
            <div className={styles.body}>
              <div className={styles.title}>
                {mod.name}
                <span className={styles.prevalence}>
                  {(mod.qmkPrevalence * 100).toFixed(0)}% of keyboards
                </span>
              </div>
              <div className={styles.description}>
                {mod.description}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
