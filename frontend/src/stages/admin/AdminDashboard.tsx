import { useEffect, useMemo, useState } from 'react'
import { telemetryApi, type TelemetrySummary } from '@/api/telemetry'
import { useAuthStore } from '@/store/auth'
import styles from './AdminDashboard.module.css'

const ADMIN_EMAIL = 'nathan.tebay80@gmail.com'

export default function AdminDashboard() {
  const user = useAuthStore((s) => s.user)
  const [summary, setSummary] = useState<TelemetrySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    telemetryApi.summary()
      .then((data) => {
        if (!cancelled) setSummary(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Telemetry unavailable')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [isAdmin])

  const completed = useMemo(
    () => summary?.builds.completed.slice(0, 100) ?? [],
    [summary],
  )
  const visitors = useMemo(
    () => summary?.users ?? [],
    [summary],
  )

  if (!isAdmin) {
    return (
      <section className={styles.page}>
        <div className={styles.denied}>Admin access required.</div>
      </section>
    )
  }

  return (
    <section className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>Admin Dashboard</h1>
          <p>Telemetry summary for users and completed firmware builds.</p>
        </div>
        <button
          className={styles.refreshBtn}
          onClick={() => {
            setLoading(true)
            setError(null)
            telemetryApi.summary()
              .then(setSummary)
              .catch((err) => setError(err instanceof Error ? err.message : 'Telemetry unavailable'))
              .finally(() => setLoading(false))
          }}
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.metrics}>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Unique Users</span>
          <strong>{summary?.uniqueUsers ?? 0}</strong>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Builds Done</span>
          <strong>{summary?.builds.total ?? 0}</strong>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Successful</span>
          <strong>{summary?.builds.byFinalStatus.success ?? 0}</strong>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Failed</span>
          <strong>{summary?.builds.byFinalStatus.failed ?? 0}</strong>
        </div>
      </div>

      <section className={styles.section}>
        <h2>Unique Visitors</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Last Seen</th>
                <th>First Seen</th>
                <th>User ID</th>
              </tr>
            </thead>
            <tbody>
              {visitors.map((visitor) => (
                <tr key={visitor.email || visitor.userId}>
                  <td>{visitor.email || '-'}</td>
                  <td>{visitor.name || '-'}</td>
                  <td>{formatDate(visitor.lastSeenAt)}</td>
                  <td>{formatDate(visitor.firstSeenAt)}</td>
                  <td>{visitor.userId}</td>
                </tr>
              ))}
              {!loading && visitors.length === 0 && (
                <tr>
                  <td colSpan={5} className={styles.empty}>No visitors recorded yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Completed Builds</h2>
        <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Completed</th>
              <th>Status</th>
              <th>User</th>
              <th>Keyboard</th>
              <th>Build</th>
            </tr>
          </thead>
          <tbody>
            {completed.map((build) => (
              <tr key={build.buildId}>
                <td>{formatDate(build.completedAt)}</td>
                <td>
                  <span className={`${styles.status} ${build.status === 'success' ? styles.success : styles.failed}`}>
                    {build.status}
                  </span>
                </td>
                <td>{build.userId}</td>
                <td>{build.keyboardId}</td>
                <td>{build.buildId}</td>
              </tr>
            ))}
            {!loading && completed.length === 0 && (
              <tr>
                <td colSpan={5} className={styles.empty}>No completed builds recorded yet.</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </section>
    </section>
  )
}

function formatDate(value: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}
