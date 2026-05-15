import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

interface Props {
  tipo: string
}

export function ProtectedRoute({ tipo }: Props) {
  const { isLoggedIn, user } = useAuthStore()
  if (!isLoggedIn || !user) return <Navigate to="/login" replace />
  if (user.tipo !== tipo) return <Navigate to="/login" replace />
  return <Outlet />
}
