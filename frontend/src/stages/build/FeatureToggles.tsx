import { useState } from 'react'
import { useKeyboardStore } from '@/store/keyboard'
import { FEATURE_MODULES, incompatMap, ConfigField } from './modules'
import styles from './FeatureToggles.module.css'

import {
  conditionMatches,
  expandConfigFields,
  getFeatureConflictErrors,
  effectiveConfigValue,
} from '@/utils/validateFeatureConfig'

const GROUPS = Array.from(new Set(FEATURE_MODULES.map((m) => m.group)))

export default function FeatureToggles() {
  const features = useKeyboardStore((s) => s.config.features)
  const featureConfigs = useKeyboardStore((s) => s.config.featureConfigs)
  const toggleFeature = useKeyboardStore((s) => s.toggleFeature)
  const setFeatureConfig = useKeyboardStore((s) => s.setFeatureConfig)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())

  function toggleExpanded(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleToggleFeature(id: string) {
    const wasEnabled = !!features[id]
    toggleFeature(id)
    if (!wasEnabled) {
      const mod = FEATURE_MODULES.find((m) => m.id === id)
      if (mod && mod.inputs.length > 0) {
        setExpandedIds((current) => new Set([...current, id]))
      }
    }
  }

  // Build conflict set
  const conflictedIds = new Set<string>()
  const conflictMessages: string[] = []
  const seenPairs = new Set<string>()
  for (const mod of FEATURE_MODULES) {
    if (!features[mod.id]) continue
    for (const otherId of incompatMap.get(mod.id) ?? []) {
      if (!features[otherId]) continue
      conflictedIds.add(mod.id)
      conflictedIds.add(otherId)
      const pairKey = [mod.id, otherId].sort().join('|')
      if (seenPairs.has(pairKey)) continue
      seenPairs.add(pairKey)
      const nameA = FEATURE_MODULES.find((m) => m.id === mod.id)?.name ?? mod.id
      const nameB = FEATURE_MODULES.find((m) => m.id === otherId)?.name ?? otherId
      conflictMessages.push(`${nameA} and ${nameB} are incompatible`)
    }
  }

  return (
    <div className={styles.grid}>
      {conflictMessages.length > 0 && (
        <div className={styles.incompatibilityBanner} role="alert">
          Incompatible features enabled:
          <ul>
            {conflictMessages.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        </div>
      )}

      {GROUPS.map((group) => {
        const mods = FEATURE_MODULES.filter((m) => m.group === group)
        const enabledCount = mods.filter((m) => features[m.id]).length

        return (
          <div key={group} className={styles.group}>
            <div className={styles.groupHeader}>
              {group}
              <span className={styles.groupCount}>{enabledCount}/{mods.length}</span>
            </div>

            <div className={styles.groupContent}>
              {mods.map((mod) => {
                const enabled = !!features[mod.id]
                const hasConflict = conflictedIds.has(mod.id)
                const cfg = featureConfigs[mod.id] ?? {}
                const expanded = expandedIds.has(mod.id)

                const cardClass = [
                  styles.featureCard,
                  enabled ? styles.featureCardEnabled : '',
                  hasConflict ? styles.featureCardWarning : '',
                ].filter(Boolean).join(' ')

                return (
                  <div key={mod.id} className={cardClass}>
                    <div className={styles.featureHeader}>
                      <button
                        type="button"
                        className={`${styles.expandButton} ${expanded ? styles.expandButtonOpen : ''}`}
                        aria-expanded={expanded}
                        aria-controls={`feature-panel-${mod.id}`}
                        title={expanded ? 'Collapse module' : 'Expand module'}
                        onClick={() => toggleExpanded(mod.id)}
                      >
                        ▸
                      </button>
                      <label className={styles.featureLabel}>
                        <span className={styles.featureCheckbox}>
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={() => handleToggleFeature(mod.id)}
                          />
                        </span>
                        <span className={styles.featureName}>{mod.name}</span>
                      </label>
                      {hasConflict && (
                        <span className={styles.warningIcon} title="Incompatible with another enabled feature">⚠️</span>
                      )}
                    </div>

                    <div id={`feature-panel-${mod.id}`} hidden={!expanded}>
                      <p className={styles.featureDesc}>{mod.description}</p>

                      {enabled && mod.inputs.length > 0 && (
                        <div className={styles.configPanel}>
                          {expandConfigFields(mod.inputs, cfg).map((field) => {
                            if (field.conditionalOn && !conditionMatches(field.conditionalOn, cfg)) {
                              return null
                            }
                            const value = cfg[field.key] ?? field.defaultValue ?? ''
                            return (
                              <ConfigRow
                                key={field.key}
                                field={field}
                                value={value}
                                onChange={(v) => setFeatureConfig(mod.id, field.key, v)}
                              />
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

interface ConfigRowProps {
  field: ConfigField
  value: string
  onChange: (v: string) => void
}

function ConfigRow({ field, value, onChange }: ConfigRowProps) {
  const isPin = field.type === 'pin'
  return (
    <div className={styles.configRow}>
      <span className={styles.configLabel}>{field.description}</span>
      {isPin && <span className={styles.pinBadge}>PIN</span>}
      {field.type === 'select' && field.options ? (
        <select
          className={styles.configSelect}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {field.options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          className={`${styles.configInput}${isPin ? ` ${styles.pinInput}` : ''}`}
          value={value}
          placeholder={field.defaultValue}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  )
}
