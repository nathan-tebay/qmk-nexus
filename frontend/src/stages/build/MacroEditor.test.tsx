import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MacroEditor from './MacroEditor'
import { useKeyboardStore } from '@/store/keyboard'

beforeEach(() => {
  useKeyboardStore.getState().reset()
})

describe('MacroEditor', () => {
  it('renders the empty state when no macros exist', () => {
    render(<MacroEditor />)
    expect(screen.getByText(/No macros defined/i)).toBeInTheDocument()
  })

  it('adds a macro, adds a step, and switches the step type to delay', async () => {
    const user = userEvent.setup()
    render(<MacroEditor />)

    await user.click(screen.getByRole('button', { name: /add macro/i }))
    expect(useKeyboardStore.getState().config.macros).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: /add step/i }))
    expect(useKeyboardStore.getState().config.macros[0].steps).toHaveLength(1)
    expect(useKeyboardStore.getState().config.macros[0].steps[0].type).toBe('tap')

    await user.selectOptions(screen.getByRole('combobox'), 'delay')
    expect(useKeyboardStore.getState().config.macros[0].steps[0].type).toBe('delay')
  })
})
