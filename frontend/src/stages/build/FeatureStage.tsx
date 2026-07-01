import { Link } from 'react-router-dom'
import { useKeyboardStore } from '@/store/keyboard'
import FeatureToggles from './FeatureToggles'
import ComboEditor from './ComboEditor'
import TapDanceEditor from './TapDanceEditor'
import MacroEditor from './MacroEditor'
import DeviceModePanel from './DeviceModePanel'
import { FEATURE_MODULES } from './modules'
import { useBuildValidation } from './useBuildValidation'
import { mcuById } from './mcus'
import styles from './FeatureStage.module.css'
import type { KeyboardConfig } from '@/store/keyboard'

/**
 * Non-blocking hardware notices for the Features stage. These never affect
 * build-readiness — only validateKeyboardConfig's errors can block a build.
 */
function getFeatureAdvisories(config: KeyboardConfig): string[] {
  const advisories: string[] = []
  if (!config.features['joystick']) return advisories

  const cfg = config.featureConfigs.joystick ?? {}
  const driver = cfg.JOYSTICK_DRIVER ?? 'analog'
  const mcu = mcuById.get(config.mcu)
  const hasAnalogAxes = (config.joysticks ?? []).some((joy) => joy.axes.some((axis) => !axis.virtual))

  if (driver === 'analog' && hasAnalogAxes && mcu?.arch === 'arm') {
    advisories.push('ARM boards require 3.3V on joystick ADC pins; do not wire 5V analog sticks directly.')
  }

  return advisories
}

export default function FeatureStage() {
  const config = useKeyboardStore((s) => s.config)
  const validation = useBuildValidation(config)
  const advisories = getFeatureAdvisories(config)
  const enabledFeatures = Object.entries(config.features)
    .filter(([, on]) => on)
    .map(([id]) => FEATURE_MODULES.find((m) => m.id === id)?.name ?? id)

  return (
    <div className={styles.stage}>
      <header className={styles.header}>
        <div>
          <div className={styles.kicker}>Workflow step 4</div>
          <h1>Features</h1>
          <p>
            Enable QMK modules and fill feature-specific settings before building firmware.
            Keep this page focused on feature selection, pins, counts, and conflicts.
          </p>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Enabled</span>
          <strong>{enabledFeatures.length}</strong>
          <span className={styles.summaryText}>{enabledFeatures.length ? enabledFeatures.join(', ') : 'No optional features enabled'}</span>
          <Link className={styles.buildLink} to="/build">Go to Build</Link>
        </div>
      </header>

      {!validation.featuresOk && (
        <div className={styles.errorBox} role="alert">
          <strong>Resolve feature issues before build.</strong>
          {[...validation.featureErrors, ...validation.conflictErrors].map((error) => (
            <div key={error}>✗ {error}</div>
          ))}
        </div>
      )}

      {advisories.length > 0 && (
        <div className={styles.advisoryBox}>
          {advisories.map((notice) => (
            <div key={notice}>{notice}</div>
          ))}
        </div>
      )}

      <div className={styles.featureShell}>
        <DeviceModePanel />
        <FeatureToggles />
        {config.features.combo && <ComboEditor />}
        {config.features.tap_dance && <TapDanceEditor />}
        <MacroEditor />
      </div>
    </div>
  )
}
