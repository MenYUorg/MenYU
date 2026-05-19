import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, LoginForm } from '@menyu/auth'
import { useContextStore } from '../../store/contextStore'

export function LoginPage() {
  const { isLoggedIn, user } = useAuth()
  const navigate = useNavigate()
  const loadContext = useContextStore((s) => s.loadContext)

  useEffect(() => {
    if (!isLoggedIn || !user || user.tipo !== 'admin') return
    void loadContext()
    navigate('/admin', { replace: true })
  }, [isLoggedIn]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 w-full max-w-sm p-8">
        <div className="mb-6 text-center">
          <span className="text-2xl font-bold text-indigo-600">MenYu</span>
        </div>
        <LoginForm subtitle="Panel de administración" />
      </div>
    </div>
  )
}
