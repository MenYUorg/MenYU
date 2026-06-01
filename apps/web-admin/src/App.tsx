import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute, useAuth } from '@menyu/auth'
import { LoginPage } from './pages/login/LoginPage'
import { AdminLayout } from './pages/admin/AdminLayout'
import { AdminMenuPage } from './pages/admin/menu/AdminMenuPage'
import { TablesPage } from './pages/admin/tables/TablesPage'
import { PagosPage } from './pages/admin/pagos/PagosPage'
import { DashboardPage } from './pages/admin/dashboard/DashboardPage'
import { ReportesPage } from './pages/admin/reportes/ReportesPage'
import { MozosPage } from './pages/admin/mozos/MozosPage'
import { GerenceMesasPage } from './pages/admin/gerente/GerenceMesasPage'
import { PedidosPage } from './pages/admin/gerente/PedidosPage'
import { HistorialPage } from './pages/admin/gerente/HistorialPage'
import { TomaPedidosPage } from './pages/admin/gerente/TomaPedidosPage'
import { AuditoriaPage } from './pages/admin/auditoria/AuditoriaPage'

function RoleGuard({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const { user } = useAuth()
  if (!user?.rol || !roles.includes(user.rol)) {
    return <Navigate to="/admin" replace />
  }
  return <>{children}</>
}

function MesasRouter() {
  const { user } = useAuth()
  if (user?.rol === 'GERENTE') return <GerenceMesasPage />
  return <TablesPage />
}

function AdminRedirect() {
  const { user } = useAuth()
  if (user?.rol === 'GERENTE') {
    return <Navigate to="/admin/tables" replace />
  }
  return <Navigate to="/admin/dashboard" replace />
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute roles={['OWNER', 'ROOT', 'GERENTE']} />}>
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<AdminRedirect />} />

            {/* Todos los roles */}
            <Route path="/admin/menu"   element={<AdminMenuPage />} />
            <Route path="/admin/tables" element={<MesasRouter />} />
            <Route path="/admin/mozos"  element={<MozosPage />} />

            {/* Solo OWNER y ROOT */}
            <Route path="/admin/dashboard" element={
              <RoleGuard roles={['OWNER', 'ROOT']}>
                <DashboardPage />
              </RoleGuard>
            } />
            <Route path="/admin/reportes" element={
              <RoleGuard roles={['OWNER', 'ROOT']}>
                <ReportesPage />
              </RoleGuard>
            } />
            <Route path="/admin/pagos" element={
              <RoleGuard roles={['OWNER', 'ROOT']}>
                <PagosPage />
              </RoleGuard>
            } />
            <Route path="/admin/auditoria" element={
              <RoleGuard roles={['OWNER', 'ROOT']}>
                <AuditoriaPage />
              </RoleGuard>
            } />

            {/* Solo GERENTE (y ROOT) */}
            <Route path="/admin/pedidos" element={
              <RoleGuard roles={['GERENTE', 'ROOT']}>
                <PedidosPage />
              </RoleGuard>
            } />
            <Route path="/admin/historial" element={
              <RoleGuard roles={['GERENTE', 'ROOT']}>
                <HistorialPage />
              </RoleGuard>
            } />
            <Route path="/admin/toma-pedidos" element={
              <RoleGuard roles={['GERENTE', 'ROOT']}>
                <TomaPedidosPage />
              </RoleGuard>
            } />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
