import { api } from './client'
import type { KeyboardConfig } from '@/store/keyboard'
import { triggerBlobDownload } from '@/utils/downloadBlob'
import { telemetryApi } from './telemetry'

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

  importConfiguratorFile: (file: File, options?: { anonymous?: boolean }) => {
    const form = new FormData()
    form.append('file', file)
    const path = options?.anonymous
      ? '/keyboards/import/configurator/preview'
      : '/keyboards/import/configurator'
    return api.postForm<KeyboardConfig>(path, form)
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

  downloadSourcesFromConfig: async (config: KeyboardConfig, filename: string) => {
    const blob = await api.postBlob('/keyboards/sources/zip', config)
    triggerBlobDownload(blob, filename)
    telemetryApi.visit('source_download').catch(() => undefined)
  },

  delete: (id: string) =>
    api.delete<{ deleted: string }>(`/keyboards/${id}`),
}
