import { Navigate } from 'react-router-dom'
import { useAuth, LoginForm } from '@menyu/auth'

const DEST: Record<string, string> = {
  mozo: '/mozo',
  cocina: '/cocina',
}

export function LoginPage() {
  const { isLoggedIn, user } = useAuth()

  if (isLoggedIn && user) {
    const dest = DEST[user.tipo]
    if (!dest) return <Navigate to="/login" replace />
    return <Navigate to={dest} replace />
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 w-full max-w-sm p-8">
        <div className="mb-6 text-center">
          <span className="text-2xl font-bold text-indigo-600">MenYu</span>
        </div>
        <LoginForm subtitle="Panel de staff" />
      </div>
    </div>
  )
}
