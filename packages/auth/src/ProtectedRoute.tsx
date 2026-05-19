import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './useAuth'

interface Props {
  roles: string[]
}

export function ProtectedRoute({ roles }: Props) {
  const { isLoggedIn, user } = useAuth()
  if (!isLoggedIn || !user) return <Navigate to="/login" replace />
  if (!roles.includes(user.tipo)) return <Navigate to="/login" replace />
  return <Outlet />
}
