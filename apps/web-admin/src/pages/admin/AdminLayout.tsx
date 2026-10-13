import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@menyu/auth'
import { useContextStore } from '../../store/contextStore'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import {
  LayoutDashboard,
  Grid2x2,
  UtensilsCrossed,
  Users,
  BarChart2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  X,
  ClipboardList,
  History,
  ShoppingBag,
  Shield as ShieldIcon,
  CreditCard,
  Store,
  type LucideIcon,
} from 'lucide-react'

/* ── nav structure ─────────────────────────────────────────────────────────── */
interface NavSectionItem {
  to: string
  label: string
  Icon: LucideIcon
}
interface NavSection {
  label: string
  items: NavSectionItem[]
}

const NAV_BY_ROL: Record<string, NavSection[]> = {
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
NAV_BY_ROL['ROOT'] = [
  {
    label: 'OPERACIÓN',
    items: [
      { to: '/admin/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
      { to: '/admin/tables',    label: 'Mesas',     Icon: Grid2x2 },
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
]

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

const SIDEBAR_KEY = 'menyu-sidebar-open'

/* ── nav items ─────────────────────────────────────────────────────────────── */
function NavItem({
  to,
  label,
  Icon,
  collapsed,
  touch = false,
}: {
  to: string
  label: string
  Icon: LucideIcon
  collapsed: boolean
  touch?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <NavLink
      to={to}
      title={collapsed ? label : undefined}
      style={({ isActive }) => ({
        display:        'flex',
        alignItems:     'center',
        gap:            collapsed ? 0 : 10,
        padding:        collapsed ? '10px 0' : touch ? '13px 12px' : '10px 12px',
        borderRadius:   8,
        justifyContent: collapsed ? 'center' : 'flex-start',
        background:     isActive ? '#E8563A' : hovered ? 'rgba(255,255,255,0.06)' : 'transparent',
        color:          isActive ? 'white' : 'rgba(255,255,255,0.7)',
        fontFamily:     'Inter, sans-serif',
        fontWeight:     isActive ? 600 : 400,
        fontSize:       touch ? 14 : 13,
        textDecoration: 'none',
        transition:     'background 0.15s',
        userSelect:     'none',
      })}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Icon size={collapsed ? 20 : 15} />
      {!collapsed && label}
    </NavLink>
  )
}

function DisabledNavItem({
  label,
  Icon,
  collapsed,
}: {
  label: string
  Icon: LucideIcon
  collapsed: boolean
}) {
  return (
    <div
      title={collapsed ? label : undefined}
      style={{
        display:        'flex',
        alignItems:     'center',
        gap:            collapsed ? 0 : 10,
        padding:        collapsed ? '10px 0' : '10px 12px',
        borderRadius:   8,
        justifyContent: collapsed ? 'center' : 'flex-start',
        color:          'rgba(255,255,255,0.25)',
        fontFamily:     'Inter, sans-serif',
        fontSize:       13,
        cursor:         'not-allowed',
        userSelect:     'none',
      }}
    >
      <Icon size={collapsed ? 20 : 15} />
      {!collapsed && label}
    </div>
  )
}

const Shield = () => (
  <div
    style={{
      width:          26,
      height:         26,
      borderRadius:   6,
      background:     '#E8563A',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      flexShrink:     0,
    }}
  >
    <span
      style={{
        color:      'white',
        fontFamily: 'Montserrat, sans-serif',
        fontWeight: 800,
        fontSize:   13,
      }}
    >
      U
    </span>
  </div>
)

/* ── layout ────────────────────────────────────────────────────────────────── */
export function AdminLayout() {
  const { user, logout } = useAuth()
  const navSections = NAV_BY_ROL[user?.rol ?? 'GERENTE'] ?? NAV_BY_ROL['GERENTE']
  const { marcas, selectedMarcaId, restaurantes, selectedRestauranteId, setRestaurante, loadContext } =
    useContextStore()
  const location = useLocation()

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [mobileOpen, setMobileOpen] = useState(false)

  // Estado persistido del sidebar en escritorio. En celular el menú es un drawer y siempre se ve expandido.
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState<boolean>(() => {
    const stored = localStorage.getItem(SIDEBAR_KEY)
    return stored === null ? true : stored === 'true'
  })
  const sidebarOpen = isDesktop ? desktopSidebarOpen : true

  const toggleSidebar = () => {
    setDesktopSidebarOpen((prev) => {
      const next = !prev
      localStorage.setItem(SIDEBAR_KEY, String(next))
      return next
    })
  }

  // El drawer se cierra al navegar y al pasar a escritorio; también con Escape.
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname, isDesktop])

  useEffect(() => {
    if (!mobileOpen) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [mobileOpen])

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
    Object.entries(SECTION_TITLES).find(([path]) =>
      location.pathname.startsWith(path),
    )?.[1] ?? 'Panel'

  const emailInitials = user?.email ? user.email.slice(0, 2).toUpperCase() : '?'

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50" style={{ height: '100dvh' }}>

      {/* ── Overlay del drawer (solo celular) ── */}
      {!isDesktop && (
        <div
          data-testid="drawer-overlay"
          aria-hidden="true"
          onClick={() => setMobileOpen(false)}
          style={{
            position:      'fixed',
            inset:         0,
            zIndex:        40,
            background:    'rgba(45,53,97,0.45)',
            opacity:       mobileOpen ? 1 : 0,
            pointerEvents: mobileOpen ? 'auto' : 'none',
            transition:    'opacity 0.25s ease',
          }}
        />
      )}

      {/* ── Sidebar wrapper — en escritorio transiciona el ancho; en celular es un drawer fijo ── */}
      <div
        data-testid="sidebar"
        aria-hidden={!isDesktop && !mobileOpen}
        style={
          isDesktop
            ? {
                position:   'relative',
                flexShrink: 0,
                width:      sidebarOpen ? 220 : 56,
                transition: 'width 0.2s ease',
              }
            : {
                position:   'fixed',
                top:        0,
                bottom:     0,
                left:       0,
                width:      272,
                maxWidth:   '85vw',
                zIndex:     50,
                transform:  mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
                visibility: mobileOpen ? 'visible' : 'hidden',
                transition: mobileOpen
                  ? 'transform 0.25s ease, visibility 0s'
                  : 'transform 0.25s ease, visibility 0s linear 0.25s',
                boxShadow:  mobileOpen ? '4px 0 32px rgba(0,0,0,0.25)' : 'none',
              }
        }
      >
        {/* Toggle button — absolutely positioned in wrapper so it isn't clipped by aside */}
        <button
          onClick={isDesktop ? toggleSidebar : () => setMobileOpen(false)}
          aria-label={isDesktop ? (sidebarOpen ? 'Colapsar menú' : 'Expandir menú') : 'Cerrar menú'}
          style={{
            position:       'absolute',
            top:            isDesktop ? 14 : 8,
            right:          8,
            width:          isDesktop ? 28 : 44,
            height:         isDesktop ? 28 : 44,
            borderRadius:   '50%',
            background:     'rgba(255,255,255,0.1)',
            border:         'none',
            color:          'white',
            cursor:         'pointer',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            zIndex:         20,
            flexShrink:     0,
            transition:     'background 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.2)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
          }}
        >
          {!isDesktop ? <X size={20} /> : sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>

        <aside
          style={{
            width:         '100%',
            height:        '100%',
            background:    '#2D3561',
            display:       'flex',
            flexDirection: 'column',
            overflow:      'hidden',
          }}
        >
          {/* Logo */}
          <div
            style={{
              padding:        sidebarOpen ? '12px 20px' : '12px 0',
              borderBottom:   '1px solid rgba(255,255,255,0.08)',
              display:        'flex',
              alignItems:     'center',
              justifyContent: sidebarOpen ? 'flex-start' : 'center',
              gap:            8,
              minHeight:      50,
              flexShrink:     0,
            }}
          >
            {sidebarOpen && (
              <span
                style={{
                  color:         'white',
                  fontFamily:    'Montserrat, sans-serif',
                  fontWeight:    800,
                  fontSize:      17,
                  letterSpacing: '-0.02em',
                  whiteSpace:    'nowrap',
                }}
              >
                MENY
              </span>
            )}
            <Shield />
          </div>

          {/* Brand + restaurant selector — hidden when collapsed */}
          {sidebarOpen && (
            <div
              className="px-3"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 12, flexShrink: 0 }}
            >
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
            </div>
          )}

          {/* Nav */}
          <nav
            style={{
              flex:      1,
              overflowY: 'auto',
              padding:   sidebarOpen ? '12px' : '12px 4px',
            }}
          >
            {navSections.map((section) => (
              <div key={section.label}>
                {sidebarOpen ? (
                  <p
                    style={{
                      color:         'rgba(255,255,255,0.4)',
                      fontSize:      10,
                      fontFamily:    'Montserrat, sans-serif',
                      fontWeight:    700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      margin:        0,
                      padding:       '16px 12px 8px',
                    }}
                  >
                    {section.label}
                  </p>
                ) : (
                  <div style={{ height: 8 }} />
                )}
                <div className="space-y-0.5">
                  {section.items.map((item) =>
                    item.to ? (
                      <NavItem
                        key={item.to}
                        to={item.to}
                        label={item.label}
                        Icon={item.Icon}
                        collapsed={!sidebarOpen}
                        touch={!isDesktop}
                      />
                    ) : (
                      <DisabledNavItem
                        key={item.label}
                        label={item.label}
                        Icon={item.Icon}
                        collapsed={!sidebarOpen}
                      />
                    ),
                  )}
                </div>
              </div>
            ))}
          </nav>

          {/* Footer */}
          <div
            style={{
              padding:        sidebarOpen ? '16px' : '12px 0',
              borderTop:      '1px solid rgba(255,255,255,0.08)',
              display:        'flex',
              flexDirection:  'column',
              alignItems:     sidebarOpen ? 'flex-start' : 'center',
              flexShrink:     0,
            }}
          >
            {sidebarOpen ? (
              <>
                <p
                  style={{
                    fontSize:     11,
                    color:        'rgba(255,255,255,0.4)',
                    fontFamily:   'Inter, sans-serif',
                    margin:       '0 0 8px',
                    overflow:     'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace:   'nowrap',
                    maxWidth:     '100%',
                  }}
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
                    padding:    isDesktop ? 0 : '10px 0',
                    display:    'flex',
                    alignItems: 'center',
                    gap:        6,
                  }}
                >
                  <LogOut size={13} />
                  Cerrar sesión
                </button>
              </>
            ) : (
              <button
                onClick={logout}
                title="Cerrar sesión"
                style={{
                  background:     'none',
                  border:         'none',
                  cursor:         'pointer',
                  color:          'rgba(255,255,255,0.35)',
                  padding:        4,
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                }}
              >
                <LogOut size={20} />
              </button>
            )}
          </div>
        </aside>
      </div>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Topbar */}
        <header
          className={`bg-white flex items-center justify-between gap-3 ${isDesktop ? 'px-6' : 'px-3'}`}
          style={{ height: 56, flexShrink: 0, borderBottom: '1px solid #e5e7eb' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {!isDesktop && (
              <button
                onClick={() => setMobileOpen(true)}
                aria-label="Abrir menú"
                aria-expanded={mobileOpen}
                style={{
                  width:          44,
                  height:         44,
                  flexShrink:     0,
                  background:     'none',
                  border:         'none',
                  borderRadius:   10,
                  color:          '#2D3561',
                  cursor:         'pointer',
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                }}
              >
                <Menu size={22} />
              </button>
            )}
            <div className="min-w-0">
              <h2
                className="truncate"
                style={{
                  fontFamily: 'Montserrat, sans-serif',
                  fontWeight: 700,
                  fontSize:   18,
                  color:      '#2D3561',
                  margin:     0,
                  lineHeight: 1.2,
                }}
              >
                {sectionTitle}
              </h2>
              {selectedRestaurante && (
                <p
                  className="truncate"
                  style={{
                    fontFamily: 'Inter, sans-serif',
                    fontSize:   13,
                    color:      '#9CA3AF',
                    margin:     0,
                    lineHeight: 1.2,
                  }}
                >
                  {selectedRestaurante.nombre}
                </p>
              )}
            </div>
          </div>

          <div
            style={{
              width:          36,
              height:         36,
              borderRadius:   '50%',
              background:     '#E8563A',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              flexShrink:     0,
            }}
          >
            <span
              style={{
                color:      'white',
                fontFamily: 'Montserrat, sans-serif',
                fontWeight: 700,
                fontSize:   14,
              }}
            >
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
