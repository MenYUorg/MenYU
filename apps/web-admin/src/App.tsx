import { Suspense, lazy } from 'react'
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
import { HistorialSesionesPage } from './pages/admin/gerente/HistorialSesionesPage'
import { TomaPedidosPage } from './pages/admin/gerente/TomaPedidosPage'
import { AuditoriaPage } from './pages/admin/auditoria/AuditoriaPage'
import { MarcaPage } from './pages/admin/marca/MarcaPage'
import { RoleGuard } from './components/RoleGuard'

// La consola de ROOT se descarga recién cuando entra un ROOT: OWNER y GERENTE no bajan ni su código ni su CSS.
const RootRoutes = lazy(() => import('./pages/root/RootRoutes'))

function CargandoConsola() {
  return (
    <div role="status" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontFamily: 'Inter, sans-serif' }}>
      Cargando…
    </div>
  )
}

function MesasRouter() {
  const { user } = useAuth()
  if (user?.rol === 'GERENTE') return <GerenceMesasPage />
  return <TablesPage />
}

function AdminRedirect() {
  const { user } = useAuth()
  if (user?.rol === 'ROOT') {
    return <Navigate to="/root" replace />
  }
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
          {/* Consola de ROOT: tiene su propio shell, por eso va afuera de AdminLayout. Solo entra ROOT; el resto vuelve a /admin. */}
          <Route
            path="/root/*"
            element={
              <RoleGuard roles={['ROOT']}>
                <Suspense fallback={<CargandoConsola />}>
                  <RootRoutes />
                </Suspense>
              </RoleGuard>
            }
          />
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
              <RoleGuard roles={['OWNER', 'GERENTE']}>
                <PagosPage />
              </RoleGuard>
            } />
            <Route path="/admin/auditoria" element={
              <RoleGuard roles={['OWNER', 'ROOT']}>
                <AuditoriaPage />
              </RoleGuard>
            } />

            {/* Solo OWNER: logo y dirección de su marca y sus sucursales (ROOT no accede a esta información) */}
            <Route path="/admin/marca" element={
              <RoleGuard roles={['OWNER']}>
                <MarcaPage />
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
                <HistorialSesionesPage />
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
