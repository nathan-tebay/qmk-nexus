import { useState, useCallback } from 'react'
import { useKeyboardStore } from './keyboard'
import { keyboardsApi } from '@/api/keyboards'
import { validateMatrices } from '@/utils/validateMatrices'
import { validateKeyboardConfig } from '@/utils/validateKeyboardConfig'

export function useKeyboardSync() {
  const { config, setConfig } = useKeyboardStore()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)

  const save = useCallback(async (): Promise<string | null> => {
    setSaving(true)
    setError(null)
    setWarning(null)
    const configErrors = validateKeyboardConfig(config)
    if (configErrors.length > 0) {
      setError(configErrors.join(' '))
      setSaving(false)
      return null
    }
    const v = validateMatrices(config)
    if (!v.matrixOk || !v.ledOk) {
      setWarning(`Saved with issues: ${v.errors.join('; ')}`)
    }
    try {
      let saved
      try {
        saved = config.id
          ? await keyboardsApi.update(config.id, config)
          : await keyboardsApi.create(config)
      } catch (e) {
        if (!config.id || !(e instanceof Error) || e.message !== 'Keyboard not found') {
          throw e
        }
        saved = await keyboardsApi.create({ ...config, id: null })
      }
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
