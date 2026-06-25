import { useKeyboardStore, MacroEntry, MacroStep, MacroStepType } from '@/store/keyboard'
import { keycodeMap } from '@/stages/keymap/keycodes'
import styles from './MacroEditor.module.css'

const STEP_TYPES: { value: MacroStepType; label: string }[] = [
  { value: 'tap', label: 'Tap' },
  { value: 'down', label: 'Hold' },
  { value: 'up', label: 'Release' },
  { value: 'string', label: 'Type text' },
  { value: 'delay', label: 'Delay' },
]

export default function MacroEditor() {
  const macros = useKeyboardStore((s) => s.config.macros)
  const addMacro = useKeyboardStore((s) => s.addMacro)
  const removeMacro = useKeyboardStore((s) => s.removeMacro)

  return (
    <div className={styles.editor}>
      <div className={styles.header}>
        <h3 className={styles.title}>Macro Definitions</h3>
        <button className={styles.addBtn} onClick={() => addMacro()}>+ Add Macro</button>
      </div>
      {(macros ?? []).length === 0 ? (
        <p className={styles.empty}>
          No macros defined. Add one to script a key into a sequence of taps, holds, text and delays,
          then assign <code>M(0)</code>, <code>M(1)</code>, … to a key in the Keymap stage.
        </p>
      ) : (
        <div className={styles.list}>
          {(macros ?? []).map((macro, i) => (
            <MacroCard key={macro.id} index={i} macro={macro} onRemove={() => removeMacro(macro.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

interface MacroCardProps {
  index: number
  macro: MacroEntry
  onRemove: () => void
}

function MacroCard({ index, macro, onRemove }: MacroCardProps) {
  const updateMacro = useKeyboardStore((s) => s.updateMacro)
  const addMacroStep = useKeyboardStore((s) => s.addMacroStep)
  const updateMacroStep = useKeyboardStore((s) => s.updateMacroStep)
  const removeMacroStep = useKeyboardStore((s) => s.removeMacroStep)
  const reorderMacroStep = useKeyboardStore((s) => s.reorderMacroStep)

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.macroLabel}>M({index})</span>
        <input
          className={styles.nameInput}
          type="text"
          value={macro.name}
          placeholder="Macro name"
          onChange={(e) => updateMacro(macro.id, { name: e.target.value })}
        />
        <button className={styles.removeBtn} onClick={onRemove} title="Remove macro">×</button>
      </div>

      {macro.steps.length === 0 ? (
        <p className={styles.noSteps}>No steps yet.</p>
      ) : (
        <div className={styles.steps}>
          {macro.steps.map((step, i) => (
            <StepRow
              key={i}
              step={step}
              isFirst={i === 0}
              isLast={i === macro.steps.length - 1}
              onChange={(patch) => updateMacroStep(macro.id, i, patch)}
              onRemove={() => removeMacroStep(macro.id, i)}
              onMoveUp={() => reorderMacroStep(macro.id, i, i - 1)}
              onMoveDown={() => reorderMacroStep(macro.id, i, i + 1)}
            />
          ))}
        </div>
      )}

      <button
        className={styles.addStepBtn}
        onClick={() => addMacroStep(macro.id, { type: 'tap', keycode: 'KC_NO' })}
      >
        + Add step
      </button>
    </div>
  )
}

interface StepRowProps {
  step: MacroStep
  isFirst: boolean
  isLast: boolean
  onChange: (patch: Partial<MacroStep>) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}

function StepRow({ step, isFirst, isLast, onChange, onRemove, onMoveUp, onMoveDown }: StepRowProps) {
  function setType(type: MacroStepType) {
    // Reset the value field so a stale keycode/text/ms doesn't carry across types.
    if (type === 'string') return onChange({ type, text: '', keycode: undefined, ms: undefined })
    if (type === 'delay') return onChange({ type, ms: 100, keycode: undefined, text: undefined })
    onChange({ type, keycode: 'KC_NO', text: undefined, ms: undefined })
  }

  return (
    <div className={styles.stepRow}>
      <select
        className={styles.typeSelect}
        value={step.type}
        onChange={(e) => setType(e.target.value as MacroStepType)}
      >
        {STEP_TYPES.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>

      <StepValue step={step} onChange={onChange} />

      <div className={styles.stepActions}>
        <button className={styles.iconBtn} onClick={onMoveUp} disabled={isFirst} title="Move up">↑</button>
        <button className={styles.iconBtn} onClick={onMoveDown} disabled={isLast} title="Move down">↓</button>
        <button className={styles.iconBtn} onClick={onRemove} title="Remove step">×</button>
      </div>
    </div>
  )
}

function StepValue({ step, onChange }: { step: MacroStep; onChange: (patch: Partial<MacroStep>) => void }) {
  if (step.type === 'string') {
    return (
      <input
        className={styles.valueInput}
        type="text"
        value={step.text ?? ''}
        placeholder="text to type"
        onChange={(e) => onChange({ text: e.target.value })}
      />
    )
  }

  if (step.type === 'delay') {
    return (
      <span className={styles.delayField}>
        <input
          className={styles.numInput}
          type="number"
          min={0}
          value={step.ms ?? 0}
          onChange={(e) => onChange({ ms: Math.max(0, Number(e.target.value) || 0) })}
        />
        <span className={styles.unit}>ms</span>
      </span>
    )
  }

  const valid = isValidKeycode(step.keycode ?? '')
  return (
    <input
      className={`${styles.valueInput} ${valid ? '' : styles.invalid}`}
      type="text"
      value={step.keycode ?? ''}
      placeholder="KC_A"
      onChange={(e) => onChange({ keycode: e.target.value })}
      title={valid ? undefined : 'Unknown keycode — build may fail'}
    />
  )
}

function isValidKeycode(code: string): boolean {
  if (!code) return false
  if (keycodeMap.has(code)) return true
  return /^[A-Z][A-Z0-9_]*\(.+\)$/.test(code) || /^(KC|QK|RM|RGB|UG|BL|MS|AU|EE|DB|DM|GU|CW|MAGIC)_[A-Z0-9_]+$/.test(code)
}
