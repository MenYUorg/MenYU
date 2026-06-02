import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@menyu/auth'
import {
  ArrowRight, Bell, ChefHat, CheckCircle, ClipboardList, CreditCard,
  History, LayoutGrid, LogOut,
} from 'lucide-react'
import { useMozoStore } from '../../store/mozoStore'
import { api } from '../../services/api'
import type { WaiterCallRico, PedidoRico } from '../../services/api'
import * as socketService from '../../services/socket'
import type { Pedido } from '@menyu/types'

// ── Helpers ───────────────────────────────────────────────────────────────────
function getInitials(nombre?: string, email?: string): string {
  const src = nombre ?? email ?? '?'
  return src.split(/[\s@.]/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')
}

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
      onAtendido()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      background:     'white',
      borderRadius:   14,
      border:         '1px solid #E6E8EF',
      borderLeft:     `4px solid ${llamado.motivo === 'pedir_cuenta' ? '#E8563A' : '#d97706'}`,
      padding:        '14px 16px',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'space-between',
      gap:            12,
    }}>
      <div>
        <p style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 16, color: '#2D3561', margin: 0 }}>
          Mesa {llamado.sesion.mesa.numero}
        </p>
        <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: '#6B7280', margin: '2px 0 0' }}>
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
          background:   loading ? '#d1d5db' : '#2D3561',
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
    <div style={{
      background:     'white',
      borderRadius:   14,
      border:         '1px solid #E6E8EF',
      borderLeft:     '4px solid #1F9D57',
      padding:        '14px 16px',
      display:        'flex',
      alignItems:     'flex-start',
      justifyContent: 'space-between',
      gap:            12,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 16, color: '#2D3561', margin: '0 0 4px' }}>
          Mesa {pedido.mesa.numero}
        </p>
        <div>
          {pedido.items.map((item) => (
            <p key={item.id} style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: '#6B7280', margin: '1px 0' }}>
              {(item.cantidadEditada ?? item.cantidad)}× {item.item.nombre}
            </p>
          ))}
        </div>
        <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 11, color: '#9CA3AF', margin: '4px 0 0' }}>
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
          background:   loading ? '#d1d5db' : '#1F9D57',
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

// ── LogoutBtn ─────────────────────────────────────────────────────────────────
function LogoutBtn({ onClick }: { onClick: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display:      'flex',
        alignItems:   'center',
        gap:          6,
        background:   hov ? 'rgba(255,255,255,0.10)' : 'transparent',
        border:       '1px solid rgba(255,255,255,0.25)',
        borderRadius: 10,
        padding:      '9px 15px',
        color:        'rgba(255,255,255,0.85)',
        fontFamily:   'Montserrat, sans-serif',
        fontWeight:   700,
        fontSize:     13,
        cursor:       'pointer',
        transition:   'background 0.15s',
      }}
    >
      <LogOut size={14} />
      Salir
    </button>
  )
}

// ── NavCard ───────────────────────────────────────────────────────────────────
interface NavCardProps {
  icon: React.ReactNode
  chipBg: string
  iconColor: string
  title: string
  titleBadge?: string
  description: string
  to: string
  fullWidth?: boolean
  dark?: boolean
}

function NavCard({ icon, chipBg, iconColor, title, titleBadge, description, to, fullWidth, dark }: NavCardProps) {
  const navigate = useNavigate()
  const [hov, setHov] = useState(false)

  const borderColor = dark
    ? (hov ? '#242b52' : '#2D3561')
    : (hov ? '#D2D6E5' : '#E6E8EF')

  return (
    <div
      role="button"
      onClick={() => navigate(to)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background:    dark ? '#2D3561' : '#FFFFFF',
        border:        `1px solid ${borderColor}`,
        borderRadius:  14,
        padding:       '20px',
        display:       'flex',
        flexDirection: 'row',
        alignItems:    'center',
        gap:           16,
        cursor:        'pointer',
        gridColumn:    fullWidth ? '1 / -1' : undefined,
        transform:     hov ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow:     hov ? '0 12px 26px rgba(45,53,97,0.10)' : 'none',
        transition:    'transform 0.14s, box-shadow 0.14s, border-color 0.14s',
      }}
    >
      {/* Chip ícono */}
      <div style={{
        width:          50,
        height:         50,
        borderRadius:   13,
        background:     chipBg,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        color:          iconColor,
        flexShrink:     0,
      }}>
        {icon}
      </div>

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontFamily:  'Montserrat, sans-serif',
          fontWeight:  700,
          fontSize:    dark ? 18 : 16,
          color:       dark ? 'white' : '#2D3561',
          margin:      0,
          display:     'flex',
          alignItems:  'center',
          gap:         8,
          flexWrap:    'wrap',
        }}>
          {title}
          {titleBadge && (
            <span style={{
              fontFamily:   'Inter, sans-serif',
              fontWeight:   400,
              fontSize:     11,
              color:        'rgba(255,255,255,0.9)',
              background:   'rgba(255,255,255,0.14)',
              padding:      '2px 8px',
              borderRadius: 20,
              whiteSpace:   'nowrap',
            }}>
              {titleBadge}
            </span>
          )}
        </p>
        <p style={{
          fontFamily: 'Inter, sans-serif',
          fontSize:   dark ? 13 : 12.5,
          color:      dark ? 'rgba(255,255,255,0.72)' : '#6B7280',
          margin:     '3px 0 0',
        }}>
          {description}
        </p>
      </div>

      {/* Flecha */}
      <ArrowRight
        size={18}
        color={dark ? 'rgba(255,255,255,0.7)' : (hov ? '#2D3561' : '#9CA3AF')}
        style={{
          transform:  hov ? 'translateX(3px)' : 'translateX(0)',
          transition: 'transform 0.14s',
          flexShrink: 0,
        }}
      />
    </div>
  )
}

// ── MozoPanel ─────────────────────────────────────────────────────────────────
export function MozoPanel() {
  const { user, logout } = useAuth()
  const { restauranteId: restauranteIdStore, restauranteNombre: storeRestauranteNombre, marcaNombre: storeMarcaNombre } = useMozoStore()
  const restauranteId     = user?.restauranteId ?? restauranteIdStore
  const restauranteNombre = storeRestauranteNombre
  const marcaNombre       = storeMarcaNombre

  const [llamados,      setLlamados]      = useState<WaiterCallRico[]>([])
  const [pedidosListos, setPedidosListos] = useState<PedidoRico[]>([])

  const cargarLlamados = useCallback(async () => {
    if (!restauranteId) return
    try {
      const data = await api.waiterCalls.getAll(restauranteId)
      setLlamados(data)
    } catch { /* silencioso */ }
  }, [restauranteId])

  const cargarPedidosListos = useCallback(async () => {
    if (!restauranteId) return
    try {
      const data = await api.pedidos.getByRestaurante(restauranteId, { estado: 'listo' })
      setPedidosListos(data)
    } catch { /* silencioso */ }
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
        setPedidosListos((prev) => [...prev.filter((p) => p.id !== pedido.id), rico])
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

  const nombreMozo  = user?.nombre ?? user?.email ?? 'Mozo'
  const initials    = getInitials(user?.nombre, user?.email)
  const hasAlerts   = llamados.length > 0 || pedidosListos.length > 0

  return (
    <div style={{ minHeight: '100vh', background: '#F6F7F9', display: 'flex', flexDirection: 'column' }}>

      {/* ── Topbar ── */}
      <header style={{
        background:     '#2D3561',
        padding:        '14px 28px',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        flexShrink:     0,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width:          32,
            height:         32,
            borderRadius:   8,
            background:     '#E8563A',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            flexShrink:     0,
          }}>
            <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 17, color: 'white' }}>M</span>
          </div>
          <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 18, color: 'white' }}>
            Men<span style={{ color: '#F2A28F' }}>Yu</span>
          </span>
        </div>

        {/* Right: who + logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Who */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: 13.5, color: 'white', margin: 0 }}>
                {nombreMozo}
              </p>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.6)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Mozo
              </p>
            </div>
            <div style={{
              width:          36,
              height:         36,
              borderRadius:   '50%',
              background:     'rgba(255,255,255,0.14)',
              border:         '1px solid rgba(255,255,255,0.18)',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              color:          'white',
              fontFamily:     'Montserrat, sans-serif',
              fontWeight:     700,
              fontSize:       13,
              flexShrink:     0,
            }}>
              {initials}
            </div>
          </div>
          <LogoutBtn onClick={logout} />
        </div>
      </header>

      {/* ── Resto strip ── */}
      <div style={{
        background:   'white',
        borderBottom: '1px solid #E6E8EF',
        padding:      '14px 28px',
        display:      'flex',
        alignItems:   'center',
        gap:          14,
      }}>
        {/* Marca chip */}
        <div style={{
          width:          42,
          height:         42,
          borderRadius:   11,
          background:     'linear-gradient(135deg, #2D3561, #3c477f)',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          color:          'white',
          fontFamily:     'Montserrat, sans-serif',
          fontWeight:     800,
          fontSize:       15,
          flexShrink:     0,
        }}>
          {marcaNombre ? marcaNombre.split(' ').slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? '').join('') : 'M'}
        </div>
        {/* Nombres */}
        <div style={{ flex: 1 }}>
          <p style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 15.5, color: '#2D3561', margin: 0 }}>
            {marcaNombre ?? '—'}
          </p>
          <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 500, fontSize: 12, color: '#6B7280', margin: '2px 0 0' }}>
            {restauranteNombre ?? '—'}
          </p>
        </div>
        {/* Badge abierto */}
        <div style={{
          display:      'flex',
          alignItems:   'center',
          gap:          6,
          background:   '#E4F6EC',
          padding:      '6px 13px',
          borderRadius: 999,
          flexShrink:   0,
        }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#1F9D57' }} />
          <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 12, color: '#1F9D57' }}>
            Abierto
          </span>
        </div>
      </div>

      {/* ── Main ── */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 40px' }}>

        {/* Hero */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 24, color: '#2D3561', margin: '0 0 4px' }}>
            Hola, {nombreMozo} 👋
          </h1>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 14.5, color: '#6B7280', margin: 0 }}>
            Este es tu panel de trabajo.
          </p>
        </div>

        {/* Alert bar */}
        <div style={{
          background:   'white',
          border:       '1px solid #E6E8EF',
          borderLeft:   `4px solid ${hasAlerts ? '#E8563A' : '#1F9D57'}`,
          borderRadius: 14,
          padding:      '16px 20px',
          display:      'flex',
          alignItems:   'center',
          gap:          16,
          marginBottom: 24,
        }}>
          <div style={{
            width:          40,
            height:         40,
            borderRadius:   '50%',
            background:     hasAlerts ? '#FDF0ED' : '#E4F6EC',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            flexShrink:     0,
          }}>
            {hasAlerts
              ? <Bell size={20} color="#E8563A" />
              : <CheckCircle size={20} color="#1F9D57" />
            }
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 14.5, color: '#2D3561', margin: 0 }}>
              {hasAlerts ? 'Tenés alertas pendientes' : 'Sin alertas pendientes'}
            </p>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12.5, color: '#6B7280', margin: '2px 0 0' }}>
              {hasAlerts
                ? 'Hay mesas que requieren tu atención.'
                : 'Ninguna mesa pidió mozo ni cuenta en este momento.'
              }
            </p>
          </div>
          <div style={{ display: 'flex', gap: 24, flexShrink: 0 }}>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 20, color: '#2D3561', margin: 0 }}>{llamados.length}</p>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: '#6B7280', margin: '1px 0 0' }}>Llamados</p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 20, color: '#2D3561', margin: 0 }}>{pedidosListos.length}</p>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: '#6B7280', margin: '1px 0 0' }}>Pedidos listos</p>
            </div>
          </div>
        </div>

        {/* Sección de alertas activas */}
        {hasAlerts && (
          <div style={{ marginBottom: 28 }}>
            {llamados.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <Bell size={15} color="#E8563A" />
                  <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13, color: '#2D3561' }}>
                    Llamados pendientes
                  </span>
                  <span style={{ background: '#FDF0ED', color: '#E8563A', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 11, padding: '2px 8px', borderRadius: 999 }}>
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

            {pedidosListos.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <CheckCircle size={15} color="#1F9D57" />
                  <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13, color: '#2D3561' }}>
                    Listos para entregar
                  </span>
                  <span style={{ background: '#E4F6EC', color: '#1F9D57', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 11, padding: '2px 8px', borderRadius: 999 }}>
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
          </div>
        )}

        {/* Acceso rápido */}
        <p style={{
          fontFamily:    'Montserrat, sans-serif',
          fontWeight:    700,
          fontSize:      12,
          color:         '#9CA3AF',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          margin:        '0 0 14px',
        }}>
          Acceso rápido
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <NavCard
            icon={<ClipboardList size={24} />}
            chipBg="#E8563A"
            iconColor="white"
            title="Hacer pedido"
            titleBadge="Acción principal"
            description="Abrí una mesa y cargá ítems"
            to="/mozo/toma-pedidos"
            fullWidth
            dark
          />
          <NavCard
            icon={<ChefHat size={24} />}
            chipBg="#EEF0F8"
            iconColor="#2D3561"
            title="Pedidos"
            description="Kanban en tiempo real"
            to="/mozo/pedidos"
          />
          <NavCard
            icon={<CreditCard size={24} />}
            chipBg="#FDF0ED"
            iconColor="#E8563A"
            title="Pagos"
            description="Registrá cobros de mesa"
            to="/mozo/pagos"
          />
          <NavCard
            icon={<LayoutGrid size={24} />}
            chipBg="#EEF0F8"
            iconColor="#2D3561"
            title="Mesas"
            description="Estado y detalle de cada mesa"
            to="/mozo/mesas"
          />
          <NavCard
            icon={<History size={24} />}
            chipBg="#EEF0F8"
            iconColor="#2D3561"
            title="Historial"
            description="Pedidos entregados y ediciones"
            to="/mozo/historial"
          />
        </div>

      </main>
    </div>
  )
}
