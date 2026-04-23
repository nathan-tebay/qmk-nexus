import { FEATURE_MODULES, incompatMap } from './modules'
import styles from './FeatureToggles.module.css'
import { useKeyboardStore } from '../../store/keyboard'

interface Props {
  onToggle: (id: string) => void
}

export function FeatureToggles({ onToggle }: Props) {
  const features = useKeyboardStore((state) => state.config?.features || {})
  const layoutConfig = useKeyboardStore((state) => state.config?.layoutConfig || {})

  function isDisabled(id: string): boolean {
    const incompat = incompatMap.get(id)
    if (!incompat) return false
    return [...incompat].some((dep) => features[dep])
  }

  return (
    <div className={styles.list}>
      {FEATURE_MODULES.map((mod) => {
        const enabled = !!features[mod.id]
        const disabledByIncompat = !enabled && isDisabled(mod.id)
        
        // A feature is locked if it has a required configuration already present in the layout
        const isLocked = mod.requiredConfig.some(key => !!(layoutConfig as any)[key])

        const rowCls = [
          styles.row,
          enabled ? styles.enabled : '',
          disabledByIncompat ? styles.disabled : '',
        ].filter(Boolean).join(' ')

        return (
          <div
            key={mod.id}
            className={rowCls}
          >
            <div 
              className={`${styles.checkbox} ${isLocked ? styles.locked : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                if (!disabledByIncompat && !isLocked) onToggle(mod.id);
              }}
            >
              {isLocked && <span className={styles.lockIcon}>🔒</span>}
            </div>

            <div className={styles.body}>
              <div className={styles.titleRow}>
                <b className={styles.name}>{mod.name}</b>
                <span className={styles.pill}>{mod.qmkPrevalence.toFixed(1)}% of keyboards</span>
              </div>
              <div className={styles.description}>{mod.description}</div>
              
              {enabled && (
                <div className={styles.expandable}>
                  {/* Warnings */}
                  {mod.incompatibleWith.some(id => features[id]) && (
                    <div className={`${styles.alert} ${styles.warning}`}>
                      Warning: Incompatible with enabled {mod.incompatibleWith.map(id => FEATURE_MODULES.find(m => m.id === id)?.name).filter(Boolean).join(', ')}
                    </div>
                  )}

                  {/* Inputs */}
                  {mod.optionalConfig.map((configKey) => {
                    const layoutValue = (layoutConfig as any)[configKey]
                    const isPreFilled = !!layoutValue
                    const isDisabledFromLayout = mod.requiredConfig.includes(configKey)

                    return (
                      <div key={configKey} className={styles.inputGroup}>
                        <label className={styles.label}>{configKey}</label>
                        <input 
                          className={`${styles.inputField} ${isDisabledFromLayout ? styles.disabled : ''}`} 
                          disabled={isDisabledFromLayout}
                          defaultValue={layoutValue || ""}
                          onClick={(e) => e.stopPropagation()} // Prevent clicking input from toggling feature
                        />
                        {isPreFilled && (
                          <span className={styles.note}>Pre-filled from keyboard layout</span>
                        )}
                        {isDisabledFromLayout && (
                          <span className={styles.note}>Derived from keyboard layout</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  )
}
