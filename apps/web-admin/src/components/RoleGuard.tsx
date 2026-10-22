import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useRolActual, type RolDeAdmin } from '../store/contextStore'

/** Deja pasar solo a los roles indicados en el restaurante elegido; el resto vuelve a /admin. */
export function RoleGuard({ roles, children }: { roles: RolDeAdmin[]; children: ReactNode }) {
  const rol = useRolActual()
  if (!rol || !roles.includes(rol)) {
    return <Navigate to="/admin" replace />
  }
  return <>{children}</>
}
