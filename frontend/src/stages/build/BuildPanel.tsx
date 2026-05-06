import { useState, useEffect, useRef } from 'react'
import { buildsApi, type BuildStatus } from '@/api/builds'
import { useBuildStore } from '@/store/build'
import { useKeyboardStore } from '@/store/keyboard'
import { validateMatrices } from '@/utils/validateMatrices'
import { validateKeyboardConfig } from '@/utils/validateKeyboardConfig'
import { firmwareExtension } from '@/utils/firmwareExtension'
import { mcuById } from './mcus'
import styles from './BuildPanel.module.css'

import {
  getFeatureValidationErrors,
  getFeatureConflictErrors,
} from '@/utils/validateFeatureConfig'

function likelyBuildIssue(status: BuildStatus | null): string | null {
  if (!status || status.status !== 'failed') return null
  const text = [...(status.log ?? []), status.error ?? ''].join('\n').toLowerCase()
  if (text.includes('matrix') && text.includes('pin')) return 'Likely issue: matrix row or column pin assignment is missing or invalid.'
  if (text.includes('unknown mcu') || text.includes('mcu') && text.includes('not yet supported')) return 'Likely issue: this MCU is not supported by the current generated build path.'
  if (text.includes('no rule to make target')) return 'Likely issue: QMK could not find the keyboard/keymap target. Re-import or use QMK-native files.'
  if (text.includes('layout macro')) return 'Likely issue: the selected layout macro does not match what QMK expects for this keyboard.'
  if (text.includes('without producing a firmware artifact')) return 'Likely issue: QMK finished without creating a .hex, .bin, or .uf2 artifact.'
  if (text.includes('proxy unavailable') || text.includes('container unreachable')) return 'Likely issue: the local build service is not reachable.'
  if (text.includes('validation') || text.includes('invalid info.json')) return 'Likely issue: QMK validation rejected the generated keyboard metadata.'
  return 'Likely issue: QMK returned a compile error. Check the first ERROR line in the log.'
}

interface Props {
  keyboardId: string | null
  onSaveFirst: () => Promise<string | null>
  onBuildSuccess?: () => void
}

const POLL_MS = 2000

export function BuildPanel({ keyboardId, onSaveFirst, onBuildSuccess }: Props) {
  const config = useKeyboardStore((s) => s.config)
  const keyboardName = config.name
  const mcu = config.mcu
  const mcuSupported = mcuById.get(mcu)?.supported ?? true
  const matrixValidation = validateMatrices(config)
  const matrixBlocked = !matrixValidation.matrixOk
  const ledBlocked = !matrixValidation.ledOk
  const configErrors = validateKeyboardConfig(config)
  const configBlocked = configErrors.length > 0
  const featureErrors = getFeatureValidationErrors(config.features, config.featureConfigs)
  const conflictErrors = getFeatureConflictErrors(config.features)
  const featureBlocked = featureErrors.length > 0 || conflictErrors.length > 0
  const buildId = useBuildStore((s) => s.buildId)
  const status = useBuildStore((s) => s.status)
  const setActiveBuild = useBuildStore((s) => s.setActiveBuild)
  const clearActiveBuild = useBuildStore((s) => s.clearActiveBuild)
  const [triggering, setTriggering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedLog, setCopiedLog] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollErrorCount = useRef<number>(0)

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  useEffect(() => () => stopPolling(), [])

  const isPersistedBuildRunning = !!buildId && status?.status !== 'success' && status?.status !== 'failed'

  useEffect(() => {
    if (!buildId || !isPersistedBuildRunning) return
    if (pollRef.current) return
    let stopped = false
    pollRef.current = setInterval(async () => {
      try {
        const updated = await buildsApi.status(buildId)
        if (stopped) return
        pollErrorCount.current = 0
        setActiveBuild(updated)
        if (updated.status === 'success') { stopPolling(); onBuildSuccess?.() }
        else if (updated.status === 'failed') stopPolling()
      } catch (e) {
        if (stopped) return
        pollErrorCount.current += 1
        if (pollErrorCount.current >= 10) {
          setActiveBuild({
            ...(status ?? { id: buildId, keyboardId: '', artifactAvailable: false, error: null }),
            status: 'failed',
            log: [...(status?.log ?? []), 'Build status unavailable — refresh to retry'],
          })
          stopPolling()
          return
        }
        setActiveBuild({
          ...(status ?? { id: buildId, keyboardId: '', artifactAvailable: false, error: null }),
          status: 'failed',
          log: [...(status?.log ?? []), `Poll error: ${e instanceof Error ? e.message : String(e)}`],
        })
        stopPolling()
      }
    }, POLL_MS)
    return () => {
      stopped = true
      stopPolling()
    }
  }, [buildId, isPersistedBuildRunning, setActiveBuild, status])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [status?.log])

  async function triggerBuild() {
    setTriggering(true)
    setError(null)
    clearActiveBuild()
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
      pollErrorCount.current = 0
      setActiveBuild(s)
      if (s.status === 'success') {
        onBuildSuccess?.()
      } else if (s.status === 'queued' || s.status === 'building') {
        let currentStatus = s
        pollRef.current = setInterval(async () => {
          try {
            const updated = await buildsApi.status(s.id)
            pollErrorCount.current = 0
            currentStatus = updated
            setActiveBuild(updated)
            if (updated.status === 'success') { stopPolling(); onBuildSuccess?.() }
            else if (updated.status === 'failed') stopPolling()
          } catch (e) {
            pollErrorCount.current += 1
            const msg = pollErrorCount.current >= 10
              ? 'Build status unavailable — refresh to retry'
              : `Poll error: ${e instanceof Error ? e.message : String(e)}`
            setActiveBuild({
              ...currentStatus,
              status: 'failed',
              log: [...(currentStatus.log ?? []), msg],
            })
            stopPolling()
          }
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
    const nameSlug = keyboardName.toLowerCase().replace(/\s+/g, '_')
    const ext = firmwareExtension(mcu)
    buildsApi.download(buildId, `${nameSlug}.${ext}`).catch(() => {})
  }

  async function copyBuildLog() {
    if (!status) return
    await navigator.clipboard.writeText(status.log.join('\n'))
    setCopiedLog(true)
    window.setTimeout(() => setCopiedLog(false), 1200)
  }

  const isRunning = status?.status === 'queued' || status?.status === 'building'
  const isSuccess = status?.status === 'success' && status?.artifactAvailable
  const isFailed  = status?.status === 'failed'
  const issueSummary = likelyBuildIssue(status ?? null)
  const reportHref = status
    ? `mailto:nathan@tebay.dev?subject=${encodeURIComponent(`QMK Nexus build issue: ${keyboardName}`)}&body=${encodeURIComponent([
      `Keyboard: ${keyboardName}`,
      `MCU: ${config.mcu}`,
      `Source mode: ${config.sourceMode}`,
      `Build status: ${status.status}`,
      `Build id: ${status.id}`,
      '',
      issueSummary ?? '',
      '',
      'Recent log:',
      ...(status.log ?? []).slice(-80),
    ].join('\n'))}`
    : 'mailto:nathan@tebay.dev'

  const buildDisabled = triggering || isRunning || !mcuSupported || matrixBlocked || ledBlocked || configBlocked || featureBlocked
  const buildBtnCls = [
    styles.buildBtn,
    triggering ? styles.triggering : '',
    isRunning ? styles.running : '',
  ].filter(Boolean).join(' ')

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
      {configBlocked && (
        <div className={styles.matrixError}>
          {configErrors.map((e, i) => (
            <div key={i}>✗ {e}</div>
          ))}
          <div style={{ marginTop: 4, fontWeight: 600 }}>Adjust the peripheral layout before building.</div>
        </div>
      )}
      {featureBlocked && (
        <div className={styles.matrixError}>
          {[...featureErrors, ...conflictErrors].map((e, i) => (
            <div key={i}>✗ {e}</div>
          ))}
          <div style={{ marginTop: 4, fontWeight: 600 }}>Resolve feature settings above to enable build.</div>
        </div>
      )}
      <button
        onClick={triggerBuild}
        disabled={buildDisabled}
        title={!mcuSupported ? 'MCU build not available' : buildDisabled ? 'Resolve validation issues before building firmware' : 'Compile firmware for this keyboard'}
        aria-label="Build firmware"
        className={buildBtnCls}
      >
        {isRunning ? 'Building…' : triggering ? 'Starting…' : !mcuSupported ? 'MCU unavailable' : 'Build Firmware'}
      </button>

      {error && <div className={styles.error}>{error}</div>}

      {status && (
        <>
          {status.warning && (
            <div className={styles.warningNotice}>{status.warning}</div>
          )}

          <div className={styles.statusRow}>
            <StatusDot status={status.status} />
            <span className={`${styles.statusText} ${isRunning ? styles.running : ''} ${isSuccess ? styles.success : ''} ${isFailed ? styles.failed : ''}`}>
              {status.status === 'queued' ? 'Queued' : status.status === 'building' ? 'Compiling…' : status.status === 'success' ? 'Build successful' : 'Build failed'}
            </span>
          </div>

          {isFailed && issueSummary && (
            <div className={styles.issueSummary}>{issueSummary}</div>
          )}

          <div ref={logRef} className={styles.log}>
            {status.log.map((line, i) => (
              <div key={i} className={`${styles.logLine} ${line.startsWith('[stderr]') ? styles.stderr : ''}`}>{line}</div>
            ))}
            {isRunning && <div className={styles.cursor}>▋</div>}
          </div>

          <div className={styles.logActions}>
            <button
              className={styles.secondaryBtn}
              onClick={copyBuildLog}
              title="Copy the full build log to the clipboard"
              aria-label="Copy build log"
            >
              {copiedLog ? 'Copied' : 'Copy Build Log'}
            </button>
            <a
              className={styles.secondaryLink}
              href={reportHref}
              title="Email build details and recent log output to nathan@tebay.dev"
            >
              Report Build Issue
            </a>
          </div>

          {isSuccess && (
            <button
              onClick={downloadArtifact}
              className={styles.downloadBtn}
              title="Download the compiled firmware artifact"
              aria-label="Download compiled firmware"
            >
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
