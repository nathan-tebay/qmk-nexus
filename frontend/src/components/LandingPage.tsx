import { useNavigate } from 'react-router-dom'
import { useKeyboardStore } from '@/store/keyboard'
import styles from './LandingPage.module.css'

const steps = ['Layout', 'Matrix', 'Keymap', 'Features', 'Build']

export default function LandingPage() {
  const navigate = useNavigate()
  const reset = useKeyboardStore((s) => s.reset)

  function startNewKeyboard() {
    reset()
    navigate('/layout')
  }

  function importKeyboard() {
    navigate('/layout', { state: { openImport: true } })
  }

  return (
    <main className={styles.root}>
      <section className={styles.card}>
        <div className={styles.logoRow}>
          <img className={styles.logo} src="/qmk-nexus-small.png" alt="" />
          <span>QMK Nexus</span>
        </div>

        <div className={styles.heroGrid}>
          <div className={styles.copy}>
            <p className={styles.kicker}>Browser-based firmware builder</p>
            <h1>Build QMK firmware visually.</h1>
            <p className={styles.lead}>
              Create layouts, wire matrix rows and columns, assign keymaps, enable features,
              and build firmware from one browser-based workflow.
            </p>

            <div className={styles.actions} aria-label="Primary actions">
              <button className={styles.primary} onClick={startNewKeyboard}>
                Start New Keyboard
              </button>
              <button className={styles.secondary} onClick={importKeyboard}>
                Import Existing Keyboard
              </button>
            </div>
            <button className={styles.signIn} onClick={() => navigate('/login')}>
              Sign in
            </button>
          </div>

          <div className={styles.preview} aria-hidden="true">
            <img src="/qmk-nexus-hero.png" alt="" />
          </div>
        </div>

        <section className={styles.workflow} aria-labelledby="workflow-title">
          <h2 id="workflow-title">How it works</h2>
          <div className={styles.stepper}>
            {steps.map((step, index) => (
              <div key={step} className={styles.step}>
                <span className={styles.stepIndex}>{index + 1}</span>
                <span>{step}</span>
              </div>
            ))}
          </div>
          <p>
            For hand-wired boards, split keyboards, and existing QMK-compatible keyboards.
          </p>
        </section>

        <footer className={styles.footer}>
          <a href="https://github.com/nathan-tebay/qmk-nexus" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a href="https://github.com/nathan-tebay/qmk-nexus/issues" target="_blank" rel="noreferrer">
            Send Feedback
          </a>
          <a href="https://tebay.dev/projects/qmknexus.html" target="_blank" rel="noreferrer">
            Read the case study
          </a>
        </footer>
      </section>
    </main>
  )
}
