import { api } from './client'
import type { KeyboardConfig } from '@/store/keyboard'
import { triggerBlobDownload } from '@/utils/downloadBlob'

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

  importKeyboard: (path: string, options?: { layoutOnly?: boolean }) =>
    api.get<KeyboardConfig>(`/qmk/import/${path}${options?.layoutOnly ? '?layoutOnly=true' : ''}`),

  importConfiguratorFile: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.postForm<KeyboardConfig>('/keyboards/import/configurator', form)
  },
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
    triggerBlobDownload(blob, filename)
  },

  delete: (id: string) =>
    api.delete<{ deleted: string }>(`/keyboards/${id}`),
}
