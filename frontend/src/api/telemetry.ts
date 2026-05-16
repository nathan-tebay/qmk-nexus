import { api } from './client'
import { getVisitorId } from './visitor'

export interface TelemetryBuild {
  buildId: string
  userId: string
  keyboardId: string
  status: 'success' | 'failed'
  completedAt: string | null
}

export interface TelemetryUser {
  userId: string
  email: string
  name: string
  firstSeenAt: string | null
  lastSeenAt: string | null
}

export interface TelemetrySummary {
  uniqueUsers: number
  uniqueAuthenticatedUsers?: number
  uniqueAnonymousVisitors?: number
  users: TelemetryUser[]
  builds: {
    total: number
    byFinalStatus: Record<'failed' | 'success', number>
    completed: TelemetryBuild[]
  }
}

export const telemetryApi = {
  summary: () => api.get<TelemetrySummary>('/telemetry/summary'),
  visit: (event = 'visit') =>
    api.post<{ ok: boolean; userId: string }>('/telemetry/visit', {
      visitorId: getVisitorId(),
      event,
    }),
}
