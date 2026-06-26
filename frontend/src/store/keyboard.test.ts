import { describe, it, expect, beforeEach } from 'vitest'
import { useKeyboardStore } from './keyboard'

const store = useKeyboardStore

beforeEach(() => {
  store.getState().reset()
})

describe('combo actions', () => {
  it('adds, updates, and removes a combo', () => {
    store.getState().addCombo()
    const combos = store.getState().config.combos
    expect(combos).toHaveLength(1)
    expect(combos[0].output).toBe('KC_NO')

    const id = combos[0].id
    store.getState().updateCombo(id, { output: 'KC_ESC', keys: ['k0', 'k1'] })
    const updated = store.getState().config.combos[0]
    expect(updated.output).toBe('KC_ESC')
    expect(updated.keys).toEqual(['k0', 'k1'])

    store.getState().removeCombo(id)
    expect(store.getState().config.combos).toHaveLength(0)
  })
})

describe('tap dance actions', () => {
  it('adds with default keycodes, updates, and removes', () => {
    store.getState().addTapDance()
    const td = store.getState().config.tapDances
    expect(td).toHaveLength(1)
    expect(td[0].onTap).toBe('KC_NO')
    expect(td[0].onDoubleTap).toBe('KC_NO')

    const id = td[0].id
    store.getState().updateTapDance(id, { onTap: 'KC_SPC', onDoubleTap: 'KC_ENT' })
    const updated = store.getState().config.tapDances[0]
    expect(updated.onTap).toBe('KC_SPC')
    expect(updated.onDoubleTap).toBe('KC_ENT')

    store.getState().removeTapDance(id)
    expect(store.getState().config.tapDances).toHaveLength(0)
  })
})

describe('macro actions', () => {
  it('adds a macro and appends, reorders, updates, and removes steps', () => {
    const id = store.getState().addMacro()
    expect(store.getState().config.macros).toHaveLength(1)

    store.getState().addMacroStep(id, { type: 'tap', keycode: 'KC_A' })
    store.getState().addMacroStep(id, { type: 'delay', ms: 100 })
    expect(store.getState().config.macros[0].steps).toHaveLength(2)

    store.getState().reorderMacroStep(id, 0, 1)
    expect(store.getState().config.macros[0].steps[0].type).toBe('delay')

    store.getState().updateMacroStep(id, 0, { ms: 250 })
    expect(store.getState().config.macros[0].steps[0].ms).toBe(250)

    store.getState().removeMacroStep(id, 0)
    const steps = store.getState().config.macros[0].steps
    expect(steps).toHaveLength(1)
    expect(steps[0].keycode).toBe('KC_A')

    store.getState().removeMacro(id)
    expect(store.getState().config.macros).toHaveLength(0)
  })
})
