import { useEffect, useRef, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePublicMenuStore } from '../../store/publicMenuStore'
import { useSessionStore } from '../../store/sessionStore'
import { useCarritoStore } from '../../store/carritoStore'
import { Spinner, MenuItemImage } from '@menyu/ui'
import { api } from '../../services/api'
import type { MenuPublicoItem } from '@menyu/types'

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  orange: '#E8563A',
  orangeHover: '#d34a30',
  orangeSoft: '#FDE5DF',
  navy: '#2D3561',
  navySoft: '#E5E7F0',
  text: '#1A1A2E',
  textSub: '#6B7280',
  textMuted: '#9CA3AF',
  border: '#ECECEE',
  bg: '#F7F7F8',
} as const

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}

function matchesBusqueda(nombre: string, buscar: string): boolean {
  if (!buscar.trim()) return true
  const query = buscar.toLowerCase().trim()
  return nombre.toLowerCase().split(/\s+/).some((palabra) => palabra.startsWith(query))
}

function itemPasaFiltros(item: MenuPublicoItem, buscar: string, activeDiets: Set<string>): boolean {
  if (!matchesBusqueda(item.nombre, buscar)) return false
  if (activeDiets.size > 0) {
    const ids = new Set(item.clasificaciones.map((c) => c.id))
    for (const d of activeDiets) if (!ids.has(d)) return false
  }
  return true
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EmptyState({ buscar, activeDiets, onClear }: { buscar: string; activeDiets: Set<string>; onClear: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200, gap: 10, paddingTop: 40 }}>
      <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 14, color: C.textMuted, textAlign: 'center', margin: 0 }}>
        {buscar
          ? `No hay platos que coincidan con "${buscar}"`
          : activeDiets.size > 0
            ? 'Ningún plato cumple todos los filtros de dieta'
            : 'No hay ítems en esta categoría'}
      </p>
      {(buscar || activeDiets.size > 0) && (
        <button
          onClick={onClear}
          style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 600, fontSize: 13, color: C.orange, background: 'none', border: 'none', cursor: 'pointer' }}
        >
          Limpiar filtros
        </button>
      )}
    </div>
  )
}

function HamburgerBadge() {
  return (
    <span style={{
      position: 'absolute', bottom: -3, right: -3,
      width: 15, height: 15, borderRadius: '50%',
      background: 'white', border: `2px solid ${C.navy}`,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 2,
      padding: '2.5px 3px', boxSizing: 'border-box',
    }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ width: '100%', height: 1.5, background: C.navy, borderRadius: 1, display: 'block' }} />
      ))}
    </span>
  )
}

function DrawerRow({
  icon, label, badge, onClick, primary,
}: {
  icon: string; label: string; badge?: string; onClick: () => void; primary?: boolean
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '11px 14px', borderRadius: 10, cursor: 'pointer',
        color: primary ? C.orange : C.text,
        background: primary ? C.orangeSoft : 'transparent',
        transition: 'background .12s',
        userSelect: 'none',
      }}
      onMouseEnter={(e) => { if (!primary) (e.currentTarget as HTMLDivElement).style.background = C.bg }}
      onMouseLeave={(e) => { if (!primary) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
    >
      <span style={{
        width: 32, height: 32, borderRadius: 8,
        background: primary ? C.orange : '#F4F4F6',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 15, flexShrink: 0,
        ...(primary ? { color: 'white' } : {}),
      }}>{icon}</span>
      <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 14, flex: 1 }}>{label}</span>
      {badge && (
        <span style={{
          fontSize: 10, fontWeight: 600, color: C.textMuted,
          background: C.bg, padding: '2px 8px', borderRadius: 999,
          fontFamily: 'Montserrat,sans-serif',
        }}>
          {badge}
        </span>
      )}
    </div>
  )
}

function ItemCard({ item, onPress }: { item: MenuPublicoItem; onPress: () => void }) {
  return (
    <div
      onClick={onPress}
      className="group"
      style={{
        background: 'white', borderRadius: 12, border: `1px solid ${C.border}`,
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
        cursor: 'pointer', transition: 'border-color .15s, box-shadow .15s',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = 'rgba(232,86,58,0.3)'
        el.style.boxShadow = '0 4px 16px rgba(232,86,58,0.1)'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = C.border
        el.style.boxShadow = 'none'
      }}
    >
      <div style={{ position: 'relative', width: '100%', paddingBottom: '80%', overflow: 'hidden', flexShrink: 0 }}>
        <MenuItemImage
          src={item.imagenUrl}
          alt={item.nombre}
          className="absolute inset-0"
        />
      </div>
      <div style={{ padding: '10px 11px 11px', display: 'flex', flexDirection: 'column', flex: 1, gap: 3 }}>
        <p style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13, color: C.text, lineHeight: 1.25, margin: 0 }}>
          {item.nombre}
        </p>
        {item.descripcion && (
          <p style={{
            fontFamily: 'Inter,sans-serif', fontSize: 11, color: C.textSub,
            lineHeight: 1.35, margin: 0,
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {item.descripcion}
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 6 }}>
          <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 14, color: C.orange }}>
            ${Number(item.precioBase).toFixed(2)}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onPress() }}
            style={{
              width: 28, height: 28, borderRadius: '50%',
              background: C.orange, color: 'white', border: 'none',
              fontSize: 18, lineHeight: 1, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(232,86,58,0.35)',
              cursor: 'pointer', flexShrink: 0,
            }}
          >+</button>
        </div>
      </div>
    </div>
  )
}

// ── Check-in screen ───────────────────────────────────────────────────────────

// ── Main page ─────────────────────────────────────────────────────────────────

export function ClienteMenuPage() {
  const navigate = useNavigate()
  const { restauranteId, sesionId, mesaId, jwt, numeroMesa, codigoSesion, modoSesion } = useSessionStore()
  const carritoCount = useCarritoStore((s) => s.items.length)
  const { menu, loading, error, fetchMenu } = usePublicMenuStore()

  // UI state
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [buscar, setBuscar] = useState('')
  const [categoriaActiva, setCategoriaActiva] = useState<string>('')
  const [dietOpen, setDietOpen] = useState(false)
  const [pendingDiets, setPendingDiets] = useState<Set<string>>(new Set())
  const [activeDiets, setActiveDiets] = useState<Set<string>>(new Set())
  const [mozoStatus, setMozoStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const mozoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dietRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const user = (() => {
    try {
      const token = localStorage.getItem('menyu_access_token')
      if (!token) return null
      const payload = JSON.parse(atob(token.split('.')[1])) as {
        tipo: string
        nombre?: string
        email?: string
      }
      if (payload.tipo !== 'cliente') return null
      return { nombre: payload.nombre ?? payload.email ?? 'Cliente', email: payload.email ?? '' }
    } catch {
      return null
    }
  })()

  useEffect(() => {
    if (restauranteId && !menu) void fetchMenu(restauranteId)
  }, [restauranteId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (menu?.recomendados && menu.recomendados.length > 0) {
      setCategoriaActiva('recomendados')
    } else if (menu?.categorias[0]?.id) {
      setCategoriaActiva(menu.categorias[0].id)
    }
  }, [menu])

  // Click outside diet dropdown
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (dietRef.current && !dietRef.current.contains(e.target as Node)) {
        setDietOpen(false)
      }
    }
    if (dietOpen) document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [dietOpen])

  // Mozo timer cleanup
  useEffect(() => () => { if (mozoTimer.current) clearTimeout(mozoTimer.current) }, [])

  // Unique classifications with item counts
  const allClasifs = useMemo(() => {
    if (!menu) return [] as { id: string; nombre: string; count: number }[]
    const map = new Map<string, { id: string; nombre: string; count: number }>()
    for (const cat of menu.categorias) {
      for (const item of cat.itemsDirectos) {
        for (const c of item.clasificaciones) {
          const ex = map.get(c.id)
          if (ex) ex.count++
          else map.set(c.id, { id: c.id, nombre: c.nombre, count: 1 })
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count)
  }, [menu])

  // Grouped categories with filtering applied (for scroll-spy mode)
  const categoriasFiltradas = useMemo(() => {
    if (!menu) return []
    return menu.categorias.map((cat) => ({
      ...cat,
      itemsDirectos: cat.itemsDirectos.filter((item) => itemPasaFiltros(item, buscar, activeDiets)),
    })).filter((cat) => cat.itemsDirectos.length > 0)
  }, [menu, buscar, activeDiets])

  // Chef's recommendations with the same filters applied
  const recomendadosFiltrados = useMemo(() => {
    return (menu?.recomendados ?? []).filter((item) => itemPasaFiltros(item, buscar, activeDiets))
  }, [menu, buscar, activeDiets])

  // Recomendados + categorías combinados, para chips y scroll-spy
  const seccionesConId = useMemo(() => {
    const secciones: { id: string; nombre: string }[] = []
    if (recomendadosFiltrados.length > 0) {
      secciones.push({
        id: 'recomendados',
        nombre: menu?.restaurante.nombreSeccionRecomendados ?? 'RECOMENDACIONES',
      })
    }
    secciones.push(...categoriasFiltradas.map((c) => ({ id: c.id, nombre: c.nombre })))
    return secciones
  }, [recomendadosFiltrados, categoriasFiltradas, menu])

  // Scroll-spy: update active chip based on which section is visible
  useEffect(() => {
    // Purge refs for categories no longer in the DOM
    const activeIds = new Set(seccionesConId.map((s) => s.id))
    Object.keys(sectionRefs.current).forEach((id) => {
      if (!activeIds.has(id)) delete sectionRefs.current[id]
    })

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute('data-categoria-id')
            if (id) setCategoriaActiva(id)
          }
        })
      },
      { threshold: 0.3 },
    )

    Object.values(sectionRefs.current).forEach((ref) => {
      if (ref) observer.observe(ref)
    })

    return () => observer.disconnect()
  }, [seccionesConId])

  // Scroll listener: highlight "Todo" chip when scrolled to top
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const handleScroll = () => {
      if (container.scrollTop === 0) {
        const firstId = seccionesConId[0]?.id
        if (firstId) setCategoriaActiva(firstId)
      }
    }
    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [seccionesConId])

  // Handlers
  const handleCategoriaClick = (catId: string) => {
    sectionRefs.current[catId]?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleCallMozo = async () => {
    if (mozoStatus !== 'idle' || !sesionId || !jwt) return
    setMozoStatus('loading')
    try {
      await api.waiterCalls.llamar(sesionId, jwt)
      setMozoStatus('ok')
    } catch {
      setMozoStatus('error')
    }
    mozoTimer.current = setTimeout(() => setMozoStatus('idle'), 3000)
  }

  const openDietDropdown = () => {
    setPendingDiets(new Set(activeDiets))
    setDietOpen(true)
  }

  const togglePending = (id: string) => {
    setPendingDiets((prev) => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  const applyDiets = () => {
    setActiveDiets(new Set(pendingDiets))
    setDietOpen(false)
  }

  const clearDiets = () => {
    setPendingDiets(new Set())
    setActiveDiets(new Set())
    setDietOpen(false)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100svh', background: C.bg }}>
      <Spinner size="lg" />
    </div>
  )

  if (error) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100svh', gap: 12, padding: 24, background: C.bg }}>
      <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 14, color: C.orange, textAlign: 'center', margin: 0 }}>No se pudo cargar el menú</p>
      <button
        onClick={() => restauranteId && void fetchMenu(restauranteId)}
        style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 600, fontSize: 13, color: C.orange, background: 'none', border: 'none', cursor: 'pointer' }}
      >
        Reintentar
      </button>
    </div>
  )

  if (!menu) return null

  const restoName = menu.restaurante.nombre
  const restoInitials = initials(restoName)

  const mozoLabel =
    mozoStatus === 'loading' ? 'Llamando…' :
    mozoStatus === 'ok'      ? '¡En camino!' :
    mozoStatus === 'error'   ? 'Error' :
                               'Mozo'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', background: C.bg }}>

      {/* ── Drawer scrim */}
      <div
        onClick={() => setDrawerOpen(false)}
        style={{
          position: 'fixed', inset: 0, zIndex: 40,
          background: 'rgba(45,53,97,0.45)',
          opacity: drawerOpen ? 1 : 0,
          pointerEvents: drawerOpen ? 'auto' : 'none',
          transition: 'opacity 0.25s',
        }}
      />

      {/* ── Drawer panel */}
      <div style={{
        position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50,
        width: '82%', maxWidth: 320,
        background: 'white',
        boxShadow: '4px 0 32px rgba(0,0,0,0.2)',
        display: 'flex', flexDirection: 'column',
        transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.26s cubic-bezier(0.32,0.72,0,1)',
      }}>
        {/* Drawer head */}
        <div style={{ background: `linear-gradient(135deg, ${C.navy} 0%, #3d4880 100%)`, padding: '22px 18px 18px' }}>
          {user ? (
            <>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontFamily: 'Montserrat,sans-serif', fontWeight: 700, color: 'white', marginBottom: 10 }}>
                {user.nombre.slice(0, 1).toUpperCase()}
              </div>
              <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 17, color: 'white', lineHeight: 1.2 }}>
                ¡Hola, {user.nombre.split(' ')[0]}!
              </div>
              <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2, marginBottom: 14 }}>
                {user.email}
              </div>
              <button
                style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1.5px solid rgba(255,255,255,0.22)', borderRadius: 8, padding: '10px 16px', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13, cursor: 'pointer', width: '100%' }}
                onClick={() => {
                  localStorage.removeItem('menyu_access_token')
                  localStorage.removeItem('menyu_refresh_token')
                  setDrawerOpen(false)
                }}
              >
                Cerrar sesión
              </button>
            </>
          ) : (
            <>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 10 }}>
                👤
              </div>
              <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 17, color: 'white', lineHeight: 1.2 }}>
                ¡Hola!
              </div>
              <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2, marginBottom: 14 }}>
                Estás navegando como invitado
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  style={{ background: C.orange, color: 'white', border: 'none', borderRadius: 8, padding: '10px 16px', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                  onClick={() => { setDrawerOpen(false); navigate('/auth') }}
                >
                  Iniciar sesión
                </button>
                <button
                  style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1.5px solid rgba(255,255,255,0.22)', borderRadius: 8, padding: '10px 16px', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                  onClick={() => { setDrawerOpen(false); navigate('/auth?tab=register') }}
                >
                  Crear cuenta gratis
                </button>
              </div>
            </>
          )}
        </div>

        {/* Drawer body */}
        <div style={{ flex: 1, padding: '10px 8px', overflowY: 'auto' }}>
          <DrawerRow icon="📋" label="Mis pedidos" primary onClick={() => { setDrawerOpen(false); navigate('/pedidos') }} />
          {user && <DrawerRow icon="⭐" label="Mis puntos" badge="Próximamente" onClick={() => {}} />}
          <DrawerRow icon="💳" label="Pagar la cuenta" onClick={() => { setDrawerOpen(false); navigate('/pagar') }} />
        </div>

        {/* Drawer footer */}
        <div style={{ padding: '12px 18px 20px', borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 10, color: C.textMuted }}>v1.0</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 10, color: C.textMuted }}>powered by</span>
            <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 12, color: C.navy, marginLeft: 2 }}>MENY</span>
            <div style={{ width: 10, height: 13, background: C.orange, borderRadius: '2px 2px 50% 50% / 2px 2px 28% 28%', position: 'relative', top: 1 }} />
          </div>
        </div>
      </div>

      {/* ── Header */}
      <header style={{
        background: C.navy, padding: '12px 14px',
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
      }}>
        {/* Burger / initials */}
        <button
          onClick={() => setDrawerOpen(true)}
          style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            background: `linear-gradient(135deg, ${C.orange} 0%, #ff7a5e 100%)`,
            border: 'none', cursor: 'pointer', position: 'relative',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 14, color: 'white',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}
        >
          {restoInitials}
          <HamburgerBadge />
        </button>

        {/* Restaurant name */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 14, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {restoName}
          </div>
        </div>

        {/* Call waiter */}
        {sesionId && jwt && (
          <button
            onClick={() => void handleCallMozo()}
            disabled={mozoStatus !== 'idle'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '7px 10px', borderRadius: 999, flexShrink: 0,
              background: mozoStatus === 'ok' ? '#22c55e' : 'transparent',
              color: 'white',
              border: `1.5px solid ${mozoStatus === 'ok' ? '#22c55e' : 'rgba(255,255,255,0.32)'}`,
              fontFamily: 'Montserrat,sans-serif', fontWeight: 600, fontSize: 11,
              cursor: mozoStatus === 'idle' ? 'pointer' : 'default',
              transition: 'all 0.2s',
            }}
          >
            <span style={{ fontSize: 12 }}>🔔</span> {mozoLabel}
          </button>
        )}

        {/* Mesa pill */}
        {mesaId && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            <span style={{
              background: C.orange, color: 'white',
              padding: '6px 11px', borderRadius: 999,
              fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 12,
            }}>
              Mesa {numeroMesa ?? ''}
            </span>
            {modoSesion === 'seguro' && codigoSesion && (
              <span style={{
                color: 'white',
                padding: '6px 11px', borderRadius: 999,
                fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 12,
                border: '1.5px solid rgba(255,255,255,0.5)',
              }}>
                PIN {codigoSesion}
              </span>
            )}
          </div>
        )}
      </header>

      {/* ── Search row */}
      <div style={{ background: 'white', padding: '10px 14px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Search input */}
          <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span style={{ position: 'absolute', left: 12, fontSize: 14, color: C.textMuted, pointerEvents: 'none' }}>🔍</span>
            <input
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder="Buscar platos..."
              style={{
                width: '100%', height: 40, boxSizing: 'border-box',
                paddingLeft: 34, paddingRight: buscar ? 32 : 14, borderRadius: 999,
                border: `1px solid ${C.border}`, background: C.bg,
                fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.text,
                outline: 'none', transition: 'border-color .15s, background .15s',
              }}
              onFocus={(e) => { e.target.style.borderColor = C.orange; e.target.style.background = 'white' }}
              onBlur={(e) => { e.target.style.borderColor = C.border; e.target.style.background = C.bg }}
            />
            {buscar && (
              <button
                onClick={() => setBuscar('')}
                style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#9CA3AF', fontSize: 16, lineHeight: 1, padding: 0,
                }}
              >
                ×
              </button>
            )}
          </div>

          {/* Diet filter button + dropdown */}
          <div style={{ position: 'relative', flexShrink: 0 }} ref={dietRef}>
            <button
              onClick={openDietDropdown}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                height: 40, padding: '0 12px', borderRadius: 999,
                border: `1px solid ${activeDiets.size > 0 ? C.orange : C.border}`,
                background: activeDiets.size > 0 ? C.orange : 'white',
                color: activeDiets.size > 0 ? 'white' : C.navy,
                fontFamily: 'Montserrat,sans-serif', fontWeight: 600, fontSize: 12,
                cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all .15s',
              }}
            >
              <span style={{ fontSize: 14 }}>🥗</span>
              Dietas
              {activeDiets.size > 0 ? (
                <span style={{ background: 'white', color: C.orange, fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 999 }}>
                  {activeDiets.size}
                </span>
              ) : (
                <span style={{ fontSize: 9, opacity: 0.55 }}>▾</span>
              )}
            </button>

            {/* Dropdown */}
            {dietOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                width: 264, background: 'white', borderRadius: 12,
                boxShadow: '0 12px 32px rgba(45,53,97,0.18)',
                border: `1px solid ${C.border}`, padding: 14, zIndex: 25,
              }}>
                <p style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 11, color: C.navy, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  Filtros de dieta
                </p>
                <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 11, color: C.textMuted, margin: '0 0 10px' }}>
                  Mostramos solo platos compatibles
                </p>

                {allClasifs.length === 0 ? (
                  <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: C.textMuted, textAlign: 'center', padding: '8px 0' }}>
                    Sin clasificaciones disponibles
                  </p>
                ) : (
                  allClasifs.map((c) => {
                    const checked = pendingDiets.has(c.id)
                    return (
                      <div
                        key={c.id}
                        onClick={() => togglePending(c.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', borderRadius: 8, cursor: 'pointer', transition: 'background .1s' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = C.bg }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                      >
                        <div style={{
                          width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                          border: `1.5px solid ${checked ? C.orange : '#D1D5DB'}`,
                          background: checked ? C.orange : 'white',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: 'white', fontSize: 11, fontWeight: 700, transition: 'all .12s',
                        }}>
                          {checked ? '✓' : ''}
                        </div>
                        <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.text, flex: 1 }}>{c.nombre}</span>
                        <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 11, color: C.textMuted, fontWeight: 600 }}>{c.count}</span>
                      </div>
                    )
                  })
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                  <button
                    onClick={clearDiets}
                    style={{ flex: 1, padding: '8px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 12, color: C.textSub, cursor: 'pointer' }}
                  >
                    Limpiar
                  </button>
                  <button
                    onClick={applyDiets}
                    style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', background: C.orange, color: 'white', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
                  >
                    Aplicar{pendingDiets.size > 0 ? ` (${pendingDiets.size})` : ''}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Category chips */}
      <div style={{ background: 'white', borderBottom: `1px solid ${C.border}`, flexShrink: 0, overflowX: 'auto', scrollbarWidth: 'none' }}>
        <div style={{ display: 'flex', padding: '8px 14px', gap: 6, width: 'max-content' }}>
          {seccionesConId.map((sec) => {
            const active = categoriaActiva === sec.id
            return (
              <button
                key={sec.id}
                onClick={() => handleCategoriaClick(sec.id)}
                style={{
                  padding: '6px 14px', borderRadius: 999,
                  background: active ? C.navy : 'white',
                  color: active ? 'white' : C.navy,
                  border: `1px solid ${active ? C.navy : C.border}`,
                  fontFamily: 'Inter,sans-serif', fontWeight: 500, fontSize: 13,
                  cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all .15s',
                }}
              >
                {sec.nombre}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Items grid */}
      <div ref={scrollContainerRef} style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
        {recomendadosFiltrados.length > 0 && (
          <div
            ref={(el) => { sectionRefs.current['recomendados'] = el }}
            data-categoria-id="recomendados"
            style={{ marginBottom: 28 }}
          >
            <h2 style={{
              fontFamily: 'Montserrat,sans-serif',
              fontWeight: 800,
              fontSize: 13,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: C.navy,
              margin: '0 0 12px',
              paddingBottom: 8,
              borderBottom: `2px solid ${C.orange}`,
              display: 'inline-block',
            }}>
              {menu?.restaurante.nombreSeccionRecomendados}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              {recomendadosFiltrados.map((item) => (
                <ItemCard key={item.id} item={item} onPress={() => navigate(`/menu/${item.id}`)} />
              ))}
            </div>
          </div>
        )}
        {categoriasFiltradas.length > 0 ? (
          categoriasFiltradas.map((cat) => (
            <div
              key={cat.id}
              ref={(el) => { sectionRefs.current[cat.id] = el }}
              data-categoria-id={cat.id}
              style={{ marginBottom: 28 }}
            >
              <h2 style={{
                fontFamily: 'Montserrat,sans-serif',
                fontWeight: 800,
                fontSize: 13,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: C.navy,
                margin: '0 0 12px',
                paddingBottom: 8,
                borderBottom: `2px solid ${C.orange}`,
                display: 'inline-block',
              }}>
                {cat.nombre}
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                {cat.itemsDirectos.map((item) => (
                  <ItemCard key={item.id} item={item} onPress={() => navigate(`/menu/${item.id}`)} />
                ))}
              </div>
            </div>
          ))
        ) : recomendadosFiltrados.length === 0 ? (
          <EmptyState buscar={buscar} activeDiets={activeDiets} onClear={() => { setBuscar(''); setActiveDiets(new Set()) }} />
        ) : null}
      </div>

      {/* ── Cart FAB */}
      {carritoCount > 0 && (
        <button
          onClick={() => navigate('/carrito')}
          style={{
            position: 'fixed', bottom: 20, right: 20, zIndex: 30,
            width: 54, height: 54, borderRadius: '50%',
            background: C.orange, color: 'white', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(232,86,58,0.42)',
          }}
        >
          🛒
          <span style={{
            position: 'absolute', top: -3, right: -3,
            background: C.navy, color: 'white',
            width: 22, height: 22, borderRadius: '50%',
            fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 11,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid white',
          }}>
            {carritoCount}
          </span>
        </button>
      )}
    </div>
  )
}
