import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCarritoStore } from '../../store/carritoStore'
import { useSessionStore } from '../../store/sessionStore'
import { api } from '../../services/api'

interface PedidoConfirmado {
  id: string
  items: Array<{
    id: string
    cantidad: number
    precioUnitario: number
    item: { nombre: string }
  }>
}

const C = {
  orange:      '#E8563A',
  navy:        '#2D3561',
  orangeSoft:  '#FDE5DF',
  bg:          '#F7F7F8',
  text:        '#1A1A2E',
  gray:        '#9CA3AF',
  border:      '#F0F0F2',
  errorBg:     '#FEF2F2',
  errorBorder: '#FECACA',
  errorText:   '#DC2626',
}

export function CarritoPage() {
  const navigate = useNavigate()
  const { items, quitar, cambiarCantidad, vaciar, total } = useCarritoStore()
  const jwt        = useSessionStore((s) => s.jwt)
  const numeroMesa = useSessionStore((s) => s.numeroMesa)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState(false)
  const [pedidoConfirmado, setPedidoConfirmado] = useState<PedidoConfirmado | null>(null)

  async function confirmarPedido() {
    if (!jwt) {
      setError('No hay sesión activa. Volvé al menú y abrí una mesa.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const resultado = await api.orders.create(
        jwt,
        items.map((i) => ({
          itemMenuId:     i.itemMenuId,
          cantidad:       i.cantidad,
          nota:           i.nota,
          modificaciones: i.modificaciones,
        })),
      )
      vaciar()
      setPedidoConfirmado(resultado as PedidoConfirmado)
      setExito(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al enviar el pedido')
    } finally {
      setLoading(false)
    }
  }

  const header = (
    <header style={{
      background:    C.navy,
      display:       'flex',
      alignItems:    'center',
      padding:       '14px 16px',
      gap:           12,
      flexShrink:    0,
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
        Carrito
      </span>
      <span style={{
        background:   C.orange,
        color:        'white',
        fontFamily:   'Inter, sans-serif',
        fontWeight:   600,
        fontSize:     12,
        padding:      '4px 10px',
        borderRadius: 20,
        whiteSpace:   'nowrap',
      }}>
        Mesa {numeroMesa ?? ''}
      </span>
    </header>
  )

  /* ── éxito ── */
  if (exito && pedidoConfirmado) {
    const subtotal = pedidoConfirmado.items.reduce(
      (acc, i) => acc + Number(i.precioUnitario) * i.cantidad,
      0,
    )

    return (
      <div style={{
        minHeight:      '100vh',
        background:     'white',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
      }}>
        <div style={{
          maxWidth:      480,
          width:         '100%',
          margin:        '0 auto',
          display:       'flex',
          flexDirection: 'column',
          alignItems:    'center',
          padding:       '32px 24px',
          textAlign:     'center',
          gap:           16,
        }}>
          <div style={{
            width:          80,
            height:         80,
            borderRadius:   '50%',
            background:     C.orange,
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            flexShrink:     0,
          }}>
            <span style={{ color: 'white', fontSize: 36, lineHeight: 1 }}>✓</span>
          </div>

          <p style={{
            fontFamily: 'Montserrat, sans-serif',
            fontWeight: 800,
            fontSize:   22,
            color:      C.navy,
            margin:     0,
          }}>
            ¡Pedido enviado a cocina!
          </p>

          <p style={{
            fontFamily: 'Inter, sans-serif',
            fontSize:   14,
            color:      C.gray,
            margin:     0,
          }}>
            Pedido{' '}
            <span style={{ fontWeight: 700, color: C.navy }}>
              #{pedidoConfirmado.id.slice(0, 6).toUpperCase()}
            </span>
          </p>

          <div style={{
            width:        '100%',
            border:       `1px solid ${C.border}`,
            borderRadius: 12,
            padding:      16,
            textAlign:    'left',
          }}>
            <p style={{
              fontFamily:    'Montserrat, sans-serif',
              fontWeight:    700,
              fontSize:      11,
              color:         C.gray,
              letterSpacing: '0.08em',
              margin:        '0 0 12px',
              textTransform: 'uppercase',
            }}>
              Resumen
            </p>

            {pedidoConfirmado.items.map((item) => (
              <div key={item.id} style={{
                display:        'flex',
                justifyContent: 'space-between',
                alignItems:     'baseline',
                marginBottom:   8,
              }}>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: C.text }}>
                  {item.cantidad}× {item.item.nombre}
                </span>
                <span style={{
                  fontFamily: 'Montserrat, sans-serif',
                  fontWeight: 600,
                  fontSize:   13,
                  color:      C.text,
                  flexShrink: 0,
                  marginLeft: 12,
                }}>
                  ${(Number(item.precioUnitario) * item.cantidad).toFixed(2)}
                </span>
              </div>
            ))}

            <div style={{ borderTop: `1px solid #E5E7EB`, margin: '10px 0' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 14, color: C.text }}>
                Subtotal
              </span>
              <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 16, color: C.navy }}>
                ${subtotal.toFixed(2)}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 10, width: '100%' }}>
            <button
              onClick={() => navigate('/menu')}
              style={{
                padding:      '13px 16px',
                background:   'white',
                color:        C.navy,
                border:       `2px solid ${C.navy}`,
                borderRadius: 12,
                fontFamily:   'Montserrat, sans-serif',
                fontWeight:   700,
                fontSize:     14,
                cursor:       'pointer',
              }}
            >
              Volver al menú
            </button>
            <button
              onClick={() => navigate('/pagar')}
              style={{
                padding:      '13px 16px',
                background:   C.orange,
                color:        'white',
                border:       'none',
                borderRadius: 12,
                fontFamily:   'Montserrat, sans-serif',
                fontWeight:   700,
                fontSize:     14,
                cursor:       'pointer',
              }}
            >
              Pedir la cuenta
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ── vacío ── */
  if (items.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: C.bg }}>
        <div style={{
          maxWidth:      480,
          width:         '100%',
          margin:        '0 auto',
          display:       'flex',
          flexDirection: 'column',
          flex:          1,
          background:    'white',
        }}>
          {header}
          <div style={{
            flex:           1,
            display:        'flex',
            flexDirection:  'column',
            alignItems:     'center',
            justifyContent: 'center',
            gap:            12,
            padding:        24,
            textAlign:      'center',
          }}>
            <p style={{ fontSize: 56, margin: 0 }}>🛒</p>
            <p style={{
              fontFamily: 'Montserrat, sans-serif',
              fontWeight: 700,
              fontSize:   16,
              color:      C.text,
              margin:     0,
            }}>
              Tu carrito está vacío
            </p>
            <button
              onClick={() => navigate('/menu')}
              style={{
                background:   C.orange,
                color:        'white',
                border:       'none',
                borderRadius: 12,
                padding:      '12px 24px',
                fontFamily:   'Montserrat, sans-serif',
                fontWeight:   700,
                fontSize:     14,
                cursor:       'pointer',
                marginTop:    8,
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
        display:       'flex',
        flexDirection: 'column',
        minHeight:     '100vh',
        background:    'white',
        position:      'relative',
      }}>
        {header}

        <div style={{
          flex:          1,
          overflowY:     'auto',
          padding:       '12px 16px',
          paddingBottom: 200,
          display:       'flex',
          flexDirection: 'column',
          gap:           10,
        }}>
          {items.map((item) => {
            const modsText = item.modificaciones.length > 0
              ? item.modificaciones
                  .map((m) =>
                    m.accion === 'quitar'
                      ? `Sin ${m.nombre ?? 'ingrediente'}`
                      : `+ ${m.nombre ?? 'extra'} ×${m.cantidad}`,
                  )
                  .join(' · ')
              : null

            return (
              <div key={item.cartId} style={{
                background:   'white',
                border:       `1px solid ${C.border}`,
                borderRadius: 14,
                padding:      '12px 14px',
                boxShadow:    '0 1px 4px rgba(0,0,0,0.06)',
              }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{
                    width:        64,
                    height:       64,
                    borderRadius: 10,
                    background:   C.bg,
                    flexShrink:   0,
                  }} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      onClick={() => navigate(`/menu/${item.itemMenuId}`, { state: { cartId: item.cartId } })}
                      onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
                      onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
                      style={{
                        fontFamily:   'Montserrat, sans-serif',
                        fontWeight:   700,
                        fontSize:     14,
                        color:        C.text,
                        margin:       0,
                        marginBottom: (modsText || item.nota) ? 3 : 0,
                        cursor:       'pointer',
                      }}
                    >
                      {item.nombre}
                    </p>
                    {modsText && (
                      <p style={{
                        fontFamily:   'Inter, sans-serif',
                        fontSize:     11,
                        color:        C.gray,
                        margin:       0,
                        marginBottom: item.nota ? 3 : 0,
                        overflow:     'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace:   'nowrap',
                      }}>
                        {modsText}
                      </p>
                    )}
                    {item.nota && (
                      <p style={{
                        fontFamily: 'Inter, sans-serif',
                        fontSize:   11,
                        color:      '#92400E',
                        background: '#FEF3C7',
                        borderRadius: 6,
                        padding:    '2px 6px',
                        margin:     0,
                        display:    'inline-block',
                      }}>
                        📝 {item.nota}
                      </p>
                    )}
                  </div>

                  <p style={{
                    fontFamily: 'Montserrat, sans-serif',
                    fontWeight: 700,
                    fontSize:   14,
                    color:      C.orange,
                    margin:     0,
                    flexShrink: 0,
                  }}>
                    ${(item.precioUnitario * item.cantidad).toFixed(2)}
                  </p>
                </div>

                <div style={{
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'space-between',
                  marginTop:      10,
                }}>
                  <div style={{
                    display:      'inline-flex',
                    alignItems:   'center',
                    border:       '1.5px solid #E5E7EB',
                    borderRadius: 20,
                    overflow:     'hidden',
                  }}>
                    <button
                      onClick={() => cambiarCantidad(item.cartId, item.cantidad - 1)}
                      disabled={item.cantidad <= 1}
                      style={{
                        width:          32,
                        height:         32,
                        background:     'none',
                        border:         'none',
                        cursor:         item.cantidad <= 1 ? 'not-allowed' : 'pointer',
                        fontSize:       18,
                        color:          item.cantidad <= 1 ? '#D1D5DB' : C.navy,
                        display:        'flex',
                        alignItems:     'center',
                        justifyContent: 'center',
                      }}
                    >
                      −
                    </button>
                    <span style={{
                      minWidth:   28,
                      textAlign:  'center',
                      fontFamily: 'Montserrat, sans-serif',
                      fontWeight: 700,
                      fontSize:   14,
                      color:      C.navy,
                    }}>
                      {item.cantidad}
                    </span>
                    <button
                      onClick={() => cambiarCantidad(item.cartId, item.cantidad + 1)}
                      style={{
                        width:          32,
                        height:         32,
                        background:     'none',
                        border:         'none',
                        cursor:         'pointer',
                        fontSize:       18,
                        color:          C.navy,
                        display:        'flex',
                        alignItems:     'center',
                        justifyContent: 'center',
                      }}
                    >
                      +
                    </button>
                  </div>

                  <button
                    onClick={() => quitar(item.cartId)}
                    style={{
                      background: 'none',
                      border:     'none',
                      cursor:     'pointer',
                      fontFamily: 'Inter, sans-serif',
                      fontSize:   12,
                      fontWeight: 500,
                      color:      '#EF4444',
                    }}
                  >
                    Quitar
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <div style={{
          position:   'fixed',
          bottom:     0,
          left:       '50%',
          transform:  'translateX(-50%)',
          width:      '100%',
          maxWidth:   480,
          background: 'white',
          borderTop:  `1px solid ${C.border}`,
          padding:    '10px 16px 16px',
          boxShadow:  '0 -4px 20px rgba(0,0,0,0.08)',
        }}>
          <div style={{
            display:        'flex',
            alignItems:     'baseline',
            justifyContent: 'space-between',
            marginBottom:   8,
          }}>
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: C.gray }}>
              Total
            </span>
            <span style={{
              fontFamily: 'Montserrat, sans-serif',
              fontWeight: 800,
              fontSize:   20,
              color:      C.navy,
            }}>
              ${total().toFixed(2)}
            </span>
          </div>

          {error && (
            <p style={{
              background:   C.errorBg,
              border:       `1px solid ${C.errorBorder}`,
              color:        C.errorText,
              borderRadius: 10,
              padding:      '8px 12px',
              fontFamily:   'Inter, sans-serif',
              fontSize:     12,
              textAlign:    'center',
              marginBottom: 8,
            }}>
              {error}
            </p>
          )}

          <button
            onClick={() => navigate('/menu')}
            style={{
              width:        '100%',
              padding:      '10px 16px',
              background:   'transparent',
              color:        C.navy,
              border:       `2px solid ${C.navy}`,
              borderRadius: 12,
              fontFamily:   'Montserrat, sans-serif',
              fontWeight:   700,
              fontSize:     14,
              cursor:       'pointer',
              marginBottom: 8,
            }}
          >
            Seguir pidiendo
          </button>

          <button
            onClick={() => void confirmarPedido()}
            disabled={loading}
            style={{
              width:        '100%',
              padding:      '10px 16px',
              background:   loading ? '#F4A494' : C.orange,
              color:        'white',
              border:       'none',
              borderRadius: 12,
              fontFamily:   'Montserrat, sans-serif',
              fontWeight:   700,
              fontSize:     14,
              cursor:       loading ? 'not-allowed' : 'pointer',
              transition:   'background 0.2s',
            }}
          >
            {loading ? 'Enviando pedido…' : 'Confirmar pedido'}
          </button>

          <p style={{
            fontFamily: 'Inter, sans-serif',
            fontSize:   10,
            color:      C.gray,
            textAlign:  'center',
            margin:     '6px 0 0',
          }}>
            El cobro se realizará al finalizar tu visita.
          </p>
        </div>
      </div>
    </div>
  )
}
