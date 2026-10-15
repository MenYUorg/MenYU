import { Navigate, Outlet } from 'react-router-dom'
import { useComensalStore } from './store/comensalStore'

export function ComensalRequiredRoute() {
  const comensalId = useComensalStore((s) => s.comensalId)

  if (!comensalId) {
    return <Navigate to="/elegir-nombre" replace />
  }

  return <Outlet />
}
