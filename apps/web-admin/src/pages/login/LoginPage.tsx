import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth, resolveLoginUrl } from '@menyu/auth'

export function LoginPage() {
  const { isLoggedIn, user } = useAuth()

  useEffect(() => {
    if (!isLoggedIn || !user) {
      window.location.replace(resolveLoginUrl())
    }
  }, [isLoggedIn, user])

  if (isLoggedIn && user) {
    if (user.tipo !== 'admin') return <Navigate to="/login" replace />
    return <Navigate to="/admin" replace />
  }

  return null
}
