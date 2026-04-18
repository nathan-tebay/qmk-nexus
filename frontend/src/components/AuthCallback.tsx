import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore, User } from '@/store/auth'
import { api } from '@/api/client'
import styles from './AuthCallback.module.css'

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
    <div className={styles.container}>
      <span className={styles.text}>Signing in...</span>
    </div>
  )
}
