import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@menyu/auth'
import { useContextStore } from '../../store/contextStore'
import {
  LayoutDashboard,
  Grid2x2,
  UtensilsCrossed,
  Users,
  BarChart2,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react'

/* ── nav structure ─────────────────────────────────────────────────────────── */
const NAV_SECTIONS = [
  {
    label: 'OPERACIÓN',
    items: [
      { to: '/admin/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
      { to: '/admin/tables',    label: 'Mesas',     Icon: Grid2x2         },
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
      { to: null, label: 'Mozos', Icon: Users },
    ],
  },
  {
    label: 'ANÁLISIS',
    items: [
      { to: null, label: 'Reportes', Icon: BarChart2 },
    ],
  },
] as const

const SECTION_TITLES: Record<string, string> = {
  '/admin/dashboard': 'Dashboard',
  '/admin/menu':      'Catálogo',
  '/admin/tables':    'Mesas',
}

/* ── nav items ─────────────────────────────────────────────────────────────── */
function NavItem({ to, label, Icon }: { to: string; label: string; Icon: LucideIcon }) {
  const [hovered, setHovered] = useState(false)
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        display:        'flex',
        alignItems:     'center',
        gap:            10,
        padding:        '10px 12px',
        borderRadius:   8,
        background:     isActive ? '#E8563A' : hovered ? 'rgba(255,255,255,0.06)' : 'transparent',
        color:          isActive ? 'white' : 'rgba(255,255,255,0.7)',
        fontFamily:     'Inter, sans-serif',
        fontWeight:     isActive ? 600 : 400,
        fontSize:       13,
        textDecoration: 'none',
        transition:     'background 0.15s',
        userSelect:     'none',
      })}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Icon size={15} />
      {label}
    </NavLink>
  )
}

function DisabledNavItem({ label, Icon }: { label: string; Icon: LucideIcon }) {
  return (
    <div style={{
      display:      'flex',
      alignItems:   'center',
      gap:          10,
      padding:      '10px 12px',
      borderRadius: 8,
      color:        'rgba(255,255,255,0.25)',
      fontFamily:   'Inter, sans-serif',
      fontSize:     13,
      cursor:       'not-allowed',
      userSelect:   'none',
    }}>
      <Icon size={15} />
      {label}
    </div>
  )
}

/* ── layout ────────────────────────────────────────────────────────────────── */
export function AdminLayout() {
  const { user, logout } = useAuth()
  const { marcas, selectedMarcaId, restaurantes, selectedRestauranteId, setRestaurante, loadContext } = useContextStore()
  const location = useLocation()

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void loadContext()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  const sectionTitle =
    Object.entries(SECTION_TITLES).find(([path]) => location.pathname.startsWith(path))?.[1] ?? 'Panel'

  const emailInitials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : '?'

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">

      {/* ── Sidebar ── */}
      <aside
        className="flex flex-col shrink-0"
        style={{ width: 220, background: '#2D3561' }}
      >
        {/* Logo */}
        <div
          className="px-5 py-4 flex items-center gap-2"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
        >
          <span style={{
            color:      'white',
            fontFamily: 'Montserrat, sans-serif',
            fontWeight: 800,
            fontSize:   17,
            letterSpacing: '-0.02em',
          }}>
            MENY
          </span>
          <div style={{
            width:          26,
            height:         26,
            borderRadius:   6,
            background:     '#E8563A',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            flexShrink:     0,
          }}>
            <span style={{
              color:      'white',
              fontFamily: 'Montserrat, sans-serif',
              fontWeight: 800,
              fontSize:   13,
            }}>
              U
            </span>
          </div>
        </div>

        {/* Brand + restaurant selector */}
        <div className="px-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 12 }}>
          <div ref={dropdownRef} className="relative">
            <div
              style={{
                background:   'rgba(255,255,255,0.08)',
                borderRadius: 8,
                padding:      '10px 12px',
                margin:       '16px 0 20px',
              }}
            >
              {/* Marca */}
              <span style={{
                display:    'block',
                fontFamily: 'Montserrat, sans-serif',
                fontWeight: 700,
                fontSize:   16,
                color:      'white',
                marginBottom: 6,
              }}>
                {marca?.nombre ?? '—'}
              </span>

              {/* Selector de restaurante */}
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
                style={{ top: 16, background: '#1e2a4a', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                {restaurantes.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => { setRestaurante(r.id); setDropdownOpen(false) }}
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
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              <p style={{
                color:         'rgba(255,255,255,0.4)',
                fontSize:      10,
                fontFamily:    'Montserrat, sans-serif',
                fontWeight:    700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                margin:        0,
                padding:       '16px 12px 8px',
              }}>
                {section.label}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) =>
                  item.to ? (
                    <NavItem key={item.to} to={item.to} label={item.label} Icon={item.Icon} />
                  ) : (
                    <DisabledNavItem key={item.label} label={item.label} Icon={item.Icon} />
                  ),
                )}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <p
            className="truncate mb-2"
            style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter, sans-serif', margin: '0 0 8px' }}
          >
            {user?.email}
          </p>
          <button
            onClick={logout}
            style={{
              background: 'none',
              border:     'none',
              cursor:     'pointer',
              fontSize:   12,
              color:      'rgba(255,255,255,0.35)',
              fontFamily: 'Inter, sans-serif',
              padding:    0,
            }}
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Topbar */}
        <header
          className="bg-white px-6 flex items-center justify-between"
          style={{ height: 56, flexShrink: 0, borderBottom: '1px solid #e5e7eb' }}
        >
          <div>
            <h2 style={{
              fontFamily: 'Montserrat, sans-serif',
              fontWeight: 700,
              fontSize:   18,
              color:      '#2D3561',
              margin:     0,
              lineHeight: 1.2,
            }}>
              {sectionTitle}
            </h2>
            {selectedRestaurante && (
              <p style={{
                fontFamily: 'Inter, sans-serif',
                fontSize:   13,
                color:      '#9CA3AF',
                margin:     0,
                lineHeight: 1.2,
              }}>
                {selectedRestaurante.nombre}
              </p>
            )}
          </div>

          <div style={{
            width:          36,
            height:         36,
            borderRadius:   '50%',
            background:     '#E8563A',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            flexShrink:     0,
          }}>
            <span style={{
              color:      'white',
              fontFamily: 'Montserrat, sans-serif',
              fontWeight: 700,
              fontSize:   14,
            }}>
              {emailInitials}
            </span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
