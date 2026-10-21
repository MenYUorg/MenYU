import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { LogoMenYuOscuro } from '@menyu/ui'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { ChevronLeft, ChevronRight, LogOut, Menu, X, type LucideIcon } from 'lucide-react'

/* ── estructura del menú ───────────────────────────────────────────────────── */
export interface NavSectionItem {
  to: string
  label: string
  Icon: LucideIcon
}
export interface NavSection {
  label: string
  items: NavSectionItem[]
}

const SIDEBAR_KEY = 'menyu-sidebar-open'

/* ── ítems del menú ────────────────────────────────────────────────────────── */
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

/* ── shell ─────────────────────────────────────────────────────────────────── */
interface ShellProps {
  secciones: NavSection[]
  /** Título de la barra superior. */
  titulo: string
  /** Segunda línea de la barra superior (por ejemplo, el restaurante elegido). */
  subtitulo?: string
  /** Lo que va debajo del logo en el menú lateral (marca y restaurante, o "Administración"). Se oculta con el menú colapsado. */
  contexto: ReactNode
  email?: string
  onCerrarSesion: () => void
}

/**
 * Menú lateral (fijo y colapsable en escritorio, drawer en celular), barra superior y el lugar donde se dibuja la pantalla.
 * Lo comparten el panel de OWNER y GERENTE (`AdminLayout`) y la consola de ROOT (`RootLayout`): cada uno decide qué menú,
 * qué título y qué bloque de contexto muestra; acá no hay nada que dependa del rol.
 */
export function Shell({ secciones, titulo, subtitulo, contexto, email, onCerrarSesion }: ShellProps) {
  const location = useLocation()

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

  const emailInitials = email ? email.slice(0, 2).toUpperCase() : '?'

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
            <LogoMenYuOscuro alto={sidebarOpen ? 20 : 26} soloU={!sidebarOpen} />
          </div>

          {/* Contexto (marca y restaurante, o "Administración") — oculto cuando el menú está colapsado */}
          {sidebarOpen && (
            <div
              className="px-3"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 12, flexShrink: 0 }}
            >
              {contexto}
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
            {secciones.map((section) => (
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
                  {email}
                </p>
                <button
                  onClick={onCerrarSesion}
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
                onClick={onCerrarSesion}
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
                {titulo}
              </h2>
              {subtitulo && (
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
                  {subtitulo}
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
