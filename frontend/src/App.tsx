import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from '@/store/auth'
import Layout from '@/components/Layout'
import LoginPage from '@/components/LoginPage'
import AuthCallback from '@/components/AuthCallback'
import LayoutStage from '@/stages/layout/LayoutStage'
import KeymapStage from '@/stages/keymap/KeymapStage'
import BuildStage from '@/stages/build/BuildStage'
import AdminDashboard from '@/stages/admin/AdminDashboard'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
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
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/layout" replace />} />
          <Route path="layout" element={<LayoutStage />} />
          <Route path="keymap" element={<KeymapStage />} />
          <Route path="build" element={<BuildStage />} />
          <Route path="admin" element={<AdminDashboard />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
