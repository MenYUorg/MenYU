import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '@menyu/auth'
import { LoginPage } from './pages/login/LoginPage'
import { AdminLayout } from './pages/admin/AdminLayout'
import { AdminMenuPage } from './pages/admin/menu/AdminMenuPage'
import { TablesPage } from './pages/admin/tables/TablesPage'
import { PagosPage } from './pages/admin/pagos/PagosPage'
import { DashboardPage } from './pages/admin/dashboard/DashboardPage'
import { ReportesPage } from './pages/admin/reportes/ReportesPage'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute roles={['OWNER', 'ROOT', 'GERENTE']} />}>
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="/admin/dashboard" element={<DashboardPage />} />
            <Route path="/admin/menu" element={<AdminMenuPage />} />
            <Route path="/admin/tables" element={<TablesPage />} />
            <Route path="/admin/pagos" element={<PagosPage />} />
            <Route path="/admin/reportes" element={<ReportesPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
