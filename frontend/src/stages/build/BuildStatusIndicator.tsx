import styles from './BuildStatusIndicator.module.css'

export type BuildStatusValue = 'queued' | 'building' | 'running' | 'success' | 'failed' | string

export function isBuildRunning(status: BuildStatusValue | null | undefined): boolean {
  return status === 'queued' || status === 'building' || status === 'running'
}

export function buildStatusLabel(status: BuildStatusValue | null | undefined): string {
  if (status === 'queued') return 'Queued'
  if (status === 'building' || status === 'running') return 'Compiling...'
  if (status === 'success') return 'Build successful'
  if (status === 'failed') return 'Build failed'
  return status || 'Unknown'
}

export default function BuildStatusIndicator({
  status,
  variant,
}: {
  status: BuildStatusValue
  variant: 'dot' | 'badge'
}) {
  const cls = [
    variant === 'dot' ? styles.dot : styles.badge,
    status === 'success' ? styles.success : '',
    status === 'failed' ? styles.failed : '',
    isBuildRunning(status) ? styles.running : '',
  ].filter(Boolean).join(' ')

  return variant === 'badge'
    ? <span className={cls}>{status}</span>
    : <span className={cls} />
}
