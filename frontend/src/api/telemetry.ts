import { api } from './client'

export interface TelemetryBuild {
  buildId: string
  userId: string
  keyboardId: string
  status: 'success' | 'failed'
  completedAt: string | null
}

export interface TelemetrySummary {
  uniqueUsers: number
  builds: {
    total: number
    byFinalStatus: Record<'failed' | 'success', number>
    completed: TelemetryBuild[]
  }
}

export const telemetryApi = {
  summary: () => api.get<TelemetrySummary>('/telemetry/summary'),
}
