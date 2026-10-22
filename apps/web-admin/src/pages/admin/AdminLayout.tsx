import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { logout, usePerfil } from '@menyu/auth-client'
import {
  preferenciaDeLaUrl,
  useContextStore,
  useRolActual,
  type RolDeAdmin,
} from '../../store/contextStore'
import { Shell, type NavSection } from '../../components/shell/Shell'
import {
  LayoutDashboard,
  Grid2x2,
  UtensilsCrossed,
  Users,
  BarChart2,
  ChevronDown,
  ClipboardList,
  History,
  ShoppingBag,
  Shield as ShieldIcon,
  CreditCard,
  Store,
} from 'lucide-react'

/* ── nav structure ─────────────────────────────────────────────────────────── */
// Solo OWNER y GERENTE: ROOT no entra a las pantallas de datos (docs/auth/specs/auth.md, 4.3), tiene su consola en /root.
const NAV_BY_ROL: Record<RolDeAdmin, NavSection[]> = {
  OWNER: [
    {
      label: 'OPERACIÓN',
      items: [
        { to: '/admin/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
        { to: '/admin/tables',    label: 'Mesas',     Icon: Grid2x2 },
        { to: '/admin/pagos',     label: 'Caja',      Icon: CreditCard },
      ],
    },
    {
      label: 'CATÁLOGO',
      items: [
        { to: '/admin/menu', label: 'Menú', Icon: UtensilsCrossed },
      ],
    },
    {
      label: 'PERSONAL',
      items: [
        { to: '/admin/mozos', label: 'Mozos', Icon: Users },
      ],
    },
    {
      label: 'ANÁLISIS',
      items: [
        { to: '/admin/reportes',  label: 'Reportes',  Icon: BarChart2 },
        { to: '/admin/auditoria', label: 'Auditoría', Icon: ShieldIcon },
      ],
    },
    {
      label: 'CONFIGURACIÓN',
      items: [
        { to: '/admin/marca', label: 'Marca y sucursales', Icon: Store },
      ],
    },
  ],
  GERENTE: [
    {
      label: 'OPERACIÓN',
      items: [
        { to: '/admin/tables',        label: 'Mesas',            Icon: Grid2x2 },
        { to: '/admin/pagos',         label: 'Caja',             Icon: CreditCard },
        { to: '/admin/toma-pedidos',  label: 'Toma de pedidos',  Icon: ShoppingBag },
        { to: '/admin/pedidos',       label: 'Pedidos',          Icon: ClipboardList },
        { to: '/admin/historial',     label: 'Historial',        Icon: History },
      ],
    },
    {
      label: 'CATÁLOGO',
      items: [
        { to: '/admin/menu', label: 'Menú', Icon: UtensilsCrossed },
      ],
    },
    {
      label: 'PERSONAL',
      items: [
        { to: '/admin/mozos', label: 'Mozos', Icon: Users },
      ],
    },
  ],
}

const SECTION_TITLES: Record<string, string> = {
  '/admin/dashboard':     'Dashboard',
  '/admin/menu':          'Catálogo',
  '/admin/tables':        'Mesas',
  '/admin/reportes':      'Reportes',
  '/admin/auditoria':     'Auditoría',
  '/admin/mozos':         'Mozos',
  '/admin/pagos':         'Caja',
  '/admin/pedidos':       'Pedidos',
  '/admin/historial':     'Historial',
  '/admin/toma-pedidos':  'Toma de pedidos',
  '/admin/marca':         'Marca y sucursales',
}

/* ── marca y restaurante elegido (bloque debajo del logo) ──────────────────── */
function SelectorDeRestaurante() {
  const { marcas, selectedMarcaId, restaurantes, selectedRestauranteId, setRestaurante } = useContextStore()

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selectedRestaurante = restaurantes.find((r) => r.id === selectedRestauranteId)
  const marca = marcas.find((m) => m.id === selectedMarcaId)

  return (
    <div ref={dropdownRef} className="relative">
      <div
        style={{
          background:   'rgba(255,255,255,0.08)',
          borderRadius: 8,
          padding:      '10px 12px',
          margin:       '16px 0 20px',
        }}
      >
        <span
          style={{
            display:      'block',
            fontFamily:   'Montserrat, sans-serif',
            fontWeight:   700,
            fontSize:     16,
            color:        'white',
            marginBottom: 6,
          }}
        >
          {marca?.nombre ?? '—'}
        </span>

        <button
          onClick={() => restaurantes.length > 1 && setDropdownOpen((o) => !o)}
          className="w-full flex items-center justify-between text-left"
          style={{
            background: 'none',
            border:     'none',
            padding:    0,
            cursor:     restaurantes.length > 1 ? 'pointer' : 'default',
          }}
        >
          <span
            className="truncate"
            style={{
              fontFamily: 'Inter, sans-serif',
              fontSize:   11,
              color:      'rgba(255,255,255,0.55)',
            }}
          >
            {selectedRestaurante?.nombre ?? 'Sin restaurante'}
          </span>
          {restaurantes.length > 1 && (
            <ChevronDown size={14} color="rgba(255,255,255,0.4)" style={{ flexShrink: 0 }} />
          )}
        </button>
      </div>

      {dropdownOpen && (
        <div
          className="absolute left-0 right-0 rounded-lg overflow-hidden z-50"
          style={{
            top:        16,
            background: '#1e2a4a',
            border:     '1px solid rgba(255,255,255,0.12)',
          }}
        >
          {restaurantes.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                setRestaurante(r.id)
                setDropdownOpen(false)
              }}
              className="w-full text-left px-3 py-2.5"
              style={{
                background: r.id === selectedRestauranteId ? 'rgba(232,86,58,0.2)' : 'transparent',
                color:      r.id === selectedRestauranteId ? 'white' : 'rgba(255,255,255,0.7)',
                fontFamily: 'Inter, sans-serif',
                fontWeight: r.id === selectedRestauranteId ? 600 : 400,
                fontSize:   11,
                border:     'none',
                cursor:     'pointer',
              }}
            >
              {r.nombre}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── layout ────────────────────────────────────────────────────────────────── */
export function AdminLayout() {
  const perfil = usePerfil()
  const navSections = NAV_BY_ROL[useRolActual() ?? 'GERENTE']
  const { restaurantes, selectedRestauranteId, loadContext } = useContextStore()
  const location = useLocation()
  // web-auth manda ?marcaId= o ?restauranteId= con lo que eligió la persona. Se lee del primer render, antes de que
  // AdminRedirect cambie la URL, y vale como preferencia: el acceso lo decide el backend.
  const busquedaInicial = useRef(location.search).current

  useEffect(() => {
    void loadContext(perfil, preferenciaDeLaUrl(busquedaInicial))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedRestaurante = restaurantes.find((r) => r.id === selectedRestauranteId)

  const sectionTitle =
    Object.entries(SECTION_TITLES).find(([path]) =>
      location.pathname.startsWith(path),
    )?.[1] ?? 'Panel'

  return (
    <Shell
      secciones={navSections}
      titulo={sectionTitle}
      subtitulo={selectedRestaurante?.nombre}
      contexto={<SelectorDeRestaurante />}
      email={perfil.email}
      onCerrarSesion={() => { void logout() }}
    />
  )
}
