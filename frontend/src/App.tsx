import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import Layout from '@/components/Layout'
import LoginPage from '@/components/LoginPage'
import AuthCallback from '@/components/AuthCallback'
import LayoutStage from '@/stages/layout/LayoutStage'
import KeymapStage from '@/stages/keymap/KeymapStage'
import BuildStage from '@/stages/build/BuildStage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
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
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
