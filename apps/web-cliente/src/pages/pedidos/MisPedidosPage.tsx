import { useNavigate } from 'react-router-dom'
import { Spinner } from '@menyu/ui'
import { usePedidosCliente } from '../../hooks/usePedidosCliente'
import type { PedidoCliente } from '../../hooks/usePedidosCliente'

const C = {
  orange:     '#E8563A',
  navy:       '#2D3561',
  orangeSoft: '#FDE5DF',
  bg:         '#F7F7F8',
  text:       '#1A1A2E',
  gray:       '#9CA3AF',
  border:     '#E5E7EB',
}

const BADGE: Record<PedidoCliente['estado'], { label: string; bg: string; color: string }> = {
  pendiente:      { label: 'Enviado',            bg: '#F3F4F6', color: '#6B7280' },
  en_preparacion: { label: 'En preparación',     bg: '#FDE5DF', color: C.orange  },
  listo:          { label: 'En preparación',     bg: '#FDE5DF', color: C.orange  },
  entregado:      { label: 'Entregado',          bg: '#EFF6FF', color: '#2563EB' },
  anulado:        { label: 'Anulado',            bg: '#FEF2F2', color: '#DC2626' },
}

const PROGRESS: Record<PedidoCliente['estado'], number | null> = {
  pendiente:      25,
  en_preparacion: 60,
  listo:          100,
  entregado:      null,
  anulado:        null,
}

const PROGRESS_COLOR: Record<PedidoCliente['estado'], string> = {
  pendiente:      C.orange,
  en_preparacion: C.orange,
  listo:          C.orange,
  entregado:      'transparent',
  anulado:        'transparent',
}

function PedidoCard({ pedido }: { pedido: PedidoCliente }) {
  const badge    = BADGE[pedido.estado]
  const progress = PROGRESS[pedido.estado]
  const progColor = PROGRESS_COLOR[pedido.estado]

  const hora = new Date(pedido.createdAt).toLocaleTimeString('es-AR', {
    hour:   '2-digit',
    minute: '2-digit',
  })

  const resumen = pedido.items
    .map((i) => `${i.cantidad}× ${i.item.nombre}`)
    .join(' · ')

  return (
    <div style={{
      background:   'white',
      border:       `1px solid ${C.border}`,
      borderRadius: 12,
      padding:      16,
    }}>
      {/* Fila superior: id + badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{
          fontFamily: 'Montserrat, sans-serif',
          fontWeight: 700,
          fontSize:   13,
          color:      C.text,
        }}>
          #{pedido.id.slice(0, 6).toUpperCase()}
        </span>
        <span style={{
          background:   badge.bg,
          color:        badge.color,
          fontFamily:   'Inter, sans-serif',
          fontWeight:   600,
          fontSize:     11,
          padding:      '3px 10px',
          borderRadius: 20,
        }}>
          {badge.label}
        </span>
      </div>

      {/* Hora de envío */}
      <p style={{
        fontFamily: 'Inter, sans-serif',
        fontSize:   12,
        color:      C.gray,
        margin:     '0 0 6px',
      }}>
        Enviado a las {hora}
      </p>

      {/* Ítems resumidos */}
      <p style={{
        fontFamily:   'Inter, sans-serif',
        fontSize:     12,
        color:        C.gray,
        margin:       '0 0 10px',
        overflow:     'hidden',
        textOverflow: 'ellipsis',
        whiteSpace:   'nowrap',
      }}>
        {resumen}
      </p>

      {/* Barra de progreso */}
      {progress !== null && (
        <div style={{
          height:       4,
          background:   '#F3F4F6',
          borderRadius: 999,
          overflow:     'hidden',
        }}>
          <div style={{
            height:       '100%',
            width:        `${progress}%`,
            background:   progColor,
            borderRadius: 999,
            transition:   'width 0.4s ease',
          }} />
        </div>
      )}
    </div>
  )
}

export function MisPedidosPage() {
  const navigate                  = useNavigate()
  const { pedidos, loading, error } = usePedidosCliente()

  // más reciente primero
  const ordenados = [...pedidos].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )

  const header = (
    <header style={{
      background:  C.navy,
      display:     'flex',
      alignItems:  'center',
      padding:     '14px 16px',
      gap:         12,
      flexShrink:  0,
    }}>
      <button
        onClick={() => navigate('/menu')}
        style={{
          background: 'none',
          border:     'none',
          cursor:     'pointer',
          color:      'white',
          fontSize:   22,
          lineHeight: 1,
          padding:    '2px 8px 2px 0',
          display:    'flex',
          alignItems: 'center',
        }}
        aria-label="Volver al menú"
      >
        ←
      </button>
      <span style={{
        flex:       1,
        fontFamily: 'Montserrat, sans-serif',
        fontWeight: 700,
        fontSize:   17,
        color:      'white',
        textAlign:  'center',
      }}>
        Mis pedidos
      </span>
      {/* spacer para centrar el título */}
      <div style={{ width: 38 }} />
    </header>
  )

  /* ── loading ── */
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: C.bg }}>
        <div style={{ maxWidth: 480, width: '100%', margin: '0 auto', background: 'white', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
          {header}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spinner size="md" />
          </div>
        </div>
      </div>
    )
  }

  /* ── error ── */
  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: C.bg }}>
        <div style={{ maxWidth: 480, width: '100%', margin: '0 auto', background: 'white', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
          {header}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center' }}>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, color: '#DC2626', margin: 0 }}>{error}</p>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: C.orange, color: 'white', border: 'none',
                borderRadius: 10, padding: '10px 20px',
                fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Reintentar
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ── sin pedidos ── */
  if (ordenados.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: C.bg }}>
        <div style={{ maxWidth: 480, width: '100%', margin: '0 auto', background: 'white', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
          {header}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center' }}>
            <p style={{ fontSize: 52, margin: 0 }}>📋</p>
            <p style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 15, color: C.text, margin: 0 }}>
              Todavía no hiciste ningún pedido
            </p>
            <button
              onClick={() => navigate('/menu')}
              style={{
                background: C.orange, color: 'white', border: 'none',
                borderRadius: 12, padding: '12px 24px',
                fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 14,
                cursor: 'pointer', marginTop: 8,
              }}
            >
              Ver el menú
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ── lista ── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: C.bg }}>
      <div style={{
        maxWidth:      480,
        width:         '100%',
        margin:        '0 auto',
        background:    'white',
        minHeight:     '100vh',
        display:       'flex',
        flexDirection: 'column',
      }}>
        {header}
        <div style={{
          flex:      1,
          overflowY: 'auto',
          padding:   '12px 16px 24px',
          display:   'flex',
          flexDirection: 'column',
          gap:       10,
        }}>
          {ordenados.map((pedido) => (
            <PedidoCard key={pedido.id} pedido={pedido} />
          ))}
        </div>
      </div>
    </div>
  )
}
