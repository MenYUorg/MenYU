import { Outlet } from 'react-router-dom'
import { useAuth } from './useAuth'
import { resolveLoginUrl } from './resolveLoginUrl'

interface Props {
  roles: string[]
}

export function ProtectedRoute({ roles }: Props) {
  const { isLoggedIn, user, logout } = useAuth()
  if (!isLoggedIn || !user) {
    window.location.replace(resolveLoginUrl())
    return null
  }
  const check = user.rol ?? user.tipo
  if (!roles.includes(check)) {
    logout()
    window.location.replace(resolveLoginUrl())
    return null
  }
  return <Outlet />
}
