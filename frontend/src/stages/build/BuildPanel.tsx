import { useState, useEffect, useRef } from 'react'
import { buildsApi, type BuildStatus } from '@/api/builds'
import { keyboardsApi } from '@/api/keyboards'
import { useBuildStore } from '@/store/build'
import { useKeyboardStore } from '@/store/keyboard'
import { validateMatrices } from '@/utils/validateMatrices'
import { validateKeyboardConfig } from '@/utils/validateKeyboardConfig'
import { mcuById } from './mcus'
import { FEATURE_MODULES, incompatMap } from './modules'
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

function getFeatureConflictErrors(features: Record<string, boolean>): string[] {
  const errors: string[] = []
  const seenPairs = new Set<string>()
  for (const mod of FEATURE_MODULES) {
    if (!features[mod.id]) continue
    for (const otherId of incompatMap.get(mod.id) ?? []) {
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
  const [showSourcesModal, setShowSourcesModal] = useState(false)
  const [downloadingSources, setDownloadingSources] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
        setActiveBuild(updated)
        if (updated.status === 'success' || updated.status === 'failed') stopPolling()
      } catch (e) {
        if (stopped) return
        setError(e instanceof Error ? e.message : 'Build status polling failed')
        stopPolling()
      }
    }, POLL_MS)
    return () => {
      stopped = true
      stopPolling()
    }
  }, [buildId, isPersistedBuildRunning, setActiveBuild])

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
      if (s.status === 'queued' || s.status === 'building') {
        pollRef.current = setInterval(async () => {
          try {
            const updated = await buildsApi.status(s.id)
            setActiveBuild(updated)
            if (updated.status === 'success' || updated.status === 'failed') stopPolling()
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Build status polling failed')
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
    const ext = keyboardName.toLowerCase().replace(/\s+/g, '_')
    buildsApi.download(buildId, `${ext}.hex`).catch(() => {})
  }

  async function downloadQmkSources() {
    setDownloadingSources(true)
    setError(null)
    try {
      let id = keyboardId
      if (!id) {
        id = await onSaveFirst()
        if (!id) return
      }
      const filename = `${keyboardName.toLowerCase().replace(/\s+/g, '_')}_qmk_sources.zip`
      await keyboardsApi.downloadSources(id, filename)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Source download failed')
    } finally {
      setDownloadingSources(false)
    }
  }

  const isRunning = status?.status === 'queued' || status?.status === 'building'
  const isSuccess = status?.status === 'success' && status?.artifactAvailable
  const isFailed  = status?.status === 'failed'
  const keyboardSlug = keyboardName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'my_keyboard'
  const isNativeQmk = config.sourceMode === 'qmk_native'
  const upstreamKeyboard = config.upstreamKeyboard || keyboardSlug

  const buildDisabled = triggering || isRunning || !mcuSupported || matrixBlocked || ledBlocked || configBlocked || featureBlocked
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
        title={!mcuSupported ? 'MCU build not available' : undefined}
        className={buildBtnCls}
      >
        {isRunning ? 'Building…' : triggering ? 'Starting…' : !mcuSupported ? 'MCU unavailable' : 'Build Firmware'}
      </button>
      <button
        onClick={() => setShowSourcesModal(true)}
        className={styles.sourcesBtn}
      >
        Download QMK Files
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

      {showSourcesModal && (
        <div className={styles.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) setShowSourcesModal(false) }}>
          <div className={styles.sourcesModal} role="dialog" aria-modal="true" aria-labelledby="qmk-sources-title">
            <div className={styles.modalHeader}>
              <h2 id="qmk-sources-title">Build In QMK_firmware</h2>
              <button className={styles.modalClose} onClick={() => setShowSourcesModal(false)}>x</button>
            </div>
            <div className={styles.modalBody}>
              {isNativeQmk ? (
                <>
                  <p>
                    Download the QMK-native overlay, then apply it to a local QMK_firmware checkout.
                  </p>
                  <ol>
                    <li>Clone and set up QMK_firmware.</li>
                    <li>Unzip the generated archive.</li>
                    <li>Copy the contents of <code>upstream_overlay/</code> into the QMK_firmware root.</li>
                    <li>Copy <code>keymap.c</code> into <code>keyboards/{upstreamKeyboard}/keymaps/nexus/</code>.</li>
                    <li>Compile or flash the upstream keyboard with the <code>nexus</code> keymap.</li>
                  </ol>
                  <pre className={styles.commandBlock}>{`git clone https://github.com/qmk/qmk_firmware.git
cd qmk_firmware
qmk setup
# unzip the generated files outside this checkout, then copy:
# upstream_overlay/* -> ./
mkdir -p keyboards/${upstreamKeyboard}/keymaps/nexus
# keymap.c -> keyboards/${upstreamKeyboard}/keymaps/nexus/keymap.c
qmk compile -kb ${upstreamKeyboard} -km nexus
qmk flash -kb ${upstreamKeyboard} -km nexus`}</pre>
                </>
              ) : (
                <>
                  <p>
                    Download the generated QMK source files, then add them as a custom keyboard in a local QMK_firmware checkout.
                  </p>
                  <ol>
                    <li>Clone and set up QMK_firmware.</li>
                    <li>Create a keyboard folder such as <code>keyboards/custom/{keyboardSlug}</code>.</li>
                    <li>Copy <code>config.h</code>, <code>rules.mk</code>, <code>info.json</code>, <code>keyboard.c</code>, and <code>keyboard.h</code> into that folder.</li>
                    <li>Create <code>keymaps/default/</code> inside the keyboard folder and move <code>keymap.c</code> there.</li>
                    <li>Compile or flash with the QMK commands below.</li>
                  </ol>
                  <pre className={styles.commandBlock}>{`git clone https://github.com/qmk/qmk_firmware.git
cd qmk_firmware
qmk setup
mkdir -p keyboards/custom/${keyboardSlug}/keymaps/default
# unzip the generated files, then copy:
# config.h rules.mk info.json keyboard.c keyboard.h -> keyboards/custom/${keyboardSlug}/
# keymap.c -> keyboards/custom/${keyboardSlug}/keymaps/default/
qmk compile -kb custom/${keyboardSlug} -km default
qmk flash -kb custom/${keyboardSlug} -km default`}</pre>
                </>
              )}
              <button
                className={styles.downloadSourcesBtn}
                onClick={downloadQmkSources}
                disabled={downloadingSources}
              >
                {downloadingSources ? 'Downloading...' : 'Download Generated ZIP'}
              </button>
            </div>
          </div>
        </div>
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
