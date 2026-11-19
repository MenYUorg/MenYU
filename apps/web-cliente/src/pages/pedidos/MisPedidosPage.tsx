import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { EncabezadoPantalla, MarcoPantalla } from '../../components/PantallaComensal'
import { estadoCargando, estadoError, estadoVacio } from '../../components/estadosPantalla'
import { usePedidosCliente } from '../../hooks/usePedidosCliente'
import type { PedidoCliente } from '../../hooks/usePedidosCliente'
import { C as TEMA } from '../../theme'
import { TEXTO_DEL_ESTADO } from '../../utils/estadoDelPedido'

const C = {
  orange:     TEMA.orange,
  navy:       TEMA.navy,
  orangeSoft: TEMA.orangeSoft,
  bg:         TEMA.bg,
  text:       TEMA.text,
  gray:       TEMA.gray,
  border:     TEMA.border,
}

// El estado se distingue por el texto, no por el color: todos los distintivos son iguales (decisión 2 del plan de accesibilidad).
const BADGE_FONDO = TEMA.orangeSoft
const BADGE_TEXTO = TEMA.orangeText

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
          {/* El lector dice "Pedido ABC123" y no "numeral…": el "#" es solo para la vista. */}
          <span className="sr-only">Pedido </span>
          <span aria-hidden="true">#</span>
          {pedido.id.slice(0, 6).toUpperCase()}
        </span>
        <span style={{
          background:   BADGE_FONDO,
          color:        BADGE_TEXTO,
          fontFamily:   'Inter, sans-serif',
          fontWeight:   600,
          fontSize:     11,
          padding:      '3px 10px',
          borderRadius: 20,
        }}>
          {TEXTO_DEL_ESTADO[pedido.estado]}
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

      {/* Barra de progreso: decorativa, el estado ya lo dice el distintivo de arriba. */}
      {progress !== null && (
        <div aria-hidden="true" style={{
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
