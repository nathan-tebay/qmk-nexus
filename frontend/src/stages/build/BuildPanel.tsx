import { useState, useEffect, useRef } from 'react'
import { buildsApi, type BuildStatus } from '@/api/builds'
import { useKeyboardStore } from '@/store/keyboard'
import { mcuById } from './mcus'

interface Props {
  keyboardId: string | null
  onSaveFirst: () => void
}

const POLL_MS = 2000

export function BuildPanel({ keyboardId, onSaveFirst }: Props) {
  const keyboardName = useKeyboardStore((s) => s.config.name)
  const mcu = useKeyboardStore((s) => s.config.mcu)
  const mcuSupported = mcuById.get(mcu)?.supported ?? true
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
    if (!keyboardId) { onSaveFirst(); return }
    setTriggering(true)
    setError(null)
    setStatus(null)
    setBuildId(null)
    stopPolling()
    try {
      const s = await buildsApi.trigger(keyboardId)
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

  const buildDisabled = triggering || isRunning || !mcuSupported

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <button
        onClick={triggerBuild}
        disabled={buildDisabled}
        title={!mcuSupported ? 'ARM build not yet available' : undefined}
        style={{ padding: '10px 20px', background: buildDisabled ? 'var(--bg-elevated)' : 'var(--accent)', border: 'none', borderRadius: 6, color: '#fff', fontSize: 14, fontWeight: 600, cursor: buildDisabled ? 'not-allowed' : 'pointer', opacity: triggering ? 0.7 : 1 }}
      >
        {isRunning ? 'Building…' : triggering ? 'Starting…' : !mcuSupported ? 'ARM — coming soon' : 'Build Firmware'}
      </button>

      {error && <div style={{ fontSize: 12, color: 'var(--danger)', padding: '8px 10px', background: 'rgba(224,84,84,0.1)', borderRadius: 4 }}>{error}</div>}

      {status && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatusDot status={status.status} />
            <span style={{ fontSize: 13, color: isSuccess ? 'var(--success)' : isFailed ? 'var(--danger)' : 'var(--text-muted)' }}>
              {status.status === 'queued' ? 'Queued' : status.status === 'building' ? 'Compiling…' : status.status === 'success' ? 'Build successful' : 'Build failed'}
            </span>
          </div>

          {/* Log */}
          <div
            ref={logRef}
            style={{ background: '#0d0d0d', border: '1px solid var(--border)', borderRadius: 4, padding: 10, height: 200, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11, color: '#ccc', lineHeight: 1.6 }}
          >
            {status.log.map((line, i) => (
              <div key={i} style={{ color: line.startsWith('[stderr]') ? '#f87171' : '#ccc' }}>{line}</div>
            ))}
            {isRunning && <div style={{ color: 'var(--accent)', animation: 'pulse 1s infinite' }}>▋</div>}
          </div>

          {isSuccess && (
            <button
              onClick={downloadArtifact}
              style={{ padding: '9px 16px', background: 'var(--success)', border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
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
  const color = status === 'success' ? 'var(--success)' : status === 'failed' ? 'var(--danger)' : 'var(--accent)'
  return <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
}
