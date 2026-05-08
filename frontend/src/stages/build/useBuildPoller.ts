import { useCallback, useEffect, useRef } from 'react'
import { buildsApi, type BuildStatus } from '@/api/builds'
import { useBuildStore } from '@/store/build'
import { isBuildRunning } from './BuildStatusIndicator'

const POLL_MS = 2000
const MAX_POLL_ERRORS = 10

export function useBuildPoller(onBuildSuccess?: () => void) {
  const buildId = useBuildStore((s) => s.buildId)
  const status = useBuildStore((s) => s.status)
  const setActiveBuild = useBuildStore((s) => s.setActiveBuild)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const currentStatusRef = useRef<BuildStatus | null>(null)
  const pollErrorCount = useRef(0)
  const successRef = useRef(onBuildSuccess)
  successRef.current = onBuildSuccess

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const startPolling = useCallback((id: string, initialStatus?: BuildStatus | null) => {
    if (pollRef.current) return
    currentStatusRef.current = initialStatus ?? currentStatusRef.current
    pollErrorCount.current = 0

    pollRef.current = setInterval(async () => {
      try {
        const updated = await buildsApi.status(id)
        pollErrorCount.current = 0
        currentStatusRef.current = updated
        setActiveBuild(updated)
        if (updated.status === 'success') {
          stopPolling()
          successRef.current?.()
        } else if (updated.status === 'failed') {
          stopPolling()
        }
      } catch (e) {
        pollErrorCount.current += 1
        const current = currentStatusRef.current
        if (!current) return

        const msg = pollErrorCount.current >= MAX_POLL_ERRORS
          ? 'Build status unavailable - refresh to retry'
          : `Poll error: ${e instanceof Error ? e.message : String(e)}`
        const next: BuildStatus = {
          ...current,
          status: pollErrorCount.current >= MAX_POLL_ERRORS ? 'failed' : current.status,
          log: [...(current.log ?? []), msg],
        }
        currentStatusRef.current = next
        setActiveBuild(next)
        if (pollErrorCount.current >= MAX_POLL_ERRORS) stopPolling()
      }
    }, POLL_MS)
  }, [setActiveBuild, stopPolling])

  useEffect(() => {
    currentStatusRef.current = status
  }, [status])

  useEffect(() => {
    if (buildId && status && isBuildRunning(status.status)) {
      startPolling(buildId, status)
    }
    return stopPolling
  }, [buildId, startPolling, status, stopPolling])

  return { buildId, status, startPolling, stopPolling }
}
