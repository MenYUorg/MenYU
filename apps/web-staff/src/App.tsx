import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { ProtectedRoute } from '@menyu/auth'
import { LoginPage } from './pages/login/LoginPage'
import { MozoNotifications } from './components/MozoNotifications'

const MozoPanel         = lazy(() => import('./pages/mozo/MozoPanel').then((m) => ({ default: m.MozoPanel })))
const MesasPage         = lazy(() => import('./pages/mozo/MesasPage').then((m) => ({ default: m.MesasPage })))
const TomaPedidosPage   = lazy(() => import('./pages/mozo/TomaPedidosPage').then((m) => ({ default: m.TomaPedidosPage })))
const PedidosPage       = lazy(() => import('./pages/mozo/PedidosPage').then((m) => ({ default: m.PedidosPage })))
const HistorialPage     = lazy(() => import('./pages/mozo/HistorialPage').then((m) => ({ default: m.HistorialPage })))
const CocinaPage        = lazy(() => import('./pages/cocina/CocinaPage').then((m) => ({ default: m.CocinaPage })))
const SelectorPage      = lazy(() => import('./pages/selector/SelectorPage').then((m) => ({ default: m.SelectorPage })))
const PagosMozo         = lazy(() => import('./pages/mozo/PagosMozo').then((m) => ({ default: m.PagosMozo })))

function MozoLayout() {
  return (
    <>
      <MozoNotifications />
      <Outlet />
    </>
  )
}

function Loader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f9fafb' }}>
      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, color: '#9ca3af' }}>Cargando…</span>
    </div>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Loader />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute roles={['mozo', 'cocina', 'admin']} />}>
            <Route path="/selector" element={<SelectorPage />} />
            <Route path="/cocina"   element={<CocinaPage />} />
            <Route path="/mozo/pagos" element={<PagosMozo />} />

            {/* Rutas del mozo — MozoLayout monta MozoNotifications una sola vez */}
            <Route element={<MozoLayout />}>
              <Route path="/mozo"              element={<MozoPanel />} />
              <Route path="/mozo/mesas"        element={<MesasPage />} />
              <Route path="/mozo/toma-pedidos" element={<TomaPedidosPage />} />
              <Route path="/mozo/pedidos"      element={<PedidosPage />} />
              <Route path="/mozo/historial"    element={<HistorialPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
