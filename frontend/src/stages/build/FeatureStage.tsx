import { Link } from 'react-router-dom'
import { useKeyboardStore } from '@/store/keyboard'
import FeatureToggles from './FeatureToggles'
import { FEATURE_MODULES } from './modules'
import { useBuildValidation } from './useBuildValidation'
import styles from './FeatureStage.module.css'

export default function FeatureStage() {
  const config = useKeyboardStore((s) => s.config)
  const validation = useBuildValidation(config)
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

      <div className={styles.featureShell}>
        <FeatureToggles />
      </div>
    </div>
  )
}
