import { useEffect, useState } from 'react'
import { useKeyboardStore, MacroStep, MacroStepType } from '@/store/keyboard'
import styles from './KeycodePicker.module.css'

interface Props {
  currentCode?: string
  onSelect: (code: string) => void
  onClose: () => void
}

const STEP_TYPES: { value: MacroStepType; label: string }[] = [
  { value: 'tap',    label: 'Tap' },
  { value: 'down',   label: 'Hold ↓' },
  { value: 'up',     label: 'Release ↑' },
  { value: 'string', label: 'Type' },
  { value: 'delay',  label: 'Delay' },
]

const NEW_STEP_DEFAULTS: Record<MacroStepType, MacroStep> = {
  tap:    { type: 'tap',    keycode: 'KC_A' },
  down:   { type: 'down',   keycode: 'KC_LSFT' },
  up:     { type: 'up',     keycode: 'KC_LSFT' },
  string: { type: 'string', text: '' },
  delay:  { type: 'delay',  ms: 50 },
}

function parseMacroIndex(code: string | undefined): number | null {
  if (!code) return null
  const match = /^M\(\s*(\d+)\s*\)$/.exec(code)
  return match ? parseInt(match[1], 10) : null
}

export function MacroPanel({ currentCode, onSelect, onClose }: Props) {
  const macros = useKeyboardStore((s) => s.config.macros ?? [])
  const addMacro = useKeyboardStore((s) => s.addMacro)
  const removeMacro = useKeyboardStore((s) => s.removeMacro)
  const updateMacro = useKeyboardStore((s) => s.updateMacro)
  const addMacroStep = useKeyboardStore((s) => s.addMacroStep)
  const updateMacroStep = useKeyboardStore((s) => s.updateMacroStep)
  const removeMacroStep = useKeyboardStore((s) => s.removeMacroStep)
  const reorderMacroStep = useKeyboardStore((s) => s.reorderMacroStep)

  const currentIndex = parseMacroIndex(currentCode)
  const initialId = currentIndex != null && macros[currentIndex] ? macros[currentIndex].id : macros[0]?.id ?? null
  const [selectedId, setSelectedId] = useState<string | null>(initialId)

  useEffect(() => {
    if (selectedId && macros.some((m) => m.id === selectedId)) return
    setSelectedId(macros[0]?.id ?? null)
  }, [macros, selectedId])

  const selected = macros.find((m) => m.id === selectedId) ?? null
  const selectedIndex = selected ? macros.findIndex((m) => m.id === selected.id) : -1

  function handleAddMacro() {
    const id = addMacro()
    setSelectedId(id)
  }

  function handleRemoveMacro() {
    if (!selected) return
    removeMacro(selected.id)
  }

  function handleAssign() {
    if (selectedIndex < 0) return
    onSelect(`M(${selectedIndex})`)
    onClose()
  }

  return (
    <div className={styles.macroPanel}>
      <div className={styles.macroListRow}>
        <button className={styles.macroAddBtn} onClick={handleAddMacro}>+ Add macro</button>
        {macros.map((m, i) => (
          <button
            key={m.id}
            className={`${styles.macroTab} ${m.id === selectedId ? styles.macroTabActive : ''}`}
            onClick={() => setSelectedId(m.id)}
            title={`M(${i})`}
          >
            {`M(${i}) ${m.name}`}
          </button>
        ))}
      </div>

      {!selected ? (
        <p className={styles.macroEmpty}>No macros defined. Add one to start building a sequence.</p>
      ) : (
        <div className={styles.macroEditor}>
          <div className={styles.macroEditorHeader}>
            <input
              className={styles.macroNameInput}
              value={selected.name}
              onChange={(e) => updateMacro(selected.id, { name: e.target.value })}
              placeholder="Macro name"
            />
            <button className={styles.macroStepBtn} onClick={handleRemoveMacro} title="Delete this macro">
              Delete macro
            </button>
          </div>

          <div className={styles.macroStepList}>
            {selected.steps.length === 0 ? (
              <p className={styles.macroEmpty}>No steps yet. Add tap/hold/release/type/delay below.</p>
            ) : (
              selected.steps.map((step, i) => (
                <StepRow
                  key={i}
                  index={i}
                  step={step}
                  total={selected.steps.length}
                  onPatch={(patch) => updateMacroStep(selected.id, i, patch)}
                  onRemove={() => removeMacroStep(selected.id, i)}
                  onMove={(delta) => reorderMacroStep(selected.id, i, i + delta)}
                />
              ))
            )}
          </div>

          <div className={styles.macroAddRow}>
            {STEP_TYPES.map((t) => (
              <button
                key={t.value}
                className={styles.macroAddBtn}
                onClick={() => addMacroStep(selected.id, { ...NEW_STEP_DEFAULTS[t.value] })}
              >
                + {t.label}
              </button>
            ))}
          </div>

          <p className={styles.macroHelp}>
            Static macros compile into <code>process_record_user</code>; no QMK feature flag needed.
          </p>
        </div>
      )}

      <button
        className={styles.assignBtn}
        onClick={handleAssign}
        disabled={selectedIndex < 0}
        title={selected ? `Assign M(${selectedIndex}) to the selected key` : 'Add or select a macro first'}
      >
        {selectedIndex >= 0 ? `Assign M(${selectedIndex})` : 'Assign'}
      </button>
    </div>
  )
}

interface StepRowProps {
  index: number
  step: MacroStep
  total: number
  onPatch: (patch: Partial<MacroStep>) => void
  onRemove: () => void
  onMove: (delta: number) => void
}

function StepRow({ index, step, total, onPatch, onRemove, onMove }: StepRowProps) {
  function handleTypeChange(type: MacroStepType) {
    // Replace with a clean default for the new type so stale fields don't linger.
    onPatch({ ...NEW_STEP_DEFAULTS[type] })
  }

  return (
    <div className={styles.macroStepRow}>
      <span className={styles.macroStepIndex}>{index + 1}.</span>
      <select
        className={styles.macroStepType}
        value={step.type}
        onChange={(e) => handleTypeChange(e.target.value as MacroStepType)}
      >
        {STEP_TYPES.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>
      {step.type === 'string' ? (
        <input
          className={styles.macroStepValue}
          value={step.text ?? ''}
          onChange={(e) => onPatch({ text: e.target.value })}
          placeholder="Text to type…"
        />
      ) : step.type === 'delay' ? (
        <input
          className={styles.macroStepValue}
          type="number"
          min={1}
          max={10000}
          value={step.ms ?? 0}
          onChange={(e) => onPatch({ ms: Math.max(1, Math.min(10000, parseInt(e.target.value, 10) || 0)) })}
          placeholder="ms"
        />
      ) : (
        <input
          className={styles.macroStepValue}
          value={step.keycode ?? ''}
          onChange={(e) => onPatch({ keycode: e.target.value.toUpperCase().trim() })}
          placeholder="KC_A"
        />
      )}
      <button
        className={styles.macroStepBtn}
        onClick={() => onMove(-1)}
        disabled={index === 0}
        title="Move up"
      >
        ↑
      </button>
      <button
        className={styles.macroStepBtn}
        onClick={() => onMove(1)}
        disabled={index === total - 1}
        title="Move down"
      >
        ↓
      </button>
      <button className={styles.macroStepBtn} onClick={onRemove} title="Delete step">×</button>
    </div>
  )
}
