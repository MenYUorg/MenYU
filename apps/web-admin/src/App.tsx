import { Suspense, lazy, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { RequireAuth, tieneAcceso, usePerfil } from '@menyu/auth-client'
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
import { useRolActual } from './store/contextStore'

// La consola de ROOT se descarga recién cuando entra un ROOT: OWNER y GERENTE no bajan ni su código ni su CSS.
const RootRoutes = lazy(() => import('./pages/root/RootRoutes'))

function Cargando() {
  return (
    <div role="status" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontFamily: 'Inter, sans-serif' }}>
      Cargando…
    </div>
  )
}

/** Solo ROOT entra a la consola; el resto vuelve a /admin. */
function SoloRoot({ children }: { children: ReactNode }) {
  const perfil = usePerfil()
  if (!perfil.esRoot) return <Navigate to="/admin" replace />
  return <>{children}</>
}

/**
 * Las pantallas de datos son para quien trabaja en la marca. Una cuenta ROOT sin membresías recibe 403 del backend en
 * todas (docs/auth/specs/auth.md, 4.3): va a su consola.
 */
function SoloAdministracion({ children }: { children: ReactNode }) {
  const rol = useRolActual()
  const perfil = usePerfil()
  if (!rol) return <Navigate to={perfil.esRoot ? '/root' : '/admin'} replace />
  return <>{children}</>
}

function MesasRouter() {
  if (useRolActual() === 'GERENTE') return <GerenceMesasPage />
  return <TablesPage />
}

function AdminRedirect() {
  const perfil = usePerfil()
  const rol = useRolActual()
  if (!rol && perfil.esRoot) return <Navigate to="/root" replace />
  if (rol === 'GERENTE') return <Navigate to="/admin/tables" replace />
  return <Navigate to="/admin/dashboard" replace />
}

export function App() {
  return (
    <BrowserRouter>
      {/* Sin sesión va a web-auth; con una cuenta sin acceso a esta app, web-auth la manda a la suya (sin loop). */}
      <RequireAuth puedeEntrar={(perfil) => tieneAcceso(perfil, 'admin')} cargando={<Cargando />}>
        <Routes>
          {/* Consola de ROOT: tiene su propio shell, por eso va afuera de AdminLayout. */}
          <Route
            path="/root/*"
            element={
              <SoloRoot>
                <Suspense fallback={<Cargando />}>
                  <RootRoutes />
                </Suspense>
              </SoloRoot>
            }
          />
          <Route element={<SoloAdministracion><AdminLayout /></SoloAdministracion>}>
            <Route path="/admin" element={<AdminRedirect />} />

            {/* OWNER y GERENTE */}
            <Route path="/admin/menu"   element={<AdminMenuPage />} />
            <Route path="/admin/tables" element={<MesasRouter />} />
            <Route path="/admin/mozos"  element={<MozosPage />} />

            {/* Solo OWNER */}
            <Route path="/admin/dashboard" element={
              <RoleGuard roles={['OWNER']}>
                <DashboardPage />
              </RoleGuard>
            } />
            <Route path="/admin/reportes" element={
              <RoleGuard roles={['OWNER']}>
                <ReportesPage />
              </RoleGuard>
            } />
            <Route path="/admin/pagos" element={
              <RoleGuard roles={['OWNER', 'GERENTE']}>
                <PagosPage />
              </RoleGuard>
            } />
            <Route path="/admin/auditoria" element={
              <RoleGuard roles={['OWNER']}>
                <AuditoriaPage />
              </RoleGuard>
            } />

            {/* Solo OWNER: logo y dirección de su marca y sus sucursales (ROOT no accede a esta información) */}
            <Route path="/admin/marca" element={
              <RoleGuard roles={['OWNER']}>
                <MarcaPage />
              </RoleGuard>
            } />

            {/* Solo GERENTE */}
            <Route path="/admin/pedidos" element={
              <RoleGuard roles={['GERENTE']}>
                <PedidosPage />
              </RoleGuard>
            } />
            <Route path="/admin/historial" element={
              <RoleGuard roles={['GERENTE']}>
                <HistorialSesionesPage />
              </RoleGuard>
            } />
            <Route path="/admin/toma-pedidos" element={
              <RoleGuard roles={['GERENTE']}>
                <TomaPedidosPage />
              </RoleGuard>
            } />
          </Route>
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </RequireAuth>
    </BrowserRouter>
  )
}
