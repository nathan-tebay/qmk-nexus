import { api } from './client'

export interface BuildStatus {
  id: string
  keyboardId: string
  status: 'queued' | 'building' | 'success' | 'failed'
  log: string[]
  artifactAvailable: boolean
  error: string | null
  warning?: string
  configHash?: string | null
  keyboardName?: string | null
  createdAt?: string | null
  mode?: string | null
  mcu?: string | null
}

export interface RecentBuild {
  id: string
  keyboardId: string
  keyboardName: string | null
  status: 'queued' | 'building' | 'success' | 'failed'
  configHash: string | null
  createdAt: string | null
  mode: string | null
  mcu: string | null
  artifactAvailable: boolean
  error: string | null
}

export const buildsApi = {
  trigger: (keyboardId: string) =>
    api.post<BuildStatus>(`/builds/${keyboardId}`, {}),

  status: (buildId: string) =>
    api.get<BuildStatus>(`/builds/${buildId}/status`),

  download: async (buildId: string, filename: string) => {
    const blob = await api.blob(`/builds/${buildId}/download`)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },

  recent: () =>
    api.get<RecentBuild[]>('/builds/recent'),

  restore: (buildId: string) =>
    api.post<BuildStatus>(`/builds/${buildId}/restore`, {}),
}
