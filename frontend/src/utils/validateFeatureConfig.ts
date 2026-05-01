import { FEATURE_MODULES } from '@/stages/build/modules'
import type { ConfigField, FeatureModule } from '@/stages/build/modules'

/**
 * Get the effective value for a feature configuration key,
 * falling back to defaultValue if not set in config.
 */
export function effectiveConfigValue(
  cfg: Record<string, string>,
  key: string,
): string {
  if (cfg[key] !== undefined) return cfg[key]
  for (const field of FEATURE_MODULES.flatMap((mod) => mod.inputs)) {
    if (field.key === key && field.defaultValue !== undefined) return field.defaultValue
  }
  return ''
}

/**
 * Check if a field's conditionalOn constraints are satisfied by the current config.
 */
export function conditionMatches(
  conditionalOn: Record<string, string | string[]> | undefined,
  cfg: Record<string, string>,
): boolean {
  if (!conditionalOn) return true
  return Object.entries(conditionalOn).every(([key, expected]) => {
    const current = effectiveConfigValue(cfg, key)
    return Array.isArray(expected) ? expected.includes(current) : current === expected
  })
}

/**
 * Expand repeated fields based on their repeatPerCount specification.
 */
export function expandConfigFields(
  fields: readonly ConfigField[],
  cfg: Record<string, string>,
): ConfigField[] {
  const MAX_REPEATED_FIELDS = 16
  return fields.flatMap((field) => {
    if (!field.repeatPerCount) return [field]
    const rawCount = cfg[field.repeatPerCount] ?? '1'
    const parsed = Number.parseInt(rawCount, 10)
    const count = Number.isFinite(parsed) && parsed > 0
      ? Math.min(parsed, MAX_REPEATED_FIELDS)
      : 0
    return Array.from({ length: count }, (_, index) => ({
      ...field,
      key: field.key.replace(/_0$/, `_${index}`),
      description: field.description.replace(/\b0\b/g, String(index)),
      repeatPerCount: undefined,
    }))
  })
}

/**
 * Get validation errors for required configuration fields of enabled features.
 */
export function getFeatureValidationErrors(
  features: Record<string, boolean>,
  featureConfigs: Record<string, Record<string, string>>,
): string[] {
  const errors: string[] = []
  for (const mod of FEATURE_MODULES) {
    if (!features[mod.id]) continue
    const cfg = featureConfigs[mod.id] ?? {}
    for (const key of mod.requiredConfig) {
      const field = mod.inputs.find((input) => input.key === key)
      if (field && !conditionMatches(field.conditionalOn, cfg)) continue
      if (!effectiveConfigValue(cfg, key).trim()) {
        errors.push(`${mod.name}: ${key} is required`)
      }
    }
  }
  return errors
}

/**
 * Get feature conflict errors based on incompatibleWith relationships.
 */
export function getFeatureConflictErrors(
  features: Record<string, boolean>,
): string[] {
  const errors: string[] = []
  const seenPairs = new Set<string>()
  for (const mod of FEATURE_MODULES) {
    if (!features[mod.id]) continue
    for (const otherId of mod.incompatibleWith) {
      if (!features[otherId]) continue
      const pairKey = [mod.id, otherId].sort().join('|')
      if (seenPairs.has(pairKey)) continue
      seenPairs.add(pairKey)
      const other = FEATURE_MODULES.find((m) => m.id === otherId)
      errors.push(`${mod.name} and ${other?.name ?? otherId} are incompatible`)
    }
  }
  return errors
}

/**
 * Check if all required feature settings are properly configured.
 */
export function featureSettingsOk(
  config: {
    features: Record<string, boolean>
    featureConfigs: Record<string, Record<string, string>>
  },
): boolean {
  for (const mod of FEATURE_MODULES) {
    if (!config.features[mod.id]) continue
    const cfg = config.featureConfigs[mod.id] ?? {}
    for (const key of mod.requiredConfig) {
      if (!effectiveConfigValue(cfg, key)?.trim()) return false
    }
  }
  return true
}

/**
 * Get the value of a feature configuration field from its module definition.
 */
export function moduleConfigValue(
  mod: FeatureModule,
  cfg: Record<string, string>,
  key: string,
): string {
  if (cfg[key] !== undefined) return cfg[key]
  const field = mod.inputs.find((input) => input.key === key)
  return field?.defaultValue ?? ''
}

/**
 * Check if a feature is enabled and its configuration satisfies all constraints.
 */
export function isValidFeatureConfiguration(
  featureId: string,
  features: Record<string, boolean>,
  featureConfigs: Record<string, Record<string, string>>,
): boolean {
  if (!features[featureId]) return true
  
  const mod = FEATURE_MODULES.find(m => m.id === featureId)
  if (!mod) return false
  
  const cfg = featureConfigs[featureId] ?? {}
  
  // Check required fields
  for (const key of mod.requiredConfig) {
    const field = mod.inputs.find(input => input.key === key)
    if (field && !conditionMatches(field.conditionalOn, cfg)) continue
    if (!effectiveConfigValue(cfg, key).trim()) return false
  }
  
  // Check conditional fields are satisfied
  for (const input of mod.inputs) {
    if (input.conditionalOn && !conditionMatches(input.conditionalOn, cfg)) {
      // Field is hidden by condition, no validation needed
      continue
    }
  }
  
  return true
}