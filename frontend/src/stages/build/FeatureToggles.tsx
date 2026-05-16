import { useKeyboardStore, KeyDef, Layer } from '@/store/keyboard'
import { FEATURE_MODULES, incompatMap, ConfigField } from './modules'
import styles from './FeatureToggles.module.css'

import {
  conditionMatches,
  expandConfigFields,
} from '@/utils/validateFeatureConfig'

const GROUPS = Array.from(new Set(FEATURE_MODULES.map((m) => m.group)))

export default function FeatureToggles() {
  const features = useKeyboardStore((s) => s.config.features)
  const featureConfigs = useKeyboardStore((s) => s.config.featureConfigs)
  const keys = useKeyboardStore((s) => s.config.keys)
  const layers = useKeyboardStore((s) => s.config.layers)
  const toggleFeature = useKeyboardStore((s) => s.toggleFeature)
  const setFeatureConfig = useKeyboardStore((s) => s.setFeatureConfig)
  function handleToggleFeature(id: string) {
    toggleFeature(id)
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

                const cardClass = [
                  styles.featureCard,
                  enabled ? styles.featureCardEnabled : '',
                  hasConflict ? styles.featureCardWarning : '',
                ].filter(Boolean).join(' ')

                return (
                  <div key={mod.id} className={cardClass}>
                    <div className={styles.featureHeader}>
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
                        {mod.id === 'bootmagic' && (
                          <BootmagicKeyPicker
                            keys={keys}
                            layers={layers}
                            row={cfg.BOOTMAGIC_LITE_ROW ?? ''}
                            col={cfg.BOOTMAGIC_LITE_COLUMN ?? ''}
                            onSelect={(r, c) => {
                              setFeatureConfig('bootmagic', 'BOOTMAGIC_LITE_ROW', r)
                              setFeatureConfig('bootmagic', 'BOOTMAGIC_LITE_COLUMN', c)
                            }}
                          />
                        )}
                      </div>
                    )}
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

interface BootmagicKeyPickerProps {
  keys: KeyDef[]
  layers: Layer[]
  row: string
  col: string
  onSelect: (row: string, col: string) => void
}

function BootmagicKeyPicker({ keys, layers, row, col, onSelect }: BootmagicKeyPickerProps) {
  const baseKeycodes = layers[0]?.keycodes ?? {}
  const definedKeys = keys
    .filter((k) => k.row != null && k.col != null)
    .sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0))

  if (definedKeys.length === 0) return null

  const selectedRow = row !== '' ? Number(row) : null
  const selectedCol = col !== '' ? Number(col) : null

  return (
    <div className={styles.bootmagicPicker}>
      <span className={`${styles.configLabel} ${styles.bootmagicPickerLabel}`}>
        Click key to assign Bootmagic position
      </span>
      <div className={styles.bootmagicKeyGrid}>
        {definedKeys.map((k) => {
          const isSelected = k.row === selectedRow && k.col === selectedCol
          const label = baseKeycodes[k.id] || k.id
          const btnClass = isSelected
            ? `${styles.bootmagicKey} ${styles.bootmagicKeySelected}`
            : styles.bootmagicKey
          return (
            <button
              key={k.id}
              title={`Row ${k.row}, Col ${k.col}`}
              onClick={() => onSelect(String(k.row), String(k.col))}
              className={btnClass}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
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
