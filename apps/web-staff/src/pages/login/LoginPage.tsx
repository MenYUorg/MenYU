import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth, resolveLoginUrl } from '@menyu/auth'

const DEST: Record<string, string> = {
  mozo: '/mozo',
  cocina: '/cocina',
  admin: '/selector',
}

export function LoginPage() {
  const { isLoggedIn, user } = useAuth()

  useEffect(() => {
    if (!isLoggedIn || !user) {
      window.location.replace(resolveLoginUrl())
    }
  }, [isLoggedIn, user])

  if (isLoggedIn && user) {
    const dest = DEST[user.tipo]
    if (!dest) return <Navigate to="/login" replace />
    return <Navigate to={dest} replace />
  }

  return null
}
