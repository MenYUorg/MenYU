import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './useAuth'

interface Props {
  roles: string[]
}

export function ProtectedRoute({ roles }: Props) {
  const { isLoggedIn, user, logout } = useAuth()
  console.log('[ProtectedRoute] isLoggedIn:', isLoggedIn, 'user:', user)
  if (!isLoggedIn || !user) return <Navigate to="/login" replace />
  const check = user.rol ?? user.tipo
  console.log('[ProtectedRoute] check:', check, 'roles:', roles, 'includes:', roles.includes(check))
  if (!roles.includes(check)) {
    console.log('[ProtectedRoute] role check failed, logging out')
    logout()
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}
