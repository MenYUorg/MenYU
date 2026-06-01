import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@menyu/auth'
import {
  Bell, ChefHat, CheckCircle, ClipboardList, History, LayoutGrid, LogOut,
} from 'lucide-react'
import { useMozoStore } from '../../store/mozoStore'
import { api } from '../../services/api'
import type { WaiterCallRico, PedidoRico } from '../../services/api'
import * as socketService from '../../services/socket'
import type { Pedido } from '@menyu/types'

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  orange:    '#E8563A',
  navy:      '#2D3561',
  green:     '#16a34a',
  greenBg:   '#f0fdf4',
  orangeBg:  '#fff8f6',
  border:    '#e5e7eb',
  bgLight:   '#f9fafb',
  textSub:   '#6b7280',
  textMuted: '#9ca3af',
  red:       '#dc2626',
  amber:     '#d97706',
  amberBg:   '#fef3c7',
} as const

// ── Helpers ───────────────────────────────────────────────────────────────────
function tiempoDesde(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

function motivoLabel(motivo: string | null): string {
  if (motivo === 'pedir_cuenta') return '🧾 Pedir cuenta'
  return '🔔 Asistencia'
}

// ── LlamadoCard ───────────────────────────────────────────────────────────────
function LlamadoCard({
  llamado,
  onAtendido,
}: {
  llamado: WaiterCallRico
  onAtendido: () => void
}) {
  const [loading, setLoading] = useState(false)

  async function handleAtender() {
    if (loading) return
    setLoading(true)
    try {
      await api.waiterCalls.atender(llamado.id)
      onAtendido()
    } catch {
      // silencioso — la card se quita igualmente
      onAtendido()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        background:   'white',
        borderRadius: 12,
        border:       `1px solid ${C.border}`,
        borderLeft:   `4px solid ${llamado.motivo === 'pedir_cuenta' ? C.orange : C.amber}`,
        padding:      '14px 16px',
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'space-between',
        gap:          12,
      }}
    >
      <div>
        <p style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 16, color: C.navy, margin: 0 }}>
          Mesa {llamado.sesion.mesa.numero}
        </p>
        <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: C.textSub, margin: '2px 0 0' }}>
          {motivoLabel(llamado.motivo)} · {tiempoDesde(llamado.createdAt)}
        </p>
      </div>
      <button
        onClick={() => void handleAtender()}
        disabled={loading}
        style={{
          display:      'flex',
          alignItems:   'center',
          gap:          6,
          background:   loading ? '#d1d5db' : C.navy,
          color:        'white',
          border:       'none',
          borderRadius: 8,
          padding:      '8px 14px',
          fontFamily:   'Montserrat,sans-serif',
          fontWeight:   600,
          fontSize:     12,
          cursor:       loading ? 'wait' : 'pointer',
          flexShrink:   0,
        }}
      >
        <CheckCircle size={14} />
        {loading ? 'Guardando…' : 'Atendido'}
      </button>
    </div>
  )
}

// ── PedidoListoCard ───────────────────────────────────────────────────────────
function PedidoListoCard({
  pedido,
  onEntregado,
}: {
  pedido: PedidoRico
  onEntregado: () => void
}) {
  const [loading, setLoading] = useState(false)

  async function handleEntregar() {
    if (loading) return
    setLoading(true)
    try {
      await api.pedidos.cambiarEstado(pedido.id, 'entregado')
      onEntregado()
    } catch {
      onEntregado()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        background:   'white',
        borderRadius: 12,
        border:       `1px solid ${C.border}`,
        borderLeft:   `4px solid ${C.green}`,
        padding:      '14px 16px',
        display:      'flex',
        alignItems:   'flex-start',
        justifyContent: 'space-between',
        gap:          12,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 16, color: C.navy, margin: '0 0 4px' }}>
          Mesa {pedido.mesa.numero}
        </p>
        <div>
          {pedido.items.map((item) => (
            <p key={item.id} style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: C.textSub, margin: '1px 0' }}>
              {(item.cantidadEditada ?? item.cantidad)}× {item.item.nombre}
            </p>
          ))}
        </div>
        <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 11, color: C.textMuted, margin: '4px 0 0' }}>
          Listo hace {tiempoDesde(pedido.updatedAt)}
        </p>
      </div>
      <button
        onClick={() => void handleEntregar()}
        disabled={loading}
        style={{
          display:      'flex',
          alignItems:   'center',
          gap:          6,
          background:   loading ? '#d1d5db' : C.green,
          color:        'white',
          border:       'none',
          borderRadius: 8,
          padding:      '8px 14px',
          fontFamily:   'Montserrat,sans-serif',
          fontWeight:   600,
          fontSize:     12,
          cursor:       loading ? 'wait' : 'pointer',
          flexShrink:   0,
        }}
      >
        <CheckCircle size={14} />
        {loading ? '…' : 'Entregado'}
      </button>
    </div>
  )
}

// ── NavCard ───────────────────────────────────────────────────────────────────
function NavCard({
  icon,
  title,
  description,
  to,
}: {
  icon: React.ReactNode
  title: string
  description: string
  to: string
}) {
  const navigate = useNavigate()
  const [hov, setHov] = useState(false)

  return (
    <button
      onClick={() => navigate(to)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background:   hov ? C.orange : 'white',
        border:       `1px solid ${hov ? C.orange : C.border}`,
        borderRadius: 16,
        padding:      '20px 18px',
        display:      'flex',
        flexDirection: 'column',
        alignItems:   'flex-start',
        gap:          10,
        cursor:       'pointer',
        transition:   'background 0.15s, border-color 0.15s',
        textAlign:    'left',
        width:        '100%',
      }}
    >
      <div
        style={{
          width:          44,
          height:         44,
          borderRadius:   12,
          background:     hov ? 'rgba(255,255,255,0.2)' : C.bgLight,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          color:          hov ? 'white' : C.navy,
          transition:     'background 0.15s, color 0.15s',
        }}
      >
        {icon}
      </div>
      <div>
        <p
          style={{
            fontFamily: 'Montserrat,sans-serif',
            fontWeight: 700,
            fontSize:   15,
            color:      hov ? 'white' : C.navy,
            margin:     0,
            transition: 'color 0.15s',
          }}
        >
          {title}
        </p>
        <p
          style={{
            fontFamily: 'Inter,sans-serif',
            fontSize:   12,
            color:      hov ? 'rgba(255,255,255,0.8)' : C.textSub,
            margin:     '3px 0 0',
            transition: 'color 0.15s',
          }}
        >
          {description}
        </p>
      </div>
    </button>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function MozoPanel() {
  const { user, logout } = useAuth()
  const { restauranteId: restauranteIdStore } = useMozoStore()
  const restauranteId = user?.restauranteId ?? restauranteIdStore

  const [llamados,      setLlamados]      = useState<WaiterCallRico[]>([])
  const [pedidosListos, setPedidosListos] = useState<PedidoRico[]>([])

  const cargarLlamados = useCallback(async () => {
    if (!restauranteId) return
    try {
      const data = await api.waiterCalls.getAll(restauranteId)
      setLlamados(data)
    } catch {
      // silencioso
    }
  }, [restauranteId])

  const cargarPedidosListos = useCallback(async () => {
    if (!restauranteId) return
    try {
      const data = await api.pedidos.getByRestaurante(restauranteId, { estado: 'listo' })
      setPedidosListos(data)
    } catch {
      // silencioso
    }
  }, [restauranteId])

  useEffect(() => {
    void cargarLlamados()
    void cargarPedidosListos()
  }, [cargarLlamados, cargarPedidosListos])

  // WebSocket
  useEffect(() => {
    if (!restauranteId) return

    socketService.joinRestauranteComoMozo(restauranteId)

    const unsubLlamado = socketService.onMozoCalled(
      (data: { llamadoId: string; sesionId: string; mesaNumero: string; motivo: string }) => {
        setLlamados((prev) => {
          const nuevo: WaiterCallRico = {
            id:        data.llamadoId,
            sesionId:  data.sesionId,
            mozoId:    null,
            estado:    'pendiente',
            motivo:    data.motivo,
            createdAt: new Date().toISOString(),
            sesion:    { mesa: { numero: data.mesaNumero } },
          }
          return [...prev, nuevo]
        })
      },
    )

    const unsubPedido = socketService.onPedidoActualizado((pedido: Pedido) => {
      const rico = pedido as unknown as PedidoRico
      if (pedido.estado === 'listo') {
        setPedidosListos((prev) => {
          const filtered = prev.filter((p) => p.id !== pedido.id)
          return [...filtered, rico]
        })
      } else {
        setPedidosListos((prev) => prev.filter((p) => p.id !== pedido.id))
      }
    })

    return () => {
      unsubLlamado()
      unsubPedido()
      // No desconectamos el socket en cleanup para evitar el error de StrictMode
      // ("WebSocket closed before connection established" en desarrollo).
      // El socket se desconecta solo cuando se cierra la pestaña o se llama logout.
    }
  }, [restauranteId])

  const nombreMozo = user?.nombre ?? user?.email ?? 'Mozo'

  return (
    <div style={{ minHeight: '100vh', background: C.bgLight, display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <header
        style={{
          background:     C.navy,
          height:         56,
          display:        'flex',
          alignItems:     'center',
          padding:        '0 20px',
          justifyContent: 'space-between',
          flexShrink:     0,
        }}
      >
        <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 20, color: 'white', letterSpacing: '-0.02em' }}>
          MenYu
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
            {nombreMozo}
          </span>
          <button
            onClick={logout}
            style={{
              display:      'flex',
              alignItems:   'center',
              gap:          6,
              background:   'none',
              border:       '1px solid rgba(255,255,255,0.2)',
              borderRadius: 8,
              padding:      '6px 12px',
              color:        'rgba(255,255,255,0.7)',
              fontFamily:   'Inter,sans-serif',
              fontSize:     12,
              cursor:       'pointer',
            }}
          >
            <LogOut size={13} />
            Salir
          </button>
        </div>
      </header>

      {/* Content */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '20px 16px 32px' }}>

        {/* ── Alertas ── */}
        {(llamados.length > 0 || pedidosListos.length > 0) && (
          <section style={{ marginBottom: 28 }}>

            {/* Llamados */}
            {llamados.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <Bell size={16} color={C.amber} />
                  <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 14, color: C.navy }}>
                    Llamados pendientes
                  </span>
                  <span style={{ background: C.amberBg, color: C.amber, fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 11, padding: '2px 8px', borderRadius: 999 }}>
                    {llamados.length}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {llamados.map((l) => (
                    <LlamadoCard
                      key={l.id}
                      llamado={l}
                      onAtendido={() => setLlamados((prev) => prev.filter((x) => x.id !== l.id))}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Pedidos listos */}
            {pedidosListos.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <CheckCircle size={16} color={C.green} />
                  <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 14, color: C.navy }}>
                    Listos para entregar
                  </span>
                  <span style={{ background: '#dcfce7', color: C.green, fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 11, padding: '2px 8px', borderRadius: 999 }}>
                    {pedidosListos.length}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pedidosListos.map((p) => (
                    <PedidoListoCard
                      key={p.id}
                      pedido={p}
                      onEntregado={() => setPedidosListos((prev) => prev.filter((x) => x.id !== p.id))}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Separador cuando no hay alertas */}
        {llamados.length === 0 && pedidosListos.length === 0 && (
          <div
            style={{
              background:   'white',
              border:       `1px solid ${C.border}`,
              borderRadius: 12,
              padding:      '16px 20px',
              display:      'flex',
              alignItems:   'center',
              gap:          10,
              marginBottom: 28,
            }}
          >
            <CheckCircle size={18} color={C.green} />
            <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 14, color: C.textSub }}>
              Sin alertas pendientes
            </span>
          </div>
        )}

        {/* ── Navegación ── */}
        <div>
          <p style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>
            Acceso rápido
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <NavCard
              icon={<LayoutGrid size={22} />}
              title="Mesas"
              description="Estado y detalle de cada mesa"
              to="/mozo/mesas"
            />
            <NavCard
              icon={<ClipboardList size={22} />}
              title="Tomar pedido"
              description="Abrí una mesa y cargá ítems"
              to="/mozo/toma-pedidos"
            />
            <NavCard
              icon={<ChefHat size={22} />}
              title="Pedidos"
              description="Kanban en tiempo real"
              to="/mozo/pedidos"
            />
            <NavCard
              icon={<History size={22} />}
              title="Historial"
              description="Pedidos entregados y ediciones"
              to="/mozo/historial"
            />
          </div>
        </div>

      </main>
    </div>
  )
}
