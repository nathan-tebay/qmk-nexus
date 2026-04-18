import { useKeyboardStore } from '@/store/keyboard'
import { useKeyboardSync } from '@/store/useKeyboardSync'
import { MetadataForm } from './MetadataForm'
import { FeatureToggles } from './FeatureToggles'
import { BuildPanel } from './BuildPanel'
import { FEATURE_MODULES } from './modules'
import styles from './BuildStage.module.css'

export default function BuildStage() {
  const config = useKeyboardStore((s) => s.config)
  const setConfig = useKeyboardStore((s) => s.setConfig)
  const toggleFeature = useKeyboardStore((s) => s.toggleFeature)
  const { save } = useKeyboardSync()

  function handleMetaChange(field: string, value: string) {
    setConfig({ [field]: value })
  }

  const enabledFeatures = Object.entries(config.features)
    .filter(([, on]) => on)
    .map(([id]) => FEATURE_MODULES.find((m) => m.id === id)?.name ?? id)

  const splitEnabled = !!config.features['split_keyboard']

  return (
    <div className={styles.stage}>
      <div className={styles.left}>
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Keyboard Metadata</div>
          <MetadataForm
            name={config.name}
            manufacturer={config.manufacturer}
            mcu={config.mcu}
            usbVid={config.usbVid}
            usbPid={config.usbPid}
            softSerialPin={config.softSerialPin}
            splitEnabled={splitEnabled}
            onChange={handleMetaChange}
          />
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Feature Modules</div>
          <FeatureToggles features={config.features} onToggle={toggleFeature} />
        </div>
      </div>

      <div className={styles.right}>
        <p className={styles.rightTitle}>Build Firmware</p>

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
  )
}
