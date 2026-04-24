import { useState, useEffect, useRef } from 'react'
import { buildsApi, type BuildStatus } from '@/api/builds'
import { useKeyboardStore } from '@/store/keyboard'
import { validateMatrices } from '@/utils/validateMatrices'
import { mcuById } from './mcus'
import { FEATURE_MODULES } from './modules'
import styles from './BuildPanel.module.css'

function getFeatureValidationErrors(
  features: Record<string, boolean>,
  featureConfigs: Record<string, Record<string, string>>,
): string[] {
  const errors: string[] = []
  for (const mod of FEATURE_MODULES) {
    if (!features[mod.id]) continue
    const cfg = featureConfigs[mod.id] ?? {}
    for (const key of mod.requiredConfig) {
      if (!cfg[key]?.trim()) {
        errors.push(`${mod.name}: ${key} is required`)
      }
    }
  }
  return errors
}

interface Props {
  keyboardId: string | null
  onSaveFirst: () => Promise<string | null>
}

const POLL_MS = 2000

export function BuildPanel({ keyboardId, onSaveFirst }: Props) {
  const config = useKeyboardStore((s) => s.config)
  const keyboardName = config.name
  const mcu = config.mcu
  const mcuSupported = mcuById.get(mcu)?.supported ?? true
  const matrixValidation = validateMatrices(config)
  const matrixBlocked = !matrixValidation.matrixOk
  const ledBlocked = !matrixValidation.ledOk
  const featureErrors = getFeatureValidationErrors(config.features, config.featureConfigs)
  const featureBlocked = featureErrors.length > 0
  const [buildId, setBuildId] = useState<string | null>(null)
  const [status, setStatus] = useState<BuildStatus | null>(null)
  const [triggering, setTriggering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  useEffect(() => () => stopPolling(), [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [status?.log])

  async function triggerBuild() {
    setTriggering(true)
    setError(null)
    setStatus(null)
    setBuildId(null)
    stopPolling()

    let id = keyboardId
    if (!id) {
      id = await onSaveFirst()
      if (!id) { setTriggering(false); return }
    }

    try {
      let s: BuildStatus
      try {
        s = await buildsApi.trigger(id)
      } catch (e) {
        if (e instanceof Error && e.message === 'Keyboard not found') {
          // Stale id — re-save then retry
          id = await onSaveFirst()
          if (!id) throw new Error('Save failed, cannot build')
          s = await buildsApi.trigger(id)
        } else {
          throw e
        }
      }
      setBuildId(s.id)
      setStatus(s)
      if (s.status === 'queued' || s.status === 'building') {
        pollRef.current = setInterval(async () => {
          try {
            const updated = await buildsApi.status(s.id)
            setStatus(updated)
            if (updated.status === 'success' || updated.status === 'failed') stopPolling()
          } catch { stopPolling() }
        }, POLL_MS)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Build trigger failed')
    } finally {
      setTriggering(false)
    }
  }

  function downloadArtifact() {
    if (!buildId) return
    const ext = keyboardName.toLowerCase().replace(/\s+/g, '_')
    buildsApi.download(buildId, `${ext}.hex`).catch(() => {})
  }

  const isRunning = status?.status === 'queued' || status?.status === 'building'
  const isSuccess = status?.status === 'success' && status?.artifactAvailable
  const isFailed  = status?.status === 'failed'

  const buildDisabled = triggering || isRunning || !mcuSupported || matrixBlocked || ledBlocked || featureBlocked
  const buildBtnCls = `${styles.buildBtn} ${triggering ? styles.triggering : ''}`

  return (
    <div className={styles.panel}>
      {(matrixBlocked || ledBlocked) && (
        <div className={styles.matrixError}>
          {matrixValidation.errors.map((e, i) => (
            <div key={i}>✗ {e}</div>
          ))}
          <div style={{ marginTop: 4, fontWeight: 600 }}>Fix matrix wiring in Stage 1 to enable build.</div>
        </div>
      )}
      {featureBlocked && (
        <div className={styles.matrixError}>
          {featureErrors.map((e, i) => (
            <div key={i}>✗ {e}</div>
          ))}
          <div style={{ marginTop: 4, fontWeight: 600 }}>Fill required feature fields above to enable build.</div>
        </div>
      )}
      <button
        onClick={triggerBuild}
        disabled={buildDisabled}
        title={!mcuSupported ? 'ARM build not yet available' : undefined}
        className={buildBtnCls}
      >
        {isRunning ? 'Building…' : triggering ? 'Starting…' : !mcuSupported ? 'ARM — coming soon' : 'Build Firmware'}
      </button>

      {error && <div className={styles.error}>{error}</div>}

      {status && (
        <>
          <div className={styles.statusRow}>
            <StatusDot status={status.status} />
            <span className={`${styles.statusText} ${isSuccess ? styles.success : ''} ${isFailed ? styles.failed : ''}`}>
              {status.status === 'queued' ? 'Queued' : status.status === 'building' ? 'Compiling…' : status.status === 'success' ? 'Build successful' : 'Build failed'}
            </span>
          </div>

          <div ref={logRef} className={styles.log}>
            {status.log.map((line, i) => (
              <div key={i} className={`${styles.logLine} ${line.startsWith('[stderr]') ? styles.stderr : ''}`}>{line}</div>
            ))}
            {isRunning && <div className={styles.cursor}>▋</div>}
          </div>

          {isSuccess && (
            <button onClick={downloadArtifact} className={styles.downloadBtn}>
              ↓ Download Firmware
            </button>
          )}
        </>
      )}
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  const cls = [
    styles.dot,
    status === 'success' ? styles.dotSuccess : '',
    status === 'failed' ? styles.dotFailed : '',
  ].filter(Boolean).join(' ')
  return <div className={cls} />
}
