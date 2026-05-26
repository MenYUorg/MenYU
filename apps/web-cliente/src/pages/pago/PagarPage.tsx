import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Spinner } from '@menyu/ui'
import { useSessionStore } from '../../store/sessionStore'
import { api } from '../../services/api'

const C = {
  orange:     '#E8563A',
  navy:       '#2D3561',
  orangeSoft: '#FDE5DF',
  bg:         '#F7F7F8',
  text:       '#1A1A2E',
  gray:       '#9CA3AF',
  border:     '#E5E7EB',
}

interface PedidoSesion {
  id: string
  items: Array<{
    id: string
    cantidad: number
    precioUnitario: number
    item: { nombre: string }
  }>
}

type MozoEstado = 'idle' | 'loading' | 'ok' | 'error'

export function PagarPage() {
  const navigate    = useNavigate()
  const jwt         = useSessionStore((s) => s.jwt)
  const sesionId    = useSessionStore((s) => s.sesionId)

  const [pedidos,      setPedidos]      = useState<PedidoSesion[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [llamandoMozo, setLlamandoMozo] = useState<MozoEstado>('idle')

  function cargar() {
    if (!jwt) { setLoading(false); setError('No hay sesión activa'); return }
    setLoading(true)
    setError(null)
    api.orders
      .list(jwt)
      .then((data) => { setPedidos(data as PedidoSesion[]); setLoading(false) })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Error al cargar la cuenta')
        setLoading(false)
      })
  }

  useEffect(() => { cargar() }, [jwt]) // eslint-disable-line react-hooks/exhaustive-deps

  async function llamarMozo() {
    if (!sesionId || !jwt) return
    setLlamandoMozo('loading')
    try {
      await api.waiterCalls.llamar(sesionId, jwt)
      setLlamandoMozo('ok')
    } catch {
      setLlamandoMozo('error')
    } finally {
      setTimeout(() => setLlamandoMozo('idle'), 3000)
    }
  }

  const total = pedidos
    .flatMap((p) => p.items)
    .reduce((acc, i) => acc + Number(i.precioUnitario) * i.cantidad, 0)

  const itemsAgrupados = Object.values(
    pedidos.flatMap((p) => p.items).reduce<Record<string, { nombre: string; precioUnitario: number; cantidad: number }>>(
      (acc, i) => {
        const key = i.item.nombre
        if (!acc[key]) acc[key] = { nombre: key, precioUnitario: Number(i.precioUnitario), cantidad: 0 }
        acc[key].cantidad += i.cantidad
        return acc
      },
      {},
    ),
  )

  const mozoLabel: Record<MozoEstado, string> = {
    idle:    'Llamar al mozo para pagar',
    loading: 'Llamando…',
    ok:      '✓ Mozo en camino',
    error:   'Error, intentá de nuevo',
  }
  const mozoBg: Record<MozoEstado, string> = {
    idle:    C.navy,
    loading: C.navy,
    ok:      '#10B981',
    error:   '#EF4444',
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
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'white', fontSize: 22, lineHeight: 1,
          padding: '2px 8px 2px 0', display: 'flex', alignItems: 'center',
        }}
        aria-label="Volver al menú"
      >
        ←
      </button>
      <span style={{
        flex: 1, fontFamily: 'Montserrat, sans-serif',
        fontWeight: 700, fontSize: 17, color: 'white', textAlign: 'center',
      }}>
        Pagar la cuenta
      </span>
      <span style={{
        background: C.orange, color: 'white',
        fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: 12,
        padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap',
      }}>
        Mesa
      </span>
    </header>
  )

  const bottomPanel = (
    <div style={{
      position:   'fixed',
      bottom:     0,
      left:       '50%',
      transform:  'translateX(-50%)',
      width:      '100%',
      maxWidth:   520,
      background: 'white',
      borderTop:  `1px solid ${C.border}`,
      padding:    '14px 16px 24px',
      boxShadow:  '0 -4px 20px rgba(0,0,0,0.08)',
      display:    'flex',
      flexDirection: 'column',
      gap:        10,
    }}>
      {/* Mercado Pago — próximamente */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        background:     '#F3F4F6',
        borderRadius:   14,
        padding:        '14px 16px',
        cursor:         'not-allowed',
      }}>
        <span style={{
          fontFamily: 'Montserrat, sans-serif',
          fontWeight: 700, fontSize: 15,
          color: C.gray,
        }}>
          Pagar con Mercado Pago
        </span>
        <span style={{
          background:   C.orangeSoft,
          color:        C.orange,
          fontFamily:   'Inter, sans-serif',
          fontWeight:   600,
          fontSize:     11,
          padding:      '3px 9px',
          borderRadius: 20,
          whiteSpace:   'nowrap',
        }}>
          Próximamente
        </span>
      </div>

      {/* Llamar al mozo */}
      <button
        onClick={() => void llamarMozo()}
        disabled={llamandoMozo === 'loading' || llamandoMozo === 'ok'}
        style={{
          width:        '100%',
          padding:      '14px 16px',
          background:   mozoBg[llamandoMozo],
          color:        'white',
          border:       'none',
          borderRadius: 14,
          fontFamily:   'Montserrat, sans-serif',
          fontWeight:   700,
          fontSize:     15,
          cursor:       llamandoMozo === 'loading' || llamandoMozo === 'ok' ? 'not-allowed' : 'pointer',
          transition:   'background 0.2s',
        }}
      >
        {mozoLabel[llamandoMozo]}
      </button>

      <p style={{
        fontFamily: 'Inter, sans-serif',
        fontSize:   11,
        color:      C.gray,
        textAlign:  'center',
        margin:     0,
      }}>
        El mozo se acercará a tu mesa para procesar el pago.
      </p>
    </div>
  )

  const wrapper = (children: React.ReactNode) => (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: C.bg }}>
      <div style={{
        maxWidth: 520, width: '100%', margin: '0 auto',
        background: 'white', minHeight: '100vh',
        display: 'flex', flexDirection: 'column',
      }}>
        {header}
        {children}
      </div>
    </div>
  )

  /* ── loading ── */
  if (loading) return wrapper(
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Spinner size="md" />
    </div>,
  )

  /* ── error ── */
  if (error) return wrapper(
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center' }}>
      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, color: '#DC2626', margin: 0 }}>{error}</p>
      <button
        onClick={cargar}
        style={{
          background: C.orange, color: 'white', border: 'none',
          borderRadius: 10, padding: '10px 20px',
          fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 13, cursor: 'pointer',
        }}
      >
        Reintentar
      </button>
    </div>,
  )

  /* ── sin pedidos ── */
  if (itemsAgrupados.length === 0) return wrapper(
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center' }}>
      <p style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 15, color: C.text, margin: 0 }}>
        No hay pedidos en esta sesión
      </p>
      <button
        onClick={() => navigate('/menu')}
        style={{
          background: C.orange, color: 'white', border: 'none',
          borderRadius: 12, padding: '12px 24px',
          fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 14, cursor: 'pointer',
        }}
      >
        Ver menú
      </button>
    </div>,
  )

  /* ── cuenta ── */
  return wrapper(
    <>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 180px' }}>
        <div style={{
          border: `1px solid ${C.border}`, borderRadius: 12, padding: 16,
        }}>
          <p style={{
            fontFamily: 'Montserrat, sans-serif', fontWeight: 700,
            fontSize: 15, color: C.text, margin: '0 0 14px',
          }}>
            Cuenta de la mesa
          </p>

          {/* Header de tabla */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 44px 72px 72px',
            gap: '0 8px',
            marginBottom: 8,
          }}>
            {['ÍTEM', 'CANT.', 'P. UNIT.', 'TOTAL'].map((col, i) => (
              <span key={col} style={{
                fontFamily: 'Montserrat, sans-serif', fontWeight: 700,
                fontSize: 11, color: C.gray,
                letterSpacing: '0.08em',
                textAlign: i === 0 ? 'left' : 'right',
              }}>
                {col}
              </span>
            ))}
          </div>

          {/* Filas */}
          {itemsAgrupados.map((item, idx) => (
            <div key={item.nombre}>
              {idx > 0 && <div style={{ borderTop: `1px solid #F3F4F6`, margin: '6px 0' }} />}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 44px 72px 72px',
                gap: '0 8px',
                alignItems: 'center',
                padding: '4px 0',
              }}>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: C.text }}>
                  {item.nombre}
                </span>
                <span style={{
                  fontFamily: 'Inter, sans-serif', fontSize: 13,
                  color: C.text, textAlign: 'right',
                }}>
                  {item.cantidad}
                </span>
                <span style={{
                  fontFamily: 'Inter, sans-serif', fontSize: 13,
                  color: C.gray, textAlign: 'right',
                }}>
                  ${item.precioUnitario.toFixed(2)}
                </span>
                <span style={{
                  fontFamily: 'Montserrat, sans-serif', fontWeight: 700,
                  fontSize: 13, color: C.text, textAlign: 'right',
                }}>
                  ${(item.precioUnitario * item.cantidad).toFixed(2)}
                </span>
              </div>
            </div>
          ))}

          {/* Separador + subtotal */}
          <div style={{ borderTop: `1px solid ${C.border}`, margin: '12px 0 10px' }} />
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 44px 72px 72px',
            gap: '0 8px',
          }}>
            <span style={{
              fontFamily: 'Montserrat, sans-serif', fontWeight: 700,
              fontSize: 14, color: C.text,
            }}>
              Subtotal
            </span>
            <span />
            <span />
            <span style={{
              fontFamily: 'Montserrat, sans-serif', fontWeight: 800,
              fontSize: 15, color: C.navy, textAlign: 'right',
            }}>
              ${total.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {bottomPanel}
    </>,
  )
}
