import { useEffect, useState } from 'react'
import { useAuthStore } from './store/authStore'
import { LoginPage } from './pages/login/LoginPage'
import { Layout } from './components/layout/Layout'
import { MenuPage } from './pages/menu/MenuPage'
import { TablesPage } from './pages/tables'

export type PageKey = 'menu' | 'mesas'

export default function App() {
  const { isLoggedIn, user, logout, loadContext } = useAuthStore()
  const [currentPage, setCurrentPage] = useState<PageKey>('menu')

  useEffect(() => {
    if (isLoggedIn) {
      loadContext().catch(() => undefined)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!isLoggedIn) return <LoginPage />

  if (user?.tipo !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 w-full max-w-sm p-8 text-center">
          <p className="text-sm font-medium text-red-600 mb-4">
            Tu cuenta no tiene acceso al panel administrativo.
          </p>
          <button
            onClick={() => logout()}
            className="text-sm text-indigo-600 hover:underline"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    )
  }

  return (
    <Layout currentPage={currentPage} onNavigate={setCurrentPage}>
      {currentPage === 'menu' && <MenuPage />}
      {currentPage === 'mesas' && <TablesPage />}
    </Layout>
  )
}
