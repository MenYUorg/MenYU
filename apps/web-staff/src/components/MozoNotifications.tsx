import { useEffect, useRef } from 'react'
import { Bell, CheckCircle2, ChefHat, Receipt, X } from 'lucide-react'
import { useMozoStore } from '../store/mozoStore'
import { useNotifStore } from '../store/notificationStore'
import type { Notif, NotifTipo } from '../store/notificationStore'
import * as socketService from '../services/socket'
import type { Pedido } from '@menyu/types'

// ── Config visual por tipo ────────────────────────────────────────────────────
const TIPO_CONFIG: Record<NotifTipo, {
  icon: React.ReactNode
  color: string
  bg: string
  border: string
}> = {
  llamado: {
    icon: <Bell size={18} />,
    color: '#d97706',
    bg:    '#fef3c7',
    border:'#fcd34d',
  },
  cuenta: {
    icon: <Receipt size={18} />,
    color: '#E8563A',
    bg:    '#FDE5DF',
    border:'#fca5a5',
  },
  pedido_nuevo: {
    icon: <ChefHat size={18} />,
    color: '#2563eb',
    bg:    '#dbeafe',
    border:'#93c5fd',
  },
  pedido_listo: {
    icon: <CheckCircle2 size={18} />,
    color: '#16a34a',
    bg:    '#dcfce7',
    border:'#86efac',
  },
}

// ── NotifCard ─────────────────────────────────────────────────────────────────
function NotifCard({ notif }: { notif: Notif }) {
  const remove = useNotifStore((s) => s.remove)
  const cfg    = TIPO_CONFIG[notif.tipo]

  useEffect(() => {
    const t = setTimeout(() => remove(notif.id), 6000)
    return () => clearTimeout(t)
  }, [notif.id, remove])

  return (
    <div
      style={{
        display:      'flex',
        alignItems:   'flex-start',
        gap:          10,
        background:   cfg.bg,
        border:       `1px solid ${cfg.border}`,
        borderLeft:   `4px solid ${cfg.color}`,
        borderRadius: 10,
        padding:      '12px 14px',
        boxShadow:    '0 4px 12px rgba(0,0,0,0.12)',
        minWidth:     260,
        maxWidth:     320,
        animation:    'notifSlideIn 0.2s ease-out',
      }}
    >
      {/* Ícono */}
      <div style={{ color: cfg.color, flexShrink: 0, marginTop: 1 }}>
        {cfg.icon}
      </div>

      {/* Texto */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontFamily: 'Montserrat,sans-serif',
          fontWeight: 700,
          fontSize:   13,
          color:      '#1f2937',
          margin:     0,
        }}>
          {notif.titulo}
        </p>
        <p style={{
          fontFamily: 'Inter,sans-serif',
          fontSize:   12,
          color:      '#6b7280',
          margin:     '2px 0 0',
        }}>
          {notif.subtitulo}
        </p>
      </div>

      {/* Cerrar */}
      <button
        onClick={() => remove(notif.id)}
        style={{
          background: 'none',
          border:     'none',
          cursor:     'pointer',
          color:      '#9ca3af',
          padding:    0,
          display:    'flex',
          flexShrink: 0,
          marginTop:  1,
        }}
      >
        <X size={14} />
      </button>
    </div>
  )
}

// ── MozoNotifications ─────────────────────────────────────────────────────────
export function MozoNotifications() {
  const { restauranteId } = useMozoStore()
  const add               = useNotifStore((s) => s.add)
  const notifications     = useNotifStore((s) => s.notifications)
  const joinedRef         = useRef(false)

  useEffect(() => {
    if (!restauranteId || joinedRef.current) return
    joinedRef.current = true

    socketService.joinRestauranteComoMozo(restauranteId)

    const unsubLlamado = socketService.onMozoCalled(
      (data: { llamadoId: string; sesionId: string; mesaNumero: string; motivo: string }) => {
        if (data.motivo === 'pedir_cuenta') {
          add({
            tipo:      'cuenta',
            titulo:    'Pedir la cuenta',
            subtitulo: `Mesa ${data.mesaNumero}`,
          })
        } else {
          add({
            tipo:      'llamado',
            titulo:    'Llamado al mozo',
            subtitulo: `Mesa ${data.mesaNumero}`,
          })
        }
      },
    )

    const unsubNuevo = socketService.onPedidoNuevo((pedido: Pedido) => {
      const rico = pedido as Pedido & { mesa?: { numero: string }; items?: { cantidad: number }[] }
      const mesa  = rico.mesa?.numero ? `Mesa ${rico.mesa.numero}` : 'Mesa desconocida'
      const total = rico.items?.reduce((s, i) => s + i.cantidad, 0) ?? 0
      add({
        tipo:      'pedido_nuevo',
        titulo:    'Nuevo pedido',
        subtitulo: `${mesa} · ${total} ítem${total !== 1 ? 's' : ''}`,
      })
    })

    const unsubActualizado = socketService.onPedidoActualizado((pedido: Pedido) => {
      if (pedido.estado !== 'listo') return
      const rico = pedido as Pedido & { mesa?: { numero: string } }
      const mesa  = rico.mesa?.numero ? `Mesa ${rico.mesa.numero}` : 'Mesa desconocida'
      add({
        tipo:      'pedido_listo',
        titulo:    'Pedido listo',
        subtitulo: `${mesa} · listo para entregar`,
      })
    })

    return () => {
      unsubLlamado()
      unsubNuevo()
      unsubActualizado()
      joinedRef.current = false
    }
  }, [restauranteId, add])

  if (notifications.length === 0) return null

  return (
    <>
      {/* Animación de entrada */}
      <style>{`
        @keyframes notifSlideIn {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      {/* Stack de toasts */}
      <div
        style={{
          position:      'fixed',
          top:           16,
          right:         16,
          zIndex:        9999,
          display:       'flex',
          flexDirection: 'column',
          gap:           8,
          pointerEvents: 'none',
        }}
      >
        {notifications.map((n) => (
          <div key={n.id} style={{ pointerEvents: 'auto' }}>
            <NotifCard notif={n} />
          </div>
        ))}
      </div>
    </>
  )
}
