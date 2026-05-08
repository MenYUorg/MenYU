import { useEffect, useState } from 'react'
import { useAuthStore } from './store/authStore'
import { LoginPage } from './pages/login/LoginPage'
import { Layout } from './components/layout/Layout'
import { MenuPage } from './pages/menu/MenuPage'
import { TablesPage } from './pages/tables'

export type PageKey = 'menu' | 'mesas'

export default function App() {
  const { isLoggedIn, loadContext } = useAuthStore()
  const [currentPage, setCurrentPage] = useState<PageKey>('menu')

  useEffect(() => {
    if (isLoggedIn) {
      loadContext().catch(() => undefined)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!isLoggedIn) return <LoginPage />

  return (
    <Layout currentPage={currentPage} onNavigate={setCurrentPage}>
      {currentPage === 'menu' && <MenuPage />}
      {currentPage === 'mesas' && <TablesPage />}
    </Layout>
  )
}
