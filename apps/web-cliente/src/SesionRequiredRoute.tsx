import { Navigate, Outlet } from 'react-router-dom'
import { useSessionStore } from './store/sessionStore'

export function SesionRequiredRoute() {
  const sesionId      = useSessionStore((s) => s.sesionId)
  const restauranteId = useSessionStore((s) => s.restauranteId)

  if (!sesionId || !restauranteId) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
