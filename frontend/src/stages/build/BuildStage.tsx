import { useKeyboardStore } from '@/store/keyboard'
import { useKeyboardSync } from '@/store/useKeyboardSync'
import { MetadataForm } from './MetadataForm'
import FeatureToggles from './FeatureToggles'
import { BuildPanel } from './BuildPanel'
import { FEATURE_MODULES } from './modules'
import styles from './BuildStage.module.css'

export default function BuildStage() {
  const config = useKeyboardStore((s) => s.config)
  const setConfig = useKeyboardStore((s) => s.setConfig)
  const { save } = useKeyboardSync()

  function handleMetaChange(field: string, value: string) {
    setConfig({ [field]: value })
  }

  const enabledFeatures = Object.entries(config.features)
    .filter(([, on]) => on)
    .map(([id]) => FEATURE_MODULES.find((m) => m.id === id)?.name ?? id)

  return (
    <div className={styles.stage}>

      {/* ── Top bar ── */}
      <div className={styles.topBar}>
       <div className={styles.topCard}>

        <div className={styles.metadataSection}>
          <div className={styles.sectionTitle}>Keyboard Metadata</div>
          <MetadataForm
            name={config.name}
            manufacturer={config.manufacturer}
            mcu={config.mcu}
            usbVid={config.usbVid}
            usbPid={config.usbPid}
            onChange={handleMetaChange}
          />
        </div>

        <div className={styles.buildSection}>
          <div className={styles.sectionTitle}>Build Firmware</div>

          <div className={styles.summary}>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Keyboard</span>
              <span className={styles.summaryValue}>{config.name || '(unnamed)'}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>MCU</span>
              <span className={styles.summaryValue}>{config.mcu}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Keys</span>
              <span className={styles.summaryValue}>{config.keys.length}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Layers</span>
              <span className={styles.summaryValue}>{config.layers.length}</span>
            </div>
            {enabledFeatures.length > 0 && (
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>Features</span>
                <span className={styles.summaryValue}>{enabledFeatures.join(', ')}</span>
              </div>
            )}
          </div>

          <BuildPanel keyboardId={config.id} onSaveFirst={save} />
        </div>
       </div>
      </div>

      {/* ── Feature Modules ── */}
      <div className={styles.featuresSection}>
        <div className={styles.featuresSectionTitle}>Feature Modules</div>
        <FeatureToggles />
      </div>
    </div>
  )
}
