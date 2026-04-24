import { useState, useRef } from 'react'
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
  const setConfig = useKeyboardStore((s) => s.setConfig)
  const { save, saving, error, warning } = useKeyboardSync()
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)

  function handleLogout() {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).finally(() => {
      logout()
      navigate('/login')
    })
  }

  function startEdit() {
    setNameValue(kbName)
    setEditingName(true)
    setTimeout(() => nameInputRef.current?.select(), 0)
  }

  function commitName() {
    const trimmed = nameValue.trim()
    if (trimmed) setConfig({ name: trimmed })
    setEditingName(false)
  }

  function handleNameKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commitName()
    if (e.key === 'Escape') setEditingName(false)
  }

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <span className={styles.logo}>QMK Nexus</span>
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
          {editingName ? (
            <input
              ref={nameInputRef}
              className={styles.kbNameInput}
              value={nameValue}
              autoFocus
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={commitName}
              onKeyDown={handleNameKey}
            />
          ) : (
            <button className={styles.kbNameBtn} onClick={startEdit} title="Rename keyboard">
              <span className={styles.kbName}>{kbName}</span>
              <span className={styles.pencilIcon}>✏</span>
            </button>
          )}
          {error && <span className={styles.saveError}>{error}</span>}
          {!error && warning && <span className={styles.saveWarning}>{warning}</span>}
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
