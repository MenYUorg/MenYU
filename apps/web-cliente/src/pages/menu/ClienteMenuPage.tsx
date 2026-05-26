import { useEffect, useRef, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePublicMenuStore } from '../../store/publicMenuStore'
import { useSessionStore } from '../../store/sessionStore'
import { useCarritoStore } from '../../store/carritoStore'
import { Spinner } from '@menyu/ui'
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

// ── Sub-components ────────────────────────────────────────────────────────────

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

function Placeholder() {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #F2EEEA 0%, #EDE9E5 100%)',
    }}>
      <span style={{
        fontFamily: 'Montserrat,sans-serif', fontWeight: 800,
        fontSize: 11, color: C.orange, letterSpacing: '0.12em',
        opacity: 0.7,
      }}>MENYU</span>
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
        {item.imagenUrl ? (
          <img
            src={item.imagenUrl}
            alt={item.nombre}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <Placeholder />
        )}
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

interface CheckInProps {
  pin: string; setPin: (v: string) => void
  rid: string; setRid: (v: string) => void
  loading: boolean; error: string | null
  onSubmit: (e: React.FormEvent) => void
  step: 'inicial' | 'codigo-sesion' | 'anfitrion'
  codigo: string; setCodigo: (v: string) => void
  onSubmitCodigo: (e: React.FormEvent) => void
  onVolver: () => void
  codigoAnfitrion: string | null
  onContinuar: () => void
}

function CheckInScreen({
  pin, setPin, rid, setRid, loading, error, onSubmit,
  step, codigo, setCodigo, onSubmitCodigo, onVolver,
  codigoAnfitrion, onContinuar,
}: CheckInProps) {
  return (
    <div style={{
      minHeight: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, background: `linear-gradient(135deg, ${C.navy} 0%, #1e254a 100%)`,
    }}>
      <div style={{ width: '100%', maxWidth: 360, borderRadius: 20, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.35)' }}>
        {/* Brand header */}
        <div style={{ background: C.navy, padding: '28px 32px 20px', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, marginBottom: 8 }}>
            <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 26, color: 'white', letterSpacing: '-0.01em' }}>
              MENY
            </span>
            <div style={{
              width: 14, height: 17, background: C.orange, marginBottom: 3,
              borderRadius: '3px 3px 50% 50% / 3px 3px 30% 30%',
            }} />
          </div>
          <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.55)', margin: 0 }}>
            Ingresá para ver el menú
          </p>
        </div>

        {/* Paso 1: inicial */}
        {step === 'inicial' && (
          <form onSubmit={onSubmit} style={{ background: 'white', padding: '24px 28px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontFamily: 'Inter,sans-serif', fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>
                ID del restaurante
              </label>
              <input
                type="text" value={rid} onChange={(e) => setRid(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                style={{
                  width: '100%', boxSizing: 'border-box', height: 42,
                  border: `1.5px solid ${C.border}`, borderRadius: 10,
                  padding: '0 14px', fontFamily: 'Inter,sans-serif',
                  fontSize: 13, color: C.text, outline: 'none',
                  transition: 'border-color .15s',
                }}
                onFocus={(e) => { e.target.style.borderColor = C.orange }}
                onBlur={(e) => { e.target.style.borderColor = C.border }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, height: 1, background: C.border }} />
              <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 11, color: C.textMuted }}>o</span>
              <div style={{ flex: 1, height: 1, background: C.border }} />
            </div>

            <div>
              <label style={{ fontFamily: 'Inter,sans-serif', fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>
                PIN de la mesa
              </label>
              <input
                type="text" value={pin} onChange={(e) => setPin(e.target.value)}
                placeholder="1234"
                style={{
                  width: '100%', boxSizing: 'border-box', height: 42,
                  border: `1.5px solid ${C.border}`, borderRadius: 10,
                  padding: '0 14px', fontFamily: 'Inter,sans-serif',
                  fontSize: 13, color: C.text, outline: 'none',
                  transition: 'border-color .15s',
                }}
                onFocus={(e) => { e.target.style.borderColor = C.orange }}
                onBlur={(e) => { e.target.style.borderColor = C.border }}
              />
            </div>

            {error && (
              <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: C.orange, background: C.orangeSoft, borderRadius: 8, padding: '9px 12px', margin: 0 }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || (!rid.trim() && !pin.trim())}
              style={{
                background: C.orange, color: 'white', border: 'none',
                borderRadius: 10, padding: '13px 20px',
                fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 14,
                cursor: loading ? 'wait' : 'pointer',
                opacity: loading || (!rid.trim() && !pin.trim()) ? 0.5 : 1,
                transition: 'opacity .15s',
              }}
            >
              {loading ? 'Conectando…' : 'Ver menú'}
            </button>
          </form>
        )}

        {/* Paso 2: codigo-sesion */}
        {step === 'codigo-sesion' && (
          <form
            onSubmit={onSubmitCodigo}
            style={{ background: 'white', padding: '24px 28px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}
          >
            <span style={{ fontSize: 48 }}>🔒</span>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 20, color: C.navy, margin: '0 0 8px' }}>
                Mesa en modo seguro
              </p>
              <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.textSub, margin: 0 }}>
                El anfitrión de la mesa tiene un código de 3 dígitos. Pedíselo para unirte.
              </p>
            </div>
            <input
              type="text"
              inputMode="numeric"
              maxLength={3}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 3))}
              placeholder="000"
              style={{
                width: 120, height: 64, textAlign: 'center',
                fontFamily: 'Montserrat,sans-serif', fontWeight: 800,
                fontSize: 32, letterSpacing: '0.3em',
                border: `2px solid ${C.border}`, borderRadius: 12,
                outline: 'none', color: C.navy, boxSizing: 'border-box',
              }}
              onFocus={(e) => { e.target.style.borderColor = C.orange }}
              onBlur={(e) => { e.target.style.borderColor = C.border }}
            />
            {error && (
              <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: C.orange, background: C.orangeSoft, borderRadius: 8, padding: '9px 12px', margin: 0, width: '100%', boxSizing: 'border-box' }}>
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading || codigo.length !== 3}
              style={{
                width: '100%', background: C.orange, color: 'white', border: 'none',
                borderRadius: 10, padding: '13px 20px',
                fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 14,
                cursor: loading ? 'wait' : 'pointer',
                opacity: loading || codigo.length !== 3 ? 0.5 : 1,
                transition: 'opacity .15s',
              }}
            >
              {loading ? 'Uniéndome…' : 'Unirme a la mesa'}
            </button>
            <button
              type="button"
              onClick={onVolver}
              style={{ background: 'none', border: 'none', fontFamily: 'Inter,sans-serif', fontSize: 12, color: C.textMuted, cursor: 'pointer', padding: '4px 0' }}
            >
              ← Volver
            </button>
          </form>
        )}

        {/* Paso 3: anfitrion */}
        {step === 'anfitrion' && (
          <div style={{ background: 'white', padding: '24px 28px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: C.orange, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 24, color: 'white', fontWeight: 'bold' }}>✓</span>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 18, color: C.navy, margin: '0 0 8px' }}>
                ¡Sos el anfitrión de la mesa!
              </p>
              <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.textSub, margin: 0 }}>
                Compartí este código con tus acompañantes para que puedan unirse:
              </p>
            </div>
            <div style={{
              width: '100%', boxSizing: 'border-box',
              border: `2px solid ${C.navy}`, borderRadius: 16,
              background: '#E5E7F0', padding: '20px 16px', textAlign: 'center',
            }}>
              <p style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 48, color: C.navy, margin: '0 0 4px', letterSpacing: '0.1em' }}>
                {codigoAnfitrion ?? '—'}
              </p>
              <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: C.textSub, margin: 0 }}>
                Código de mesa
              </p>
            </div>
            <button
              type="button"
              onClick={onContinuar}
              style={{
                width: '100%', background: C.orange, color: 'white', border: 'none',
                borderRadius: 10, padding: '13px 20px',
                fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Ver el menú
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ClienteMenuPage() {
  const navigate = useNavigate()
  const { restauranteId, sesionId, mesaId, jwt, openSession, loading: sessionLoading, error: sessionError, numeroMesa, codigoSesion, modoSesion } = useSessionStore()
  const carritoCount = useCarritoStore((s) => s.items.length)
  const { menu, loading, error, fetchMenu } = usePublicMenuStore()

  // UI state
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [buscar, setBuscar] = useState('')
  const [categoriaActiva, setCategoriaActiva] = useState<string>('__all__')
  const [dietOpen, setDietOpen] = useState(false)
  const [pendingDiets, setPendingDiets] = useState<Set<string>>(new Set())
  const [activeDiets, setActiveDiets] = useState<Set<string>>(new Set())
  const [mozoStatus, setMozoStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const mozoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dietRef = useRef<HTMLDivElement>(null)

  // Check-in state
  const [checkInPin,    setCheckInPin]    = useState('')
  const [checkInRid,    setCheckInRid]    = useState('')
  const [checkInStep,   setCheckInStep]   = useState<'inicial' | 'codigo-sesion' | 'anfitrion'>('inicial')
  const [checkInCodigo, setCheckInCodigo] = useState('')
  const [checkInRidTemp, setCheckInRidTemp] = useState('')
  const [checkInPinTemp, setCheckInPinTemp] = useState('')

  // Placeholder for future user auth (never truthy today)
  const user = null as null | { nombre: string; email: string }

  useEffect(() => {
    if (restauranteId && !menu) void fetchMenu(restauranteId)
  }, [restauranteId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (menu) setCategoriaActiva('__all__')
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

  // Combined filtered items
  const itemsVisibles = useMemo(() => {
    if (!menu) return [] as MenuPublicoItem[]
    const searchLow = buscar.toLowerCase().trim()

    const source: MenuPublicoItem[] =
      categoriaActiva === '__all__'
        ? menu.categorias.flatMap((c) => c.itemsDirectos)
        : (menu.categorias.find((c) => c.id === categoriaActiva)?.itemsDirectos ?? [])

    return source.filter((item) => {
      if (searchLow && !item.nombre.toLowerCase().includes(searchLow)) return false
      if (activeDiets.size > 0) {
        const ids = new Set(item.clasificaciones.map((c) => c.id))
        for (const d of activeDiets) if (!ids.has(d)) return false
      }
      return true
    })
  }, [menu, categoriaActiva, buscar, activeDiets])

  // Handlers
  const handleCheckIn = async (e: React.FormEvent) => {
    e.preventDefault()
    const rid = checkInRid.trim() || undefined
    const pin = checkInPin.trim() || undefined
    if (!rid && !pin) return

    const result = await openSession({ restauranteId: rid, pin })

    if (result?.error === 'REQUIERE_CODIGO_SESION') {
      setCheckInRidTemp(rid ?? '')
      setCheckInPinTemp(pin ?? '')
      setCheckInStep('codigo-sesion')
      return
    }

    if (result?.codigoSesion && result?.modoSesion === 'seguro') {
      setCheckInStep('anfitrion')
      return
    }

    if (rid) void fetchMenu(rid)
  }

  const handleCheckInCodigo = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = await openSession({
      restauranteId: checkInRidTemp || undefined,
      pin: checkInPinTemp || undefined,
      codigoSesion: checkInCodigo.trim(),
    })
    if (result && !result.error) {
      if (checkInRidTemp) void fetchMenu(checkInRidTemp)
    }
  }

  const handleAnfitrionContinuar = () => {
    setCheckInStep('inicial')
    if (checkInRid.trim()) void fetchMenu(checkInRid.trim())
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

  // ── Render guards
  if (!restauranteId || checkInStep === 'anfitrion') {
    return (
      <CheckInScreen
        pin={checkInPin} setPin={setCheckInPin}
        rid={checkInRid} setRid={setCheckInRid}
        loading={sessionLoading} error={sessionError}
        onSubmit={handleCheckIn}
        step={checkInStep}
        codigo={checkInCodigo} setCodigo={setCheckInCodigo}
        onSubmitCodigo={handleCheckInCodigo}
        onVolver={() => setCheckInStep('inicial')}
        codigoAnfitrion={codigoSesion}
        onContinuar={handleAnfitrionContinuar}
      />
    )
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100svh', overflow: 'hidden', background: C.bg }}>

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
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: `linear-gradient(135deg, ${C.orange}, #ff7a5e)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 18, color: 'white', marginBottom: 10 }}>
                {user.nombre[0]?.toUpperCase()}
              </div>
              <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 17, color: 'white' }}>
                Hola, {user.nombre.split(' ')[0]} 👋
              </div>
              <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
                {user.email}
              </div>
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
                <button style={{ background: C.orange, color: 'white', border: 'none', borderRadius: 8, padding: '10px 16px', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                  Iniciar sesión
                </button>
                <button style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1.5px solid rgba(255,255,255,0.22)', borderRadius: 8, padding: '10px 16px', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
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
                paddingLeft: 34, paddingRight: 14, borderRadius: 999,
                border: `1px solid ${C.border}`, background: C.bg,
                fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.text,
                outline: 'none', transition: 'border-color .15s, background .15s',
              }}
              onFocus={(e) => { e.target.style.borderColor = C.orange; e.target.style.background = 'white' }}
              onBlur={(e) => { e.target.style.borderColor = C.border; e.target.style.background = C.bg }}
            />
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
          {(['__all__', ...menu.categorias.map((c) => c.id)] as string[]).map((catId) => {
            const label = catId === '__all__' ? 'Todo' : (menu.categorias.find((c) => c.id === catId)?.nombre ?? catId)
            const active = categoriaActiva === catId
            return (
              <button
                key={catId}
                onClick={() => setCategoriaActiva(catId)}
                style={{
                  padding: '6px 14px', borderRadius: 999,
                  background: active ? C.navy : 'white',
                  color: active ? 'white' : C.navy,
                  border: `1px solid ${active ? C.navy : C.border}`,
                  fontFamily: 'Inter,sans-serif', fontWeight: 500, fontSize: 13,
                  cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all .15s',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Items grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
        {itemsVisibles.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
            {itemsVisibles.map((item) => (
              <ItemCard key={item.id} item={item} onPress={() => navigate(`/menu/${item.id}`)} />
            ))}
          </div>
        ) : (
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
                onClick={() => { setBuscar(''); setActiveDiets(new Set()) }}
                style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 600, fontSize: 13, color: C.orange, background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Limpiar filtros
              </button>
            )}
          </div>
        )}
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
