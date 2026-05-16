import { useState, useRef } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { useKeyboardSync } from '@/store/useKeyboardSync'
import { useKeyboardStore } from '@/store/keyboard'
import { useBuildStore } from '@/store/build'
import { applyTheme, getStoredTheme, storeTheme, themes, type ThemeId } from '@/theme'
import styles from './Layout.module.css'

const stages = [
  { path: '/layout', label: 'Layout' },
  { path: '/matrix', label: 'Matrix' },
  { path: '/keymap', label: 'Keymap' },
  { path: '/features', label: 'Features' },
  { path: '/build', label: 'Build' },
]

const ADMIN_EMAIL = 'nathan.tebay80@gmail.com'

const instructions = {
  layout: {
    title: 'Layout + Wiring',
    items: [
      'Add keys to the canvas and position them in keyboard units.',
      'Use Matrix Mode to connect keys that share row and column wires.',
      'For a single-key keyboard, skip matrix wiring and define Pin A and Pin B on the Pins tab.',
      'Use the Pins tab to assign each generated row and column to an MCU pin.',
      'Add encoders, OLEDs, and trackballs before moving to keymap setup.',
    ],
  },
  keymap: {
    title: 'Keymap / Layers',
    items: [
      'Click a key to assign its QMK keycode on the active layer.',
      'Use layers for Fn keys, media controls, symbols, or alternate layouts.',
      'Configure encoder clockwise and counterclockwise actions from this stage.',
      'For OLEDs, Preset Blocks generate common display behavior and Custom C Code lets you edit the generated starting point.',
    ],
  },
  build: {
    title: 'Features + Build',
    items: [
      'Set keyboard metadata, USB IDs, MCU, and manufacturer details first.',
      'Enable only the QMK features your keyboard actually uses.',
      'Fill required feature pins and counts before building.',
      'Use Build Firmware for a hosted compile, or Download QMK Files to build inside your own QMK_firmware checkout.',
    ],
  },
} as const

function instructionKey(pathname: string): keyof typeof instructions {
  if (pathname.startsWith('/keymap')) return 'keymap'
  if (pathname.startsWith('/build') || pathname.startsWith('/features') || pathname.startsWith('/settings')) return 'build'
  return 'layout'
}

export default function Layout() {
  const { user, logout } = useAuthStore()
  const isAnonymous = !user
  const navigate = useNavigate()
  const location = useLocation()
  const kbName = useKeyboardStore((s) => s.config.name)
  const setConfig = useKeyboardStore((s) => s.setConfig)
  const clearActiveBuild = useBuildStore((s) => s.clearActiveBuild)
  const { save, saving, error, warning } = useKeyboardSync()
  const [editingName, setEditingName] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)
  const [showDonate, setShowDonate] = useState(false)
  const [theme, setTheme] = useState<ThemeId>(() => getStoredTheme())
  const [nameValue, setNameValue] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)
  const currentInstructions = instructions[instructionKey(location.pathname)]
  const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL

  function handleLogout() {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).finally(() => {
      logout()
      clearActiveBuild()
      navigate('/layout')
    })
  }

  function handleSaveClick() {
    if (isAnonymous) {
      navigate('/login')
      return
    }
    void save()
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

  function handleThemeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const nextTheme = e.target.value as ThemeId
    setTheme(nextTheme)
    applyTheme(nextTheme)
    storeTheme(nextTheme)
  }

  return (
    <div className={styles.root}>
      <header className={styles.header}>
      <button className={styles.logo} onClick={() => navigate('/')} title="Open QMK Nexus landing page">
        <img
          className={styles.smallHeroImage}
          src="/qmk-nexus-small.png"
          alt="QMK Nexus split keyboard circuit artwork"
        />
      </button>
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
          {isAnonymous && (
            <span className={styles.saveWarning}>Draft auto-saves locally.</span>
          )}
          <button
            className={styles.saveBtn}
            onClick={handleSaveClick}
            disabled={saving}
            title={isAnonymous ? 'Sign in to save this keyboard to your account' : saving ? 'Saving keyboard changes' : 'Save the current keyboard to your account'}
            aria-label="Save keyboard"
          >
            {isAnonymous ? 'Sign in to Save' : saving ? 'Saving...' : 'Save'}
          </button>
          <button
            className={styles.instructionsBtn}
            onClick={() => setShowInstructions(true)}
            title="Open stage-specific instructions"
            aria-label="Open instructions"
          >
            Instructions
          </button>
          <select
            className={styles.themeSelect}
            value={theme}
            onChange={handleThemeChange}
            aria-label="Theme"
            title="Theme"
          >
            {themes.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </div>
        <div className={styles.user}>
          {user?.avatarUrl && (
            <img src={user.avatarUrl} alt={user.name} className={styles.avatar} />
          )}
          {user && <span>{user.name}</span>}
          {isAdmin && (
            <button
              onClick={() => navigate('/admin')}
              className={styles.adminBtn}
              title="Open admin dashboard"
              aria-label="Admin dashboard"
            >
              Admin
            </button>
          )}
          <button
            className={styles.donateBtn}
            onClick={() => setShowDonate(true)}
            title="Support QMK Nexus"
          >
            Donate
          </button>
          <a
            className={styles.headerLink}
            href="https://github.com/nathan-tebay/qmk-nexus"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          <a
            className={styles.headerLink}
            href="https://github.com/nathan-tebay/qmk-nexus/issues"
            target="_blank"
            rel="noopener noreferrer"
            title="Found a workflow issue? Tell me what keyboard you are building and where the process got confusing."
          >
            Feedback
          </a>
          <a
            className={styles.headerLink}
            href="https://tebay.dev/projects/qmknexus.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            Case Study
          </a>
          {user ? (
            <button onClick={handleLogout} className={styles.logout} title="Sign out of QMK Nexus" aria-label="Logout">
              Logout
            </button>
          ) : (
            <button onClick={() => navigate('/login')} className={styles.loginBtn} title="Sign in to QMK Nexus" aria-label="Sign in">
              Sign in
            </button>
          )}
        </div>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
      {showDonate && (
        <div className={styles.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) setShowDonate(false) }}>
          <div className={styles.donateModal} role="dialog" aria-modal="true" aria-labelledby="donate-title">
            <div className={styles.modalHeader}>
              <h2 id="donate-title">Support QMK Nexus</h2>
              <button className={styles.modalClose} onClick={() => setShowDonate(false)} aria-label="Close">×</button>
            </div>
            <div className={styles.donateBody}>
              <p className={styles.donateIntro}>
                QMK Nexus is free and open to everyone. If it's been useful to you, here are a few reasons to consider contributing:
              </p>
              <ul className={styles.donateWhy}>
                <li>
                  <strong>Cover hosting costs</strong> QMK Nexus runs on real infrastructure (AWS Lambda, S3, CloudFront). Every build and save has a cost, and contributions help keep the lights on.
                </li>
                <li>
                  <strong>You appreciate the tool</strong> If QMK Nexus saved you hours of wiring diagrams, manual config edits, or compiler headaches, a small contribution is a great way to say thanks.
                </li>
                <li>
                  <strong>Ensure future development</strong> Your support directly funds new features, bug fixes, and long-term maintenance. The more sustainable this project is, the better it gets.
                </li>
              </ul>
              <div className={styles.donateActions}>
                <a
                  href="https://venmo.com/NathanTebay"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.venmoCta}
                  onClick={() => setShowDonate(false)}
                >
                  Continue to Venmo
                </a>
                <button className={styles.donateLater} onClick={() => setShowDonate(false)}>
                  Maybe Later
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showInstructions && (
        <div className={styles.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) setShowInstructions(false) }}>
          <div className={styles.instructionsModal} role="dialog" aria-modal="true" aria-labelledby="instructions-title">
            <div className={styles.modalHeader}>
              <h2 id="instructions-title">{currentInstructions.title}</h2>
              <button
                className={styles.modalClose}
                onClick={() => setShowInstructions(false)}
                title="Close instructions"
                aria-label="Close instructions"
              >x</button>
            </div>
            <ol className={styles.instructionsList}>
              {currentInstructions.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  )
}
