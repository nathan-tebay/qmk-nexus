import { api } from './client'
import type { KeyboardConfig } from '@/store/keyboard'

export const keyboardsApi = {
  list: () => api.get<KeyboardConfig[]>('/keyboards/'),

  get: (id: string) => api.get<KeyboardConfig>(`/keyboards/${id}`),

  create: (config: KeyboardConfig) =>
    api.post<KeyboardConfig>('/keyboards/', config),

  update: (id: string, config: KeyboardConfig) =>
    api.put<KeyboardConfig>(`/keyboards/${id}`, config),

  delete: (id: string) =>
    api.delete<{ deleted: string }>(`/keyboards/${id}`),
}
