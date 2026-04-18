import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { useKeyboardSync } from '@/store/useKeyboardSync'
import { useKeyboardStore } from '@/store/keyboard'
import styles from './Layout.module.css'

const stages = [
  { path: '/layout', label: '1. Layout + Wiring' },
  { path: '/keymap', label: '2. Keymap / Layers' },
  { path: '/build', label: '3. Features + Build' },
]

export default function Layout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const kbName = useKeyboardStore((s) => s.config.name)
  const { save, saving, error } = useKeyboardSync()

  function handleLogout() {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).finally(() => {
      logout()
      navigate('/login')
    })
  }

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <span className={styles.logo}>tebay-qmk</span>
        <nav className={styles.nav}>
          {stages.map((s) => (
            <NavLink
              key={s.path}
              to={s.path}
              className={({ isActive }) =>
                `${styles.navLink} ${isActive ? styles.active : ''}`
              }
            >
              {s.label}
            </NavLink>
          ))}
        </nav>
        <div className={styles.center}>
          <span className={styles.kbName}>{kbName}</span>
          {error && <span className={styles.saveError}>{error}</span>}
          <button
            className={styles.saveBtn}
            onClick={save}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
        <div className={styles.user}>
          {user?.avatarUrl && (
            <img src={user.avatarUrl} alt={user.name} className={styles.avatar} />
          )}
          <span>{user?.name}</span>
          <button onClick={handleLogout} className={styles.logout}>
            Logout
          </button>
        </div>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}
