import { useState, useCallback } from 'react'
import { useKeyboardStore } from './keyboard'
import { keyboardsApi } from '@/api/keyboards'

export function useKeyboardSync() {
  const { config, setConfig } = useKeyboardStore()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      const saved = config.id
        ? await keyboardsApi.update(config.id, config)
        : await keyboardsApi.create(config)
      setConfig({ id: saved.id })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }, [config, setConfig])

  const load = useCallback(async (id: string) => {
    const kb = await keyboardsApi.get(id)
    setConfig(kb)
  }, [setConfig])

  return { save, load, saving, error }
}
