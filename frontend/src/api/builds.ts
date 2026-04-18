import { api } from './client'

export interface BuildStatus {
  id: string
  keyboardId: string
  status: 'queued' | 'building' | 'success' | 'failed'
  log: string[]
  artifactAvailable: boolean
  error: string | null
}

export const buildsApi = {
  trigger: (keyboardId: string) =>
    api.post<BuildStatus>(`/builds/${keyboardId}`, {}),

  status: (buildId: string) =>
    api.get<BuildStatus>(`/builds/${buildId}/status`),

  download: async (buildId: string, filename: string) => {
    const res = await fetch(`/api/builds/${buildId}/download`, {
      credentials: 'include',
    })
    if (!res.ok) throw new Error('Download failed')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },
}
