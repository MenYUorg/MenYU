import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, Bell, ClipboardList, Clock, CreditCard,
  DollarSign, DoorOpen, Printer, QrCode, Users, X,
} from 'lucide-react'
import { TOKEN_KEY } from '@menyu/auth'
import { io, type Socket } from 'socket.io-client'
import { useContextStore } from '../../../store/contextStore'
import { api } from '../../../services/api'
import type { MesaConQr, SesionActiva } from '../../../services/api'

// ── Bell shake animation ───────────────────────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('gmp-bell-css')) {
  const s = document.createElement('style')
  s.id = 'gmp-bell-css'
  s.textContent = `
    @keyframes gmpBell {
      0%,100%{transform:rotate(0)}
      10%,30%,50%,70%{transform:rotate(-18deg)}
      20%,40%,60%,80%{transform:rotate(18deg)}
      90%{transform:rotate(-10deg)}
    }
    .gmp-bell{animation:gmpBell 1s ease-in-out infinite;transform-origin:50% 0;display:inline-flex}
  `
  document.head.appendChild(s)
}

// ── Palette ────────────────────────────────────────────────────────────────────
const C = {
  orange:        '#E8563A',
  navy:          '#2D3561',
  green:         '#16a34a',
  greenBg:       '#f0fdf4',
  greenBadgeBg:  '#dcfce7',
  orangeBg:      '#fff8f6',
  orangeBadge:   '#FDE5DF',
  amber:         '#d97706',
  amberBg:       '#fef3c7',
  border:        '#e5e7eb',
  bgLight:       '#f9fafb',
  textSub:       '#6b7280',
  textMuted:     '#9ca3af',
  red:           '#dc2626',
} as const

const WS_URL: string =
  (import.meta.env.VITE_WS_URL as string | undefined) ??
  (import.meta.env.VITE_API_URL as string | undefined)?.replace('/api', '') ??
  ''

// ── Helpers ────────────────────────────────────────────────────────────────────
function tiempoTranscurrido(creadaEn: string): string {
  const diff = Date.now() - new Date(creadaEn).getTime()
  const horas = Math.floor(diff / 3600000)
  const mins  = Math.floor((diff % 3600000) / 60000)
  return horas > 0 ? `${horas}h ${mins}m` : `${mins} min`
}

function estadoBadge(estado: string): { bg: string; color: string; label: string } {
  const MAP: Record<string, { bg: string; color: string; label: string }> = {
    pendiente:      { bg: '#fef9c3', color: '#854d0e', label: '● Pendiente' },
    en_preparacion: { bg: '#FDE5DF', color: C.orange,  label: '● En preparación' },
    listo:          { bg: '#dcfce7', color: C.green,   label: '● Listo' },
    entregado:      { bg: '#f3f4f6', color: C.textSub, label: '● Entregado' },
  }
  return MAP[estado] ?? MAP['pendiente']
}

// ── Notificación ───────────────────────────────────────────────────────────────
interface Notificacion { id: number; mesaNumero: string; motivo: string }

function NotificacionCard({ notif, onClose }: { notif: Notificacion; onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed', top: 16, right: 16, zIndex: 50,
      background: 'white', borderRadius: 12, padding: '16px 20px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      borderLeft: `4px solid ${notif.motivo === 'general' ? C.orange : C.navy}`,
      minWidth: 240, maxWidth: 320,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
    }}>
      <div>
        <p style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 15, color: C.navy, margin: '0 0 4px' }}>
          Mesa {notif.mesaNumero}
        </p>
        <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.textSub, margin: 0 }}>
          {notif.motivo === 'general' ? 'Llamado al mozo' : notif.motivo}
        </p>
      </div>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 0, display: 'flex', flexShrink: 0 }}>
        <X size={16} />
      </button>
    </div>
  )
}

// ── ModalConfirmar ─────────────────────────────────────────────────────────────
function ModalConfirmar({
  title, text, confirmLabel, confirmColor, loading, onConfirm, onCancel,
}: {
  title: string; text: string; confirmLabel: string; confirmColor: string
  loading: boolean; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div
      onClick={onCancel}
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'white', width: 360, maxWidth: '95vw', borderRadius: 16, padding: 28 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <AlertTriangle size={32} color={C.orange} />
          <h3 style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 18, color: C.navy, margin: 0, textAlign: 'center' }}>
            {title}
          </h3>
          <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.textSub, margin: 0, textAlign: 'center' }}>
            {text}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '10px 16px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'white', color: '#374151', fontFamily: 'Montserrat,sans-serif', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button onClick={onConfirm} disabled={loading} style={{ flex: 1, padding: '10px 16px', borderRadius: 10, border: 'none', background: confirmColor, color: 'white', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Procesando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── ModalQrPin ─────────────────────────────────────────────────────────────────
function ModalQrPin({ mesa, onClose, onRegenerar, regenerando }: {
  mesa: MesaConQr; onClose: () => void; onRegenerar: () => Promise<void>; regenerando: boolean
}) {
  const ocupada = mesa.estado === 'ocupada'
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'white', width: '100%', maxWidth: 380, maxHeight: 'calc(100vh - 40px)', overflowY: 'auto', borderRadius: 16, padding: 24, textAlign: 'center' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 18, color: C.navy, margin: 0 }}>
            Mesa {mesa.numero}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 0, display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        {/* PIN */}
        <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>
          PIN DE ACCESO
        </p>
        <div style={{ background: '#f9fafb', borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 36, color: C.navy, letterSpacing: '0.2em' }}>
            {mesa.pin}
          </span>
        </div>

        {/* QR */}
        <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 10, fontWeight: 600, color: C.textSub, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>
          CÓDIGO QR
        </p>
        <img src={mesa.qrImage} width={160} height={160} alt={`QR Mesa ${mesa.numero}`} style={{ margin: '0 auto', display: 'block', borderRadius: 8 }} />

        {/* Botones */}
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={() => window.open(mesa.qrImage, '_blank')}
            style={{ width: '100%', borderRadius: 8, padding: 10, fontSize: 13, fontFamily: 'Inter,sans-serif', fontWeight: 600, border: `1px solid ${C.border}`, background: 'white', color: '#374151', cursor: 'pointer' }}
          >
            Imprimir QR
          </button>
          <button
            onClick={() => { void onRegenerar() }}
            disabled={ocupada || regenerando}
            title={ocupada ? 'No se puede regenerar con mesa ocupada' : undefined}
            style={{ width: '100%', borderRadius: 8, padding: 10, fontSize: 13, fontFamily: 'Inter,sans-serif', fontWeight: 600, border: `1px solid ${C.border}`, background: 'white', color: '#374151', cursor: ocupada || regenerando ? 'not-allowed' : 'pointer', opacity: ocupada || regenerando ? 0.4 : 1 }}
          >
            {regenerando ? 'Regenerando...' : 'Regenerar QR'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── MesaTile (Vista A) ─────────────────────────────────────────────────────────
function MesaTile({ mesa, sesion, onClick }: {
  mesa: MesaConQr; sesion: SesionActiva | undefined; onClick: () => void
}) {
  const ocupada = mesa.estado === 'ocupada'
  const tieneL  = !!sesion?.llamadoActivo
  const [hov, setHov] = useState(false)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background:    ocupada ? C.orangeBg : C.greenBg,
        borderRadius:  16,
        border:        `2px solid ${tieneL ? C.amber : ocupada ? C.orange : C.green}`,
        padding:       20,
        cursor:        'pointer',
        minHeight:     160,
        display:       'flex',
        flexDirection: 'column',
        transition:    'box-shadow 0.2s',
        boxShadow:     hov ? '0 4px 12px rgba(0,0,0,0.08)' : 'none',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 32, color: C.navy, lineHeight: 1 }}>
          {mesa.numero}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          {tieneL && (
            <span className="gmp-bell">
              <Bell size={16} color={C.amber} />
            </span>
          )}
          <span style={{
            background: ocupada ? C.orangeBadge : C.greenBadgeBg,
            color:      ocupada ? C.orange : C.green,
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
            padding: '3px 8px', borderRadius: 999, fontFamily: 'Inter,sans-serif',
          }}>
            {ocupada ? 'Ocupada' : 'Libre'}
          </span>
        </div>
      </div>

      {/* Body */}
      {!ocupada && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 13, color: C.textMuted, fontFamily: 'Inter,sans-serif' }}>Mesa disponible</span>
        </div>
      )}
      {ocupada && !sesion && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 13, color: C.textMuted, fontFamily: 'Inter,sans-serif' }}>Cargando...</span>
        </div>
      )}
      {ocupada && sesion && (
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
      )}

      {/* Llamado pill */}
      {tieneL && sesion?.llamadoActivo && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          background: C.amberBg, color: C.amber,
          borderRadius: 999, padding: '4px 10px',
          fontSize: 11, fontWeight: 700, fontFamily: 'Inter,sans-serif',
          marginTop: 10, alignSelf: 'flex-start',
        }}>
          <Bell size={11} />
          {sesion.llamadoActivo.motivo === 'general' ? 'Llamado al mozo' : sesion.llamadoActivo.motivo}
        </div>
      )}
    </div>
  )
}

// ── PedidoCard (Vista B) ───────────────────────────────────────────────────────
function PedidoCard({ pedido }: { pedido: SesionActiva['pedidos'][0] }) {
  const badge   = estadoBadge(pedido.estado)
  const shortId = pedido.id.slice(0, 4).toUpperCase()

  return (
    <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 14, color: C.navy }}>
          #{shortId}
        </span>
        <span style={{ background: badge.bg, color: badge.color, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 999, fontFamily: 'Inter,sans-serif' }}>
          {badge.label}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
        {pedido.items.map((item) => {
          const esQuitar = (t: string) => t === 'quitar' || t === 'QUITAR'
          return (
            <div key={item.id}>
              <span style={{ fontSize: 14, color: '#374151', fontFamily: 'Inter,sans-serif' }}>
                {item.cantidad}× {item.itemNombre}
              </span>
              {item.modificaciones.length > 0 && (
                <div style={{ paddingLeft: 12, marginTop: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {item.modificaciones.map((mod, i) => (
                    <span key={i} style={{ fontSize: 12, color: C.textMuted, fontStyle: 'italic', fontFamily: 'Inter,sans-serif' }}>
                      {esQuitar(mod.tipo) ? `sin ${mod.ingredienteNombre}` : `+ ${mod.ingredienteNombre}`}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p style={{ fontSize: 12, color: C.textMuted, fontFamily: 'Inter,sans-serif', margin: '8px 0 0' }}>
        {new Date(pedido.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
      </p>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export function GerenceMesasPage() {
  const navigate = useNavigate()
  const { selectedRestauranteId } = useContextStore()

  const [mesas,            setMesas]            = useState<MesaConQr[]>([])
  const [sesiones,         setSesiones]         = useState<Map<string, SesionActiva>>(new Map())
  const [loading,          setLoading]          = useState(false)
  const [error,            setError]            = useState<string | null>(null)
  const [mesaSeleccionada, setMesaSeleccionada] = useState<MesaConQr | null>(null)
  const [confirmCerrar,    setConfirmCerrar]    = useState(false)
  const [cerrando,         setCerrando]         = useState(false)
  const [notificacion,     setNotificacion]     = useState<Notificacion | null>(null)
  const [showQrPin,        setShowQrPin]        = useState(false)
  const [regenerandoQr,    setRegenerandoQr]    = useState(false)
  const [hovQrBtn,         setHovQrBtn]         = useState(false)
  const notifCounter = useRef(0)

  const mesasRef    = useRef<MesaConQr[]>([])
  const sesionesRef = useRef<Map<string, SesionActiva>>(new Map())
  useEffect(() => { mesasRef.current = mesas },       [mesas])
  useEffect(() => { sesionesRef.current = sesiones }, [sesiones])

  // Sync mesa seleccionada cuando cambia el estado de la mesa
  useEffect(() => {
    if (!mesaSeleccionada) return
    const updated = mesas.find((m) => m.id === mesaSeleccionada.id)
    if (!updated) { setMesaSeleccionada(null); return }
    if (updated !== mesaSeleccionada) setMesaSeleccionada(updated)
  }, [mesas, mesaSeleccionada])

  // Auto-dismiss notificación
  useEffect(() => {
    if (!notificacion) return
    const id = setTimeout(() => setNotificacion(null), 5000)
    return () => clearTimeout(id)
  }, [notificacion])

  const cargarSesiones = useCallback(async (ocupadas: MesaConQr[]) => {
    if (ocupadas.length === 0) return
    const results = await Promise.allSettled(ocupadas.map((m) => api.sessions.mesaActiva(m.id)))
    setSesiones((prev) => {
      const next = new Map(prev)
      ocupadas.forEach((m, i) => {
        const r = results[i]
        if (r.status === 'fulfilled' && r.value)  next.set(m.id, r.value)
        else if (r.status === 'fulfilled')         next.delete(m.id)
      })
      return next
    })
  }, [])

  const cargarMesas = useCallback(async () => {
    if (!selectedRestauranteId) return
    setLoading(true); setError(null)
    try {
      const data = await api.mesas.list(selectedRestauranteId)
      setMesas(data)
      mesasRef.current = data
      await cargarSesiones(data.filter((m) => m.estado === 'ocupada'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar mesas')
    } finally {
      setLoading(false)
    }
  }, [selectedRestauranteId, cargarSesiones])

  useEffect(() => {
    setSesiones(new Map())
    setMesaSeleccionada(null)
    void cargarMesas()
  }, [cargarMesas])

  // Polling 30 s
  useEffect(() => {
    if (!selectedRestauranteId) return
    const id = setInterval(() => {
      const ocupadas = mesasRef.current.filter((m) => m.estado === 'ocupada')
      if (ocupadas.length > 0) void cargarSesiones(ocupadas)
    }, 30_000)
    return () => clearInterval(id)
  }, [selectedRestauranteId, cargarSesiones])

  // WebSocket
  useEffect(() => {
    if (!selectedRestauranteId) return
    const socket: Socket = io(`${WS_URL}/ws`, {
      auth:       { token: localStorage.getItem(TOKEN_KEY) },
      transports: ['websocket'],
    })
    socket.on('connect', () => {
      socket.emit('cocina:join', { restauranteId: selectedRestauranteId })
    })
    socket.on('waiter:called', (data: { llamadoId: string; sesionId: string; mesaNumero: string; motivo: string }) => {
      setSesiones((prev) => {
        const next = new Map(prev)
        for (const [mesaId, sesion] of next) {
          if (sesion.sesionId === data.sesionId) {
            next.set(mesaId, { ...sesion, llamadoActivo: { id: data.llamadoId, motivo: data.motivo } })
            break
          }
        }
        return next
      })
      notifCounter.current += 1
      setNotificacion({ id: notifCounter.current, mesaNumero: data.mesaNumero, motivo: data.motivo })
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
    }
    socket.on('sesion:cerrada', onSesionCerrada)
    socket.on('session:closed', onSesionCerrada)
    return () => { socket.disconnect() }
  }, [selectedRestauranteId])

  const handleCerrarSesion = async () => {
    if (!mesaSeleccionada) return
    setCerrando(true)
    try {
      await api.sessions.cerrarMesa(mesaSeleccionada.id)
      setMesas((prev) => prev.map((m) => m.id === mesaSeleccionada.id ? { ...m, estado: 'libre' } : m))
      setSesiones((prev) => { const next = new Map(prev); next.delete(mesaSeleccionada.id); return next })
      setMesaSeleccionada(null)
    } finally {
      setCerrando(false)
      setConfirmCerrar(false)
    }
  }

  const handleRegenerarQr = async () => {
    if (!mesaSeleccionada) return
    setRegenerandoQr(true)
    try {
      const updated = await api.mesas.regenerarQr(mesaSeleccionada.id)
      setMesas((prev) => prev.map((m) => m.id === updated.id ? updated : m))
      setMesaSeleccionada(updated)
    } finally {
      setRegenerandoQr(false)
    }
  }

  const totalOcupadas  = useMemo(() => mesas.filter((m) => m.estado === 'ocupada').length, [mesas])
  const totalLlamados  = useMemo(() => [...sesiones.values()].filter((s) => s.llamadoActivo).length, [sesiones])
  const totalAcumulado = useMemo(() => [...sesiones.values()].reduce((a, s) => a + s.totalAcumulado, 0), [sesiones])

  if (!selectedRestauranteId) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        Seleccioná un restaurante para ver las mesas
      </div>
    )
  }

  // ── Vista B ──────────────────────────────────────────────────────────────────
  if (mesaSeleccionada) {
    const ocupada = mesaSeleccionada.estado === 'ocupada'
    const sesion  = sesiones.get(mesaSeleccionada.id)
    const tieneL  = !!sesion?.llamadoActivo

    const btnDisabled: React.CSSProperties = {
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      border: `1px solid ${C.border}`, background: 'white', color: C.textMuted,
      borderRadius: 10, padding: 12, fontSize: 13, fontWeight: 600,
      fontFamily: 'Inter,sans-serif', cursor: 'not-allowed', opacity: 0.6,
    }

    return (
      <>
        <div className="px-6 py-6" style={{ paddingBottom: 0 }}>
          {/* Header Vista B */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, borderBottom: `1px solid ${C.border}`, paddingBottom: 24, marginBottom: 24 }}>

            {/* Elemento 1: número de mesa */}
            <div>
              <button
                onClick={() => { setMesaSeleccionada(null); setShowQrPin(false) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, fontSize: 12, fontFamily: 'Inter,sans-serif', padding: 0, display: 'block', marginBottom: 6 }}
              >
                ← Volver
              </button>
              <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 80, color: C.navy, lineHeight: 1 }}>
                {mesaSeleccionada.numero}
              </span>
            </div>

            {/* Elemento 2: métricas */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12, flex: 1 }}>
              <div style={{ display: 'flex', gap: 32 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Clock size={16} color={C.textMuted} />
                  <span style={{ fontSize: 16, fontWeight: 600, color: '#374151', fontFamily: 'Inter,sans-serif' }}>
                    {sesion ? tiempoTranscurrido(sesion.creadaEn) : '—'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ClipboardList size={16} color={C.textMuted} />
                  <span style={{ fontSize: 16, fontWeight: 600, color: '#374151', fontFamily: 'Inter,sans-serif' }}>
                    {sesion ? `${sesion.pedidos.length} pedido${sesion.pedidos.length === 1 ? '' : 's'}` : '—'}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 32 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <DollarSign size={16} color={C.textMuted} />
                  <span style={{ fontSize: 16, fontWeight: 600, color: '#374151', fontFamily: 'Inter,sans-serif' }}>
                    {sesion ? `$${sesion.totalAcumulado.toLocaleString('es-AR')}` : '—'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Users size={16} color={C.textMuted} />
                  <span style={{ fontSize: 16, fontWeight: 600, color: '#374151', fontFamily: 'Inter,sans-serif' }}>
                    {sesion ? `${sesion.cantidadClientes} comensal${sesion.cantidadClientes === 1 ? '' : 'es'}` : '—'}
                  </span>
                </div>
              </div>
            </div>

            {/* Botón QR y PIN */}
            <button
              onClick={() => setShowQrPin(true)}
              onMouseEnter={() => setHovQrBtn(true)}
              onMouseLeave={() => setHovQrBtn(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                border: `1px solid ${hovQrBtn ? C.navy : C.border}`,
                background: 'white',
                color: hovQrBtn ? C.navy : C.textSub,
                fontSize: 12, padding: '4px 12px', borderRadius: 6,
                cursor: 'pointer', fontFamily: 'Inter,sans-serif', fontWeight: 500,
                alignSelf: 'flex-start', transition: 'border-color 0.15s, color 0.15s',
              }}
            >
              <QrCode size={14} />
              QR y PIN
            </button>

            {/* Elemento 3: badge estado + pill llamado */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, alignSelf: 'flex-start' }}>
              <span style={{
                background: ocupada ? C.orangeBadge : C.greenBadgeBg,
                color:      ocupada ? C.orange : C.green,
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                padding: '4px 10px', borderRadius: 999, fontFamily: 'Inter,sans-serif',
              }}>
                {ocupada ? 'Ocupada' : 'Libre'}
              </span>
              {tieneL && sesion?.llamadoActivo && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: C.amberBg, color: C.amber, borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 700, fontFamily: 'Inter,sans-serif' }}>
                  <span className="gmp-bell"><Bell size={12} /></span>
                  {sesion.llamadoActivo.motivo === 'general' ? 'Llamado al mozo' : sesion.llamadoActivo.motivo}
                </div>
              )}
            </div>
          </div>

          {/* Pedidos */}
          <p style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 16, color: C.navy, margin: '24px 0 0' }}>
            Pedidos de la sesión
          </p>

          {!ocupada && (
            <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.textMuted, textAlign: 'center', padding: '32px 0' }}>
              Mesa disponible
            </p>
          )}
          {ocupada && !sesion && (
            <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.textMuted, textAlign: 'center', padding: '32px 0' }}>
              Cargando sesión...
            </p>
          )}
          {sesion && sesion.pedidos.length === 0 && (
            <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.textMuted, textAlign: 'center', padding: '32px 0' }}>
              Sin pedidos aún.
            </p>
          )}
          {sesion && sesion.pedidos.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12, paddingBottom: 130 }}>
              {sesion.pedidos.map((p) => <PedidoCard key={p.id} pedido={p} />)}
            </div>
          )}
        </div>

        {/* Botones de acción — sticky bottom */}
        <div style={{
          position: 'sticky', bottom: 0,
          background: 'white', borderTop: `1px solid ${C.border}`,
          padding: '16px 24px',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
        }}>
          {/* Ver pedidos */}
          <button
            onClick={() => { if (ocupada) navigate('/admin/pedidos') }}
            disabled={!ocupada}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              border: `1px solid ${ocupada ? C.navy : C.border}`,
              background: 'white',
              color: ocupada ? C.navy : C.textMuted,
              borderRadius: 10, padding: 12, fontSize: 13, fontWeight: 600,
              fontFamily: 'Inter,sans-serif',
              cursor: ocupada ? 'pointer' : 'not-allowed',
              opacity: ocupada ? 1 : 0.5,
            }}
          >
            <ClipboardList size={18} />
            Ver pedidos
          </button>

          {/* Imprimir comanda */}
          <button disabled style={btnDisabled}>
            <Printer size={18} />
            Imprimir comanda
          </button>

          {/* Cobrar mesa */}
          <button disabled style={btnDisabled}>
            <CreditCard size={18} />
            Cobrar mesa
          </button>

          {/* Cerrar sesión */}
          <button
            onClick={() => { if (ocupada) setConfirmCerrar(true) }}
            disabled={!ocupada}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              border: 'none',
              background: ocupada ? C.orange : '#d1d5db',
              color: 'white',
              borderRadius: 10, padding: 12, fontSize: 13, fontWeight: 700,
              fontFamily: 'Montserrat,sans-serif',
              cursor: ocupada ? 'pointer' : 'not-allowed',
              opacity: ocupada ? 1 : 0.6,
            }}
          >
            <DoorOpen size={18} />
            Cerrar sesión
          </button>
        </div>

        {showQrPin && (
          <ModalQrPin
            mesa={mesaSeleccionada}
            onClose={() => setShowQrPin(false)}
            onRegenerar={handleRegenerarQr}
            regenerando={regenerandoQr}
          />
        )}

        {confirmCerrar && (
          <ModalConfirmar
            title={`¿Cerrar sesión de mesa ${mesaSeleccionada.numero}?`}
            text="Se cerrará la sesión activa y la mesa quedará disponible."
            confirmLabel="Sí, cerrar"
            confirmColor={C.orange}
            loading={cerrando}
            onConfirm={() => { void handleCerrarSesion() }}
            onCancel={() => setConfirmCerrar(false)}
          />
        )}

        {notificacion && <NotificacionCard notif={notificacion} onClose={() => setNotificacion(null)} />}
      </>
    )
  }

  // ── Vista A ──────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="px-6 py-6">
        {/* Topbar */}
        <h2 style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 22, color: C.navy, margin: 0, lineHeight: 1.2 }}>
          Mesas
        </h2>
        <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.textMuted, margin: '4px 0 0' }}>
          {mesas.length} mesas · {totalOcupadas} ocupadas
        </p>

        {/* KPIs Vista A */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginTop: 16 }}>
          {[
            { label: 'Total mesas',      value: String(mesas.length) },
            { label: 'Ocupadas',         value: String(totalOcupadas) },
            { label: 'Llamados activos', value: String(totalLlamados) },
            { label: 'Acumulado total',  value: `$${totalAcumulado.toLocaleString('es-AR')}` },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 20px' }}>
              <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>
                {label}
              </p>
              <p style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 24, color: C.navy, margin: 0 }}>
                {value}
              </p>
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.red, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginTop: 16 }}>
            {error}
          </p>
        )}

        {/* Grid de tiles */}
        {loading ? (
          <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.textMuted, textAlign: 'center', marginTop: 48 }}>
            Cargando mesas...
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginTop: 24 }}>
            {mesas.map((mesa) => (
              <MesaTile
                key={mesa.id}
                mesa={mesa}
                sesion={sesiones.get(mesa.id)}
                onClick={() => setMesaSeleccionada(mesa)}
              />
            ))}
            {mesas.length === 0 && (
              <div style={{ gridColumn: '1/-1', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 192 }}>
                <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 14, color: C.textMuted }}>
                  Sin mesas asignadas a este restaurante.
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {notificacion && <NotificacionCard notif={notificacion} onClose={() => setNotificacion(null)} />}
    </>
  )
}
