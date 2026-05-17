import { useState, useEffect, useRef } from 'react'
import { buildsApi, type BuildStatus } from '@/api/builds'
import { useBuildStore } from '@/store/build'
import { useAuthStore } from '@/store/auth'
import { useKeyboardStore } from '@/store/keyboard'
import { mcuById } from './mcus'
import BuildStatusIndicator, { buildStatusLabel, isBuildRunning } from './BuildStatusIndicator'
import { useBuildPoller } from './useBuildPoller'
import type { BuildValidation } from './useBuildValidation'
import { formatFirmwareEstimate } from '@/utils/firmwareSizeEstimate'
import styles from './BuildPanel.module.css'

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

function isTransparentEncoderCode(code: string | undefined): boolean {
  const normalized = (code ?? '').trim()
  return normalized === '' || normalized === 'KC_TRNS' || normalized === '_______'
}

function encoderMappingWarning(config: ReturnType<typeof useKeyboardStore.getState>['config']): string | null {
  if (!config.features.encoder || (config.encoders ?? []).length === 0) return null

  let unmappedDirections = 0
  for (const encoder of config.encoders ?? []) {
    for (const dir of ['cw', 'ccw'] as const) {
      const hasMapping = (config.layers ?? []).some((layer) => (
        !isTransparentEncoderCode(config.encoderKeycodes?.[`${layer.id}:${encoder.id}:${dir}`])
      ))
      if (!hasMapping) unmappedDirections += 1
    }
  }

  if (unmappedDirections === 0) return null
  return `${unmappedDirections} encoder direction${unmappedDirections === 1 ? '' : 's'} have no mapped action. Configure encoder CW/CCW actions in the Keymap stage before building if you expect the encoder to do anything.`
}

interface Props {
  keyboardId: string | null
  onSaveFirst: () => Promise<string | null>
  onBuildSuccess?: () => void
  validation: BuildValidation
}

export function BuildPanel({ keyboardId, onSaveFirst, onBuildSuccess, validation }: Props) {
  const config = useKeyboardStore((s) => s.config)
  const user = useAuthStore((s) => s.user)
  const keyboardName = config.name
  const mcu = config.mcu
  const mcuSupported = mcuById.get(mcu)?.supported ?? true
  const {
    matrixValidation, matrixBlocked, ledBlocked,
    configErrors, configBlocked, featureErrors, conflictErrors, featureBlocked,
  } = validation
  const encoderWarning = encoderMappingWarning(config)
  const setActiveBuild = useBuildStore((s) => s.setActiveBuild)
  const clearActiveBuild = useBuildStore((s) => s.clearActiveBuild)
  const { status, startPolling, stopPolling } = useBuildPoller(onBuildSuccess)
  const [triggering, setTriggering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedLog, setCopiedLog] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

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
      setActiveBuild(s)
      if (s.status === 'success') {
        onBuildSuccess?.()
      } else if (isBuildRunning(s.status)) {
        startPolling(s.id, s)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Build trigger failed')
    } finally {
      setTriggering(false)
    }
  }

  async function copyBuildLog() {
    if (!status) return
    await navigator.clipboard.writeText(status.log.join('\n'))
    setCopiedLog(true)
    window.setTimeout(() => setCopiedLog(false), 1200)
  }

  const isRunning = isBuildRunning(status?.status)
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

  const buildDisabled = !user || triggering || isRunning || !mcuSupported || matrixBlocked || ledBlocked || configBlocked || featureBlocked
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
      {!user && (
        <div className={styles.warningNotice}>Hosted Build Firmware requires sign-in for account storage, build history, and infrastructure cost controls. Anonymous users can still download QMK files below and build locally.</div>
      )}
      {encoderWarning && (
        <div className={styles.warningNotice}>{encoderWarning}</div>
      )}
      {validation.firmwareSize.level !== 'ok' && (
        <div className={styles.warningNotice}>
          Estimated firmware size: {formatFirmwareEstimate(validation.firmwareSize)}
          {validation.firmwareSize.messages.length > 0 && (
            <ul className={styles.warningList}>
              {validation.firmwareSize.messages.map((message) => <li key={message}>{message}</li>)}
            </ul>
          )}
        </div>
      )}
      <button
        onClick={triggerBuild}
        disabled={buildDisabled}
        title={!user ? 'Sign in to use hosted firmware builds' : !mcuSupported ? 'MCU build not available' : buildDisabled ? 'Resolve validation issues before building firmware' : 'Compile firmware for this keyboard'}
        aria-label="Build firmware"
        className={buildBtnCls}
      >
        {isRunning ? 'Building…' : triggering ? 'Starting…' : !user ? 'Sign in to Build Firmware' : !mcuSupported ? 'MCU unavailable' : 'Build Firmware'}
      </button>

      {error && <div className={styles.error}>{error}</div>}

      {status && (
        <>
          {status.warning && (
            <div className={styles.warningNotice}>{status.warning}</div>
          )}

          <div className={styles.statusRow}>
            <BuildStatusIndicator status={status.status} variant="dot" />
            <span className={`${styles.statusText} ${isRunning ? styles.running : ''} ${isSuccess ? styles.success : ''} ${isFailed ? styles.failed : ''}`}>
              {buildStatusLabel(status.status)}
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
        </>
      )}

    </div>
  )
}
