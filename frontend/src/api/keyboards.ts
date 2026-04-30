import { api } from './client'
import type { KeyboardConfig } from '@/store/keyboard'

export interface QMKKeyboardSummary {
  path: string
  name: string
  manufacturer: string
  mcu: string
  usb_vid: string
  usb_pid: string
  layouts: string[]
  key_count: number
}

export const qmkApi = {
  search: (q: string) =>
    api.get<QMKKeyboardSummary[]>(`/qmk/search?q=${encodeURIComponent(q)}`),

  importKeyboard: (path: string) =>
    api.get<KeyboardConfig>(`/qmk/import/${path}`),
}

export const keyboardsApi = {
  list: () => api.get<KeyboardConfig[]>('/keyboards'),

  get: (id: string) => api.get<KeyboardConfig>(`/keyboards/${id}`),

  create: (config: KeyboardConfig) =>
    api.post<KeyboardConfig>('/keyboards', config),

  update: (id: string, config: KeyboardConfig) =>
    api.put<KeyboardConfig>(`/keyboards/${id}`, config),

  downloadSources: async (id: string, filename: string) => {
    const blob = await api.blob(`/keyboards/${id}/sources`)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },

  delete: (id: string) =>
    api.delete<{ deleted: string }>(`/keyboards/${id}`),
}
