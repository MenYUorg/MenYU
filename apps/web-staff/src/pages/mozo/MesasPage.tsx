import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { io, type Socket } from 'socket.io-client'
import type { Mesa } from '@menyu/types'
import { Bell, ChevronLeft, Clock, DollarSign, DoorOpen, ShoppingBag, Users } from 'lucide-react'
import { useMozoStore } from '../../store/mozoStore'
import { api, getToken } from '../../services/api'
import type { SesionActivaRico, WaiterCallRico } from '../../services/api'

// ── Bell animation ────────────────────────────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('mp-bell-css')) {
  const s = document.createElement('style')
  s.id = 'mp-bell-css'
  s.textContent = `
    @keyframes mpBell {
      0%,100%{transform:rotate(0)}
      10%,30%,50%,70%{transform:rotate(-18deg)}
      20%,40%,60%,80%{transform:rotate(18deg)}
      90%{transform:rotate(-10deg)}
    }
    .mp-bell{animation:mpBell 1s ease-in-out infinite;transform-origin:50% 0;display:inline-flex}
  `
  document.head.appendChild(s)
}

// ── Palette & WS ──────────────────────────────────────────────────────────────
const C = {
  orange:       '#E8563A',
  navy:         '#2D3561',
  green:        '#16a34a',
  greenBg:      '#f0fdf4',
  greenBadge:   '#dcfce7',
  orangeBg:     '#fff8f6',
  orangeBadge:  '#FDE5DF',
  amber:        '#d97706',
  amberBg:      '#fef3c7',
  border:       '#e5e7eb',
  textSub:      '#6b7280',
  textMuted:    '#9ca3af',
  red:          '#dc2626',
} as const

const WS_URL: string =
  (import.meta.env.VITE_WS_URL as string | undefined) ??
  (import.meta.env.VITE_API_URL as string | undefined)?.replace('/api', '') ??
  ''

// ── Helpers ───────────────────────────────────────────────────────────────────
function tiempoTranscurrido(creadaEn: string): string {
  const diff = Date.now() - new Date(creadaEn).getTime()
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m` : `${m} min`
}

function estadoBadge(estado: string): { bg: string; color: string; label: string } {
  const MAP: Record<string, { bg: string; color: string; label: string }> = {
    pendiente:      { bg: '#fef9c3', color: '#854d0e', label: '● Pendiente' },
    en_preparacion: { bg: C.orangeBadge, color: C.orange, label: '● En preparación' },
    listo:          { bg: C.greenBadge, color: C.green, label: '● Listo' },
    entregado:      { bg: '#f3f4f6', color: C.textSub, label: '● Entregado' },
  }
  return MAP[estado] ?? MAP['pendiente']
}

// ── MesaTile ──────────────────────────────────────────────────────────────────
function MesaTile({
  mesa, sesion, tieneLlamado, esAsignada, onClick,
}: {
  mesa: Mesa
  sesion: SesionActivaRico | undefined
  tieneLlamado: boolean
  esAsignada: boolean
  onClick: () => void
}) {
  const ocupada = mesa.estado === 'ocupada'
  const [hov, setHov] = useState(false)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background:    ocupada ? C.orangeBg : C.greenBg,
        borderRadius:  16,
        border:        `2px solid ${tieneLlamado ? C.amber : esAsignada ? C.orange : ocupada ? C.orange : C.green}`,
        padding:       20,
        cursor:        'pointer',
        minHeight:     160,
        display:       'flex',
        flexDirection: 'column',
        transition:    'box-shadow 0.2s',
        boxShadow:     hov ? '0 4px 12px rgba(0,0,0,0.08)' : 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 32, color: C.navy, lineHeight: 1 }}>
          {mesa.numero}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          {tieneLlamado && (
            <span className="mp-bell"><Bell size={16} color={C.amber} /></span>
          )}
          <span style={{
            background: ocupada ? C.orangeBadge : C.greenBadge,
            color:      ocupada ? C.orange : C.green,
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
            padding: '3px 8px', borderRadius: 999, fontFamily: 'Inter,sans-serif',
          }}>
            {ocupada ? 'Ocupada' : 'Libre'}
          </span>
          {esAsignada && (
            <span style={{
              background: C.navy, color: 'white',
              fontSize: 10, fontWeight: 700,
              padding: '2px 6px', borderRadius: 999, fontFamily: 'Inter,sans-serif',
            }}>
              Tu mesa
            </span>
          )}
        </div>
      </div>

      {ocupada && sesion ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Users size={13} color={C.textSub} />
            <span style={{ fontSize: 13, color: C.textSub, fontFamily: 'Inter,sans-serif' }}>
              {sesion.cantidadClientes} {sesion.cantidadClientes === 1 ? 'cliente' : 'clientes'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={13} color={C.textSub} />
            <span style={{ fontSize: 13, color: C.textSub, fontFamily: 'Inter,sans-serif' }}>
              {tiempoTranscurrido(sesion.creadaEn)}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <DollarSign size={13} color={C.navy} />
            <span style={{ fontSize: 14, fontWeight: 700, color: C.navy, fontFamily: 'Montserrat,sans-serif' }}>
              ${sesion.totalAcumulado.toLocaleString('es-AR')}
            </span>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 13, color: C.textMuted, fontFamily: 'Inter,sans-serif' }}>
            {ocupada ? 'Cargando...' : 'Mesa disponible'}
          </span>
        </div>
      )}

      {tieneLlamado && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          background: C.amberBg, color: C.amber,
          borderRadius: 999, padding: '4px 10px',
          fontSize: 11, fontWeight: 700, fontFamily: 'Inter,sans-serif',
          marginTop: 10, alignSelf: 'flex-start',
        }}>
          <Bell size={11} />
          Llamado al mozo
        </div>
      )}
    </div>
  )
}

// ── PedidoSesionCard ──────────────────────────────────────────────────────────
function PedidoSesionCard({ pedido }: { pedido: SesionActivaRico['pedidos'][0] }) {
  const badge = estadoBadge(pedido.estado)
  const shortId = '#' + pedido.id.slice(0, 6).toUpperCase()
  return (
    <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13, color: C.navy }}>
          {shortId}
        </span>
        <span style={{ background: badge.bg, color: badge.color, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999 }}>
          {badge.label}
        </span>
      </div>
      {pedido.items.map((item) => (
        <div key={item.id} style={{ fontSize: 13, color: '#374151', marginBottom: 2 }}>
          {item.cantidad}× {item.itemNombre}
          {item.modificaciones.length > 0 && (
            <div style={{ paddingLeft: 12 }}>
              {item.modificaciones.map((mod, i) => (
                <div key={i} style={{ fontSize: 11, color: C.textMuted, fontStyle: 'italic' }}>
                  {mod.tipo === 'quitar' || mod.tipo === 'QUITAR'
                    ? `sin ${mod.ingredienteNombre}`
                    : `+ ${mod.ingredienteNombre}`}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      <p style={{ fontSize: 11, color: C.textMuted, marginTop: 6 }}>
        {new Date(pedido.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
      </p>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function MesasPage() {
  const navigate = useNavigate()
  const { restauranteId } = useMozoStore()

  // TODO: agregar mesasAsignadas al payload del JWT del mozo cuando el backend lo soporte
  const mesasAsignadas: string[] = []

  const [mesas,            setMesas]            = useState<Mesa[]>([])
  const [sesiones,         setSesiones]         = useState<Map<string, SesionActivaRico>>(new Map())
  const [llamados,         setLlamados]         = useState<WaiterCallRico[]>([])
  const [loading,          setLoading]          = useState(false)
  const [error,            setError]            = useState<string | null>(null)
  const [mesaSeleccionada, setMesaSeleccionada] = useState<Mesa | null>(null)
  const [sesionDetalle,    setSesionDetalle]    = useState<SesionActivaRico | null>(null)
  const [loadingSesion,    setLoadingSesion]    = useState(false)
  const [cerrando,         setCerrando]         = useState(false)

  const mesasRef    = useRef<Mesa[]>([])
  const sesionesRef = useRef<Map<string, SesionActivaRico>>(new Map())
  useEffect(() => { mesasRef.current = mesas },       [mesas])
  useEffect(() => { sesionesRef.current = sesiones }, [sesiones])

  const cargarSesiones = useCallback(async (ocupadas: Mesa[]) => {
    if (ocupadas.length === 0) return
    const results = await Promise.allSettled(ocupadas.map((m) => api.sesiones.getActiva(m.id)))
    setSesiones((prev) => {
      const next = new Map(prev)
      ocupadas.forEach((m, i) => {
        const r = results[i]
        if (r.status === 'fulfilled' && r.value) next.set(m.id, r.value)
        else if (r.status === 'fulfilled')        next.delete(m.id)
      })
      return next
    })
  }, [])

  const cargarMesas = useCallback(async () => {
    if (!restauranteId) return
    setLoading(true); setError(null)
    try {
      const data = await api.mesas.getAll(restauranteId)
      setMesas(data)
      mesasRef.current = data
      await cargarSesiones(data.filter((m) => m.estado === 'ocupada'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar mesas')
    } finally {
      setLoading(false)
    }
  }, [restauranteId, cargarSesiones])

  const cargarLlamados = useCallback(async () => {
    if (!restauranteId) return
    try {
      const data = await api.waiterCalls.getAll(restauranteId)
      setLlamados(data)
    } catch {
      // silencioso — el badge simplemente no se muestra
    }
  }, [restauranteId])

  useEffect(() => {
    void cargarMesas()
    void cargarLlamados()
  }, [cargarMesas, cargarLlamados])

  // Polling 30s
  useEffect(() => {
    if (!restauranteId) return
    const id = setInterval(() => {
      const ocupadas = mesasRef.current.filter((m) => m.estado === 'ocupada')
      if (ocupadas.length > 0) void cargarSesiones(ocupadas)
      void cargarLlamados()
    }, 30_000)
    return () => clearInterval(id)
  }, [restauranteId, cargarSesiones, cargarLlamados])

  // WebSocket
  useEffect(() => {
    if (!restauranteId) return
    const socket: Socket = io(`${WS_URL}/ws`, {
      auth:       { token: getToken() },
      transports: ['websocket'],
    })
    socket.on('connect', () => {
      socket.emit('mozo:join', { restauranteId })
    })
    socket.on('waiter:called', () => {
      void cargarLlamados()
    })
    const onSesionCerrada = ({ sesionId }: { sesionId: string }) => {
      setMesas((prev) => prev.map((m) => {
        const s = sesionesRef.current.get(m.id)
        return s?.sesionId === sesionId ? { ...m, estado: 'libre' } : m
      }))
      setSesiones((prev) => {
        const next = new Map(prev)
        for (const [mesaId, sesion] of next) {
          if (sesion.sesionId === sesionId) { next.delete(mesaId); break }
        }
        return next
      })
      if (sesionDetalle?.sesionId === sesionId) setSesionDetalle(null)
    }
    socket.on('sesion:cerrada', onSesionCerrada)
    socket.on('session:closed', onSesionCerrada)
    return () => { socket.disconnect() }
  }, [restauranteId, cargarLlamados, sesionDetalle?.sesionId])

  const mesasConLlamado = useMemo(
    () => new Set(llamados.map((l) => l.sesion.mesa.numero)),
    [llamados],
  )

  const handleSeleccionarMesa = async (mesa: Mesa) => {
    setMesaSeleccionada(mesa)
    setSesionDetalle(null)
    if (mesa.estado === 'ocupada') {
      setLoadingSesion(true)
      try {
        const sesion = await api.sesiones.getActiva(mesa.id)
        setSesionDetalle(sesion)
      } catch {
        // sin acceso o sin sesión
      } finally {
        setLoadingSesion(false)
      }
    }
  }

  const handleCerrarSesion = async () => {
    if (!mesaSeleccionada || !window.confirm(`¿Cerrar la sesión de Mesa ${mesaSeleccionada.numero}?`)) return
    setCerrando(true)
    try {
      await api.sesiones.cerrar(mesaSeleccionada.id)
      setMesas((prev) => prev.map((m) => m.id === mesaSeleccionada.id ? { ...m, estado: 'libre' } : m))
      setSesiones((prev) => { const next = new Map(prev); next.delete(mesaSeleccionada.id); return next })
      setSesionDetalle(null)
      setMesaSeleccionada(null)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al cerrar sesión')
    } finally {
      setCerrando(false)
    }
  }

  // ── Vista B ──────────────────────────────────────────────────────────────────
  if (mesaSeleccionada) {
    const ocupada = mesaSeleccionada.estado === 'ocupada'

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* Header */}
        <header style={{ background: C.navy, height: 56, display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12, flexShrink: 0 }}>
          <button
            onClick={() => { setMesaSeleccionada(null); setSesionDetalle(null) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Inter,sans-serif', fontSize: 13 }}
          >
            <ChevronLeft size={16} /> Volver
          </button>
          <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 18, color: 'white' }}>
            Mesa {mesaSeleccionada.numero}
          </span>
          <span style={{
            marginLeft: 'auto',
            background: ocupada ? C.orangeBadge : C.greenBadge,
            color:      ocupada ? C.orange : C.green,
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
            padding: '3px 8px', borderRadius: 999, fontFamily: 'Inter,sans-serif',
          }}>
            {ocupada ? 'Ocupada' : 'Libre'}
          </span>
        </header>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 120px' }}>
          {ocupada && sesionDetalle ? (
            <>
              {/* Métricas */}
              <div style={{ display: 'flex', gap: 20, marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Clock size={15} color={C.textSub} />
                  <span style={{ fontSize: 14, color: '#374151', fontFamily: 'Inter,sans-serif' }}>
                    {tiempoTranscurrido(sesionDetalle.creadaEn)}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Users size={15} color={C.textSub} />
                  <span style={{ fontSize: 14, color: '#374151', fontFamily: 'Inter,sans-serif' }}>
                    {sesionDetalle.cantidadClientes} {sesionDetalle.cantidadClientes === 1 ? 'cliente' : 'clientes'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <DollarSign size={15} color={C.navy} />
                  <span style={{ fontSize: 15, fontWeight: 700, color: C.navy, fontFamily: 'Montserrat,sans-serif' }}>
                    ${sesionDetalle.totalAcumulado.toLocaleString('es-AR')}
                  </span>
                </div>
              </div>

              {/* Pedidos */}
              <p style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 15, color: C.navy, margin: '0 0 12px' }}>
                Pedidos de la sesión
              </p>
              {sesionDetalle.pedidos.length === 0 ? (
                <p style={{ fontSize: 13, color: C.textMuted, fontFamily: 'Inter,sans-serif' }}>Sin pedidos aún.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {sesionDetalle.pedidos.map((p) => (
                    <PedidoSesionCard key={p.id} pedido={p} />
                  ))}
                </div>
              )}
            </>
          ) : ocupada && loadingSesion ? (
            <p style={{ fontSize: 13, color: C.textMuted, fontFamily: 'Inter,sans-serif' }}>Cargando sesión...</p>
          ) : ocupada ? (
            <p style={{ fontSize: 13, color: C.textMuted, fontFamily: 'Inter,sans-serif' }}>Sin información de sesión.</p>
          ) : (
            <p style={{ fontSize: 13, color: C.textMuted, fontFamily: 'Inter,sans-serif', textAlign: 'center', padding: '40px 0' }}>
              Mesa disponible
            </p>
          )}
        </div>

        {/* Botones sticky */}
        <div style={{
          position: 'sticky', bottom: 0,
          background: 'white', borderTop: `1px solid ${C.border}`,
          padding: '14px 20px',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
        }}>
          <button
            onClick={() => navigate(`/mozo/toma-pedidos?mesaId=${mesaSeleccionada.id}`)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              border: `1px solid ${C.navy}`, background: 'white', color: C.navy,
              borderRadius: 10, padding: 12, fontSize: 13, fontWeight: 600,
              fontFamily: 'Inter,sans-serif', cursor: 'pointer',
            }}
          >
            <ShoppingBag size={18} />
            Tomar pedido
          </button>
          <button
            onClick={() => { void handleCerrarSesion() }}
            disabled={!ocupada || cerrando}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              border: 'none',
              background: ocupada ? C.orange : '#d1d5db',
              color: 'white',
              borderRadius: 10, padding: 12, fontSize: 13, fontWeight: 700,
              fontFamily: 'Montserrat,sans-serif',
              cursor: ocupada && !cerrando ? 'pointer' : 'not-allowed',
              opacity: cerrando ? 0.7 : 1,
            }}
          >
            <DoorOpen size={18} />
            {cerrando ? 'Cerrando...' : 'Cerrar sesión'}
          </button>
        </div>
      </div>
    )
  }

  // ── Vista A ──────────────────────────────────────────────────────────────────
  const totalOcupadas = mesas.filter((m) => m.estado === 'ocupada').length

  return (
    <div className="min-h-screen bg-gray-50">
      <header style={{ background: C.navy, height: 56, display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12, flexShrink: 0 }}>
        <button
          onClick={() => navigate('/mozo')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Inter,sans-serif', fontSize: 13 }}
        >
          <ChevronLeft size={16} /> Panel
        </button>
        <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 18, color: 'white' }}>
          Mesas
        </span>
        <span style={{ marginLeft: 'auto', fontFamily: 'Inter,sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
          {mesas.length} mesas · {totalOcupadas} ocupadas
        </span>
      </header>

      <main style={{ padding: 20 }}>
        {error && (
          <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.red, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
            {error}
          </p>
        )}

        {loading ? (
          <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.textMuted, textAlign: 'center', paddingTop: 48 }}>
            Cargando mesas...
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
            {mesas.map((mesa) => (
              <MesaTile
                key={mesa.id}
                mesa={mesa}
                sesion={sesiones.get(mesa.id)}
                tieneLlamado={mesasConLlamado.has(mesa.numero)}
                esAsignada={mesasAsignadas.includes(mesa.id)}
                onClick={() => void handleSeleccionarMesa(mesa)}
              />
            ))}
            {mesas.length === 0 && !loading && (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '48px 0' }}>
                <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 14, color: C.textMuted }}>
                  Sin mesas asignadas a este restaurante.
                </span>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
