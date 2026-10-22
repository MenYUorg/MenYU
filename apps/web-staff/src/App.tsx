import { lazy, Suspense, useEffect, useRef, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import { RequireAuth, tieneAcceso, usePerfil } from '@menyu/auth-client'
import { MozoNotifications } from './components/MozoNotifications'
import { cerrarSesion } from './services/socket'
import {
  preferenciaDeLaUrl,
  puedeVerCocina,
  puedeVerMozo,
  useContextoStore,
  useRolesActuales,
} from './store/contextoStore'

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
    <div role="status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f9fafb' }}>
      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, color: '#9ca3af' }}>Cargando…</span>
    </div>
  )
}

/**
 * Quien tiene acceso a staff pero no trabaja en ningún restaurante disponible: un OWNER de una marca sin sucursales, o
 * con todas dadas de baja. Todas las pantallas son de un restaurante, así que no hay nada que mostrar.
 */
function SinRestaurante() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, background: '#F6F7F9', padding: 24 }}>
      <p style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 20, color: '#2D3561', margin: 0, textAlign: 'center' }}>
        Todavía no tenés un restaurante asignado
      </p>
      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, color: '#6B7280', margin: 0, textAlign: 'center', maxWidth: 420 }}>
        Pedile a tu encargado que te dé acceso a un restaurante activo y volvé a entrar.
      </p>
      <button
        onClick={() => void cerrarSesion()}
        style={{
          marginTop: 6, padding: '9px 18px', borderRadius: 8, border: '1px solid #E6E8EF', background: 'white',
          fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#374151', cursor: 'pointer',
        }}
      >
        Cerrar sesión
      </button>
    </div>
  )
}

/**
 * Arma el contexto con el perfil una sola vez. La preferencia (`?restauranteId=`) se lee del primer render, antes de
 * que la redirección por rol limpie la URL, igual que en web-admin.
 */
function ContextoDeStaff({ children }: { children: ReactNode }) {
  const perfil = usePerfil()
  const cargarContexto = useContextoStore((s) => s.cargarContexto)
  const restaurantes = useContextoStore((s) => s.restaurantes)
  const busquedaInicial = useRef(useLocation().search).current

  useEffect(() => {
    cargarContexto(perfil, preferenciaDeLaUrl(busquedaInicial))
  }, [cargarContexto, perfil, busquedaInicial])

  if (restaurantes.length === 0) return <SinRestaurante />
  return <>{children}</>
}

/** La vista de cocina es de COCINA; un OWNER o GERENTE también la ve (docs/auth/specs/auth.md, Roles). */
function SoloCocina({ children }: { children: ReactNode }) {
  const roles = useRolesActuales()
  if (!puedeVerCocina(roles)) return <Navigate to="/" replace />
  return <>{children}</>
}

/** La vista del mozo es de MOZO y JEFE_SALON; un OWNER o GERENTE también la ve. */
function SoloMozo({ children }: { children: ReactNode }) {
  const roles = useRolesActuales()
  if (!puedeVerMozo(roles)) return <Navigate to="/" replace />
  return <>{children}</>
}

/**
 * A dónde entra cada rol. Con una sola vista posible va derecho a ella; con las dos (OWNER y GERENTE), al selector,
 * que también pide el restaurante cuando trabaja en varios.
 */
function StaffRedirect() {
  const roles = useRolesActuales()
  const verCocina = puedeVerCocina(roles)
  const verMozo = puedeVerMozo(roles)
  if (verMozo && !verCocina) return <Navigate to="/mozo" replace />
  if (verCocina && !verMozo) return <Navigate to="/cocina" replace />
  return <Navigate to="/selector" replace />
}

export function App() {
  return (
    <BrowserRouter>
      {/* Sin sesión va a web-auth; con una cuenta sin acceso a esta app, web-auth la manda a la suya (sin loop). */}
      <RequireAuth puedeEntrar={(perfil) => tieneAcceso(perfil, 'staff')} cargando={<Loader />}>
        <Suspense fallback={<Loader />}>
          <ContextoDeStaff>
            <Routes>
              <Route path="/" element={<StaffRedirect />} />
              <Route path="/selector" element={<SelectorPage />} />
              <Route path="/cocina" element={<SoloCocina><CocinaPage /></SoloCocina>} />
              <Route path="/mozo/pagos" element={<SoloMozo><PagosMozo /></SoloMozo>} />

              {/* Rutas del mozo — MozoLayout monta MozoNotifications una sola vez */}
              <Route element={<SoloMozo><MozoLayout /></SoloMozo>}>
                <Route path="/mozo"              element={<MozoPanel />} />
                <Route path="/mozo/mesas"        element={<MesasPage />} />
                <Route path="/mozo/toma-pedidos" element={<TomaPedidosPage />} />
                <Route path="/mozo/pedidos"      element={<PedidosPage />} />
                <Route path="/mozo/historial"    element={<HistorialPage />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ContextoDeStaff>
        </Suspense>
      </RequireAuth>
    </BrowserRouter>
  )
}
