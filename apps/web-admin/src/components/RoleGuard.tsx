import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@menyu/auth'

/** Deja pasar solo a los roles indicados; el resto vuelve a /admin. */
export function RoleGuard({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { user } = useAuth()
  if (!user?.rol || !roles.includes(user.rol)) {
    return <Navigate to="/admin" replace />
  }
  return <>{children}</>
}
