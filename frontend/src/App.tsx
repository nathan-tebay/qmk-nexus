import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from '@/store/auth'
import { telemetryApi } from '@/api/telemetry'
import Layout from '@/components/Layout'
import LandingPage from '@/components/LandingPage'
import LoginPage from '@/components/LoginPage'
import AuthCallback from '@/components/AuthCallback'
import LayoutStage from '@/stages/layout/LayoutStage'
import KeymapStage from '@/stages/keymap/KeymapStage'
import BuildStage from '@/stages/build/BuildStage'
import FeatureStage from '@/stages/build/FeatureStage'
import AdminDashboard from '@/stages/admin/AdminDashboard'

function LoginRequiredRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const user = useAuthStore((state) => state.user)

  useEffect(() => {
    if (!user) telemetryApi.visit('app_load').catch(() => undefined)
  }, [user])

  useEffect(() => {
    const inferredLabels: Record<string, string> = {
      '×': 'Close',
      x: 'Close',
      '+': 'Add',
      '▲': 'Move up',
      '▼': 'Move down',
    }
    const handlePointerOver = (event: MouseEvent) => {
      const button = (event.target as HTMLElement | null)?.closest('button')
      if (!button || button.title) return
      const raw = button.getAttribute('aria-label') || button.textContent?.trim() || ''
      const label = inferredLabels[raw] || raw
      if (label) button.title = label
    }
    document.addEventListener('mouseover', handlePointerOver)
    return () => document.removeEventListener('mouseover', handlePointerOver)
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route element={<Layout />}>
          <Route path="layout" element={<LayoutStage />} />
          <Route path="matrix" element={<LayoutStage />} />
          <Route path="keymap" element={<KeymapStage />} />
          <Route path="features" element={<FeatureStage />} />
          <Route path="build" element={<BuildStage />} />
          <Route path="settings" element={<Navigate to="/build" replace />} />
          <Route path="admin" element={<LoginRequiredRoute><AdminDashboard /></LoginRequiredRoute>} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
