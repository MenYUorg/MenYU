import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { Spinner } from '@menyu/ui'
import { useEtiquetado } from '../../hooks/useEtiquetado'
import type { Comensal, ItemEtiquetado } from '../../hooks/useEtiquetado'
import { useSessionStore } from '../../store/sessionStore'

const C = {
  orange:     '#E8563A',
  navy:       '#2D3561',
  orangeSoft: '#FDE5DF',
  bg:         '#F7F7F8',
  text:       '#1A1A2E',
  gray:       '#9CA3AF',
  border:     '#E5E7EB',
}

function chipKey(pedidoItemId: string, comensalId: string) {
  return `${pedidoItemId}:${comensalId}`
}

function ItemCard({
  item,
  comensales,
  enProceso,
  onToggle,
}: {
  item: ItemEtiquetado
  comensales: Comensal[]
  enProceso: Set<string>
  onToggle: (comensal: Comensal) => void
}) {
  const etiquetadosIds = new Set(item.etiquetas.map((c) => c.id))

  return (
    <div style={{
      background:   'white',
      border:       `1px solid ${C.border}`,
      borderRadius: 12,
      padding:      16,
    }}>
      {/* Fila superior: nombre × cantidad + precio */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{
          fontFamily: 'Montserrat, sans-serif',
          fontWeight: 700,
          fontSize:   13,
          color:      C.text,
        }}>
          {item.nombre} ×{item.cantidad}
        </span>
        <span style={{
          fontFamily: 'Montserrat, sans-serif',
          fontWeight: 700,
          fontSize:   13,
          color:      C.text,
        }}>
          ${(item.precioUnitario * item.cantidad).toFixed(2)}
        </span>
      </div>

      {/* Chips de comensales */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {comensales.map((comensal) => {
          const activo   = etiquetadosIds.has(comensal.id)
          const cargando = enProceso.has(chipKey(item.pedidoItemId, comensal.id))
          return (
            <button
              key={comensal.id}
              onClick={() => onToggle(comensal)}
              disabled={cargando}
              style={{
                display:      'inline-flex',
                alignItems:   'center',
                padding:      '6px 12px',
                borderRadius: 999,
                border:       `1.5px solid ${activo ? C.orange : C.border}`,
                background:   activo ? C.orangeSoft : 'white',
                color:        activo ? C.orange : C.text,
                fontFamily:   'Inter, sans-serif',
                fontWeight:   600,
                fontSize:     12,
                cursor:       cargando ? 'default' : 'pointer',
                opacity:      cargando ? 0.5 : 1,
                transition:   'all .12s',
              }}
            >
              {cargando ? '…' : comensal.nombre}
            </button>
          )
        })}
      </div>

      {/* Notita de estado */}
      {item.etiquetas.length === 0 ? (
        <p style={{
          fontFamily: 'Inter, sans-serif',
          fontSize:   11,
          color:      C.gray,
          margin:     '8px 0 0',
        }}>
          Sin etiquetar todavía
        </p>
      ) : item.etiquetas.length >= 2 ? (
        <p style={{
          fontFamily: 'Inter, sans-serif',
          fontSize:   11,
          color:      C.gray,
          margin:     '8px 0 0',
        }}>
          Se divide en partes iguales entre los {item.etiquetas.length} etiquetados
        </p>
      ) : null}
    </div>
  )
}

export function EtiquetarPedidosPage() {
  const navigate = useNavigate()
  const sesionId = useSessionStore((s) => s.sesionId)

  const { items, comensales, loading, error, etiquetar, desetiquetar } = useEtiquetado(sesionId ?? '')
  const [enProceso, setEnProceso] = useState<Set<string>>(new Set())

  async function handleToggle(item: ItemEtiquetado, comensal: Comensal) {
    const key = chipKey(item.pedidoItemId, comensal.id)
    if (enProceso.has(key)) return

    setEnProceso((prev) => new Set(prev).add(key))
    try {
      const yaEtiquetado = item.etiquetas.some((c) => c.id === comensal.id)
      if (yaEtiquetado) {
        await desetiquetar(item.pedidoItemId, comensal.id)
      } else {
        await etiquetar(item.pedidoItemId, comensal.id)
      }
    } finally {
      setEnProceso((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }

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
        Etiquetar pedidos
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

  /* ── sin ítems ── */
  if (items.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: C.bg }}>
        <div style={{ maxWidth: 480, width: '100%', margin: '0 auto', background: 'white', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
          {header}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center' }}>
            <p style={{ fontSize: 52, margin: 0 }}>🏷️</p>
            <p style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 15, color: C.text, margin: 0 }}>
              Todavía no hay pedidos para etiquetar
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
          <p style={{
            fontFamily: 'Inter, sans-serif',
            fontSize:   13,
            color:      C.gray,
            margin:     '0 0 4px',
            lineHeight: 1.4,
          }}>
            Etiquetá qué pediste vos para calcular tu parte de la cuenta.
          </p>
          {items.map((item) => (
            <ItemCard
              key={item.pedidoItemId}
              item={item}
              comensales={comensales}
              enProceso={enProceso}
              onToggle={(comensal) => void handleToggle(item, comensal)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
