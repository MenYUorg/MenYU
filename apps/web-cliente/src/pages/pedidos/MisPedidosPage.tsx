import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { EncabezadoPantalla, MarcoPantalla } from '../../components/PantallaComensal'
import { estadoCargando, estadoError, estadoVacio } from '../../components/estadosPantalla'
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

  const marco = (contenido: ReactNode) => (
    <MarcoPantalla
      ancho={480}
      encabezado={<EncabezadoPantalla titulo="Mis pedidos" onVolver={() => navigate('/menu')} etiquetaVolver="Volver al menú" />}
    >
      {contenido}
    </MarcoPantalla>
  )

  if (loading) return marco(estadoCargando())

  if (error) return marco(estadoError(error, () => window.location.reload()))

  if (ordenados.length === 0) {
    return marco(estadoVacio({
      emoji:         '📋',
      texto:         'Todavía no hiciste ningún pedido',
      accion:        { texto: 'Ver el menú', onClick: () => navigate('/menu') },
      separarAccion: true,
    }))
  }

  /* ── lista ── */
  return marco(
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
    </div>,
  )
}
