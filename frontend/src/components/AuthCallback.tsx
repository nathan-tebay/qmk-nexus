import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore, User } from '@/store/auth'
import { api } from '@/api/client'

export default function AuthCallback() {
  const { setUser } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    api.get<User>('/auth/me')
      .then((user) => {
        setUser(user)
        navigate('/layout', { replace: true })
      })
      .catch(() => navigate('/login', { replace: true }))
  }, [setUser, navigate])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <span style={{ color: 'var(--text-muted)' }}>Signing in...</span>
    </div>
  )
}
