import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '@menyu/auth'
import { LoginPage } from './pages/login/LoginPage'
import { AdminLayout } from './pages/admin/AdminLayout'
import { AdminMenuPage } from './pages/admin/menu/AdminMenuPage'
import { TablesPage } from './pages/admin/tables/TablesPage'
import { PagosPage } from './pages/admin/pagos/PagosPage'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute roles={['admin']} />}>
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<Navigate to="/admin/menu" replace />} />
            <Route path="/admin/menu" element={<AdminMenuPage />} />
            <Route path="/admin/tables" element={<TablesPage />} />
            <Route path="/admin/pagos" element={<PagosPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
