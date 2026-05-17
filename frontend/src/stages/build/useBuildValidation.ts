import type { KeyboardConfig } from '@/store/keyboard'
import { validateMatrices } from '@/utils/validateMatrices'
import { validateKeyboardConfig } from '@/utils/validateKeyboardConfig'
import { estimateFirmwareSize } from '@/utils/firmwareSizeEstimate'
import {
  featureSettingsOk,
  getFeatureConflictErrors,
  getFeatureValidationErrors,
} from '@/utils/validateFeatureConfig'

export function useBuildValidation(config: KeyboardConfig) {
  const matrixValidation = validateMatrices(config)
  const configErrors = validateKeyboardConfig(config)
  const featureErrors = getFeatureValidationErrors(config.features, config.featureConfigs)
  const conflictErrors = getFeatureConflictErrors(config.features)
  const firmwareSize = estimateFirmwareSize(config)

  return {
    matrixValidation,
    matrixBlocked: !matrixValidation.matrixOk,
    ledBlocked: !matrixValidation.ledOk,
    configErrors,
    configBlocked: configErrors.length > 0,
    featureErrors,
    conflictErrors,
    featureBlocked: featureErrors.length > 0 || conflictErrors.length > 0,
    featuresOk: featureSettingsOk(config),
    firmwareSize,
  }
}

export type BuildValidation = ReturnType<typeof useBuildValidation>
