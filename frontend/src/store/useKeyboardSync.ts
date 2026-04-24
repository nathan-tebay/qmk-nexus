import { useState, useCallback } from 'react'
import { useKeyboardStore } from './keyboard'
import { keyboardsApi } from '@/api/keyboards'
import { validateMatrices } from '@/utils/validateMatrices'

export function useKeyboardSync() {
  const { config, setConfig } = useKeyboardStore()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)

  const save = useCallback(async (): Promise<string | null> => {
    setSaving(true)
    setError(null)
    setWarning(null)
    const v = validateMatrices(config)
    if (!v.matrixOk || !v.ledOk) {
      setWarning(`Saved with issues: ${v.errors.join('; ')}`)
    }
    try {
      const saved = config.id
        ? await keyboardsApi.update(config.id, config)
        : await keyboardsApi.create(config)
      setConfig({ id: saved.id })
      return saved.id
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
      return null
    } finally {
      setSaving(false)
    }
  }, [config, setConfig])

  const load = useCallback(async (id: string) => {
    const kb = await keyboardsApi.get(id)
    setConfig(kb)
  }, [setConfig])

  return { save, load, saving, error, warning }
}
