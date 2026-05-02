import { useEffect } from 'react'
import { useAuthStore } from './store/authStore'
import { LoginPage } from './pages/login/LoginPage'
import { Layout } from './components/layout/Layout'
import { MenuPage } from './pages/menu/MenuPage'

export default function App() {
  const { isLoggedIn, loadContext } = useAuthStore()

  useEffect(() => {
    if (isLoggedIn) {
      loadContext().catch(() => undefined)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!isLoggedIn) return <LoginPage />

  return (
    <Layout>
      <MenuPage />
    </Layout>
  )
}
