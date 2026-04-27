import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BuildStatus } from '@/api/builds'

interface ActiveBuildState {
  buildId: string | null
  status: BuildStatus | null
  setActiveBuild: (status: BuildStatus) => void
  clearActiveBuild: () => void
}

export const useBuildStore = create<ActiveBuildState>()(persist((set) => ({
  buildId: null,
  status: null,
  setActiveBuild: (status) => set({ buildId: status.id, status }),
  clearActiveBuild: () => set({ buildId: null, status: null }),
}), {
  name: 'build-store',
}))
