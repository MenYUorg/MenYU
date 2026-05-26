import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './useAuth'

interface Props {
  roles: string[]
}

export function ProtectedRoute({ roles }: Props) {
  const { isLoggedIn, user, logout } = useAuth()
  if (!isLoggedIn || !user) return <Navigate to="/login" replace />
  const check = user.rol ?? user.tipo
  if (!roles.includes(check)) {
    // Token inválido o sin rol — limpiar para evitar loop con LoginPage
    logout()
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}
