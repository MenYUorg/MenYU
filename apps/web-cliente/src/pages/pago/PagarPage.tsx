import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Spinner } from '@menyu/ui'
import { useSessionStore } from '../../store/sessionStore'
import { api } from '../../services/api'
import { C } from '../../theme'

interface PedidoSesion {
  id: string
  items: Array<{
    id: string
    cantidad: number
    precioUnitario: number
    item: { nombre: string }
  }>
}

export function PagarPage() {
  const navigate       = useNavigate()
  const jwt           = useSessionStore((s) => s.jwt)
  const sesionId      = useSessionStore((s) => s.sesionId)
  const numeroMesa    = useSessionStore((s) => s.numeroMesa)

  const [pedidos, setPedidos] = useState<PedidoSesion[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const [saldoPendiente, setSaldoPendiente] = useState<number | null>(null)

  const [modalMensajeAbierto, setModalMensajeAbierto] = useState(false)

  const [pagandoTotal, setPagandoTotal] = useState<'efectivo' | 'mercadopago' | null>(null)
  const [pagoTotalConfirmado, setPagoTotalConfirmado] = useState(false)
  const [errorPagoTotal, setErrorPagoTotal] = useState<string | null>(null)

  useEffect(() => {
    if (sesionId) {
      // Fallo silencioso: si esto no llega, los botones de "toda la cuenta" quedan
      // habilitados (no bloqueamos por una falla de red puntual) y el error real,
      // si lo hay, sale recién al intentar pagar.
      if (jwt) {
        void api.sesiones.saldo(jwt, sesionId).then((s) => setSaldoPendiente(s.saldoPendiente)).catch(() => {})
      }
    }
  }, [sesionId]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const bloqueadoPorSaldo = saldoPendiente !== null && saldoPendiente <= 0

  async function handlePagarTodoEfectivo() {
    if (!sesionId || !jwt || pagandoTotal !== null || bloqueadoPorSaldo) return
    setPagandoTotal('efectivo')
    setErrorPagoTotal(null)
    try {
      await api.payments.solicitarEfectivo(jwt, sesionId, null, null)
      setPagoTotalConfirmado(true)
    } catch (e) {
      // El 409 de conflicto con un pago individual pendiente llega acá con su mensaje.
      setErrorPagoTotal(e instanceof Error ? e.message : 'Error al registrar el pago en efectivo')
    } finally {
      setPagandoTotal(null)
    }
  }

  async function handlePagarTodoMercadoPago() {
    if (!sesionId || !jwt || pagandoTotal !== null || bloqueadoPorSaldo) return
    setPagandoTotal('mercadopago')
    setErrorPagoTotal(null)
    try {
      const { initPoint } = await api.payments.pagarConMercadoPago(jwt, sesionId, null, null)
      window.location.href = initPoint
    } catch (e) {
      setErrorPagoTotal(e instanceof Error ? e.message : 'Error al iniciar el pago con Mercado Pago')
      setPagandoTotal(null)
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
        Mesa {numeroMesa ?? ''}
      </span>
    </header>
  )

  let bottomContent: React.ReactNode

  if (pagoTotalConfirmado) {
    bottomContent = (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 32 }}>✅</span>
        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, color: C.text, margin: 0, textAlign: 'center' }}>
          El mozo se va a acercar a la mesa a cobrar el total.
        </p>
      </div>
    )
  } else if (bloqueadoPorSaldo) {
    bottomContent = (
      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: C.gray, margin: 0, textAlign: 'center' }}>
        Esta cuenta ya está saldada.
      </p>
    )
  } else {
    const disabledTotal = pagandoTotal !== null
    bottomContent = (
      <>
        {errorPagoTotal && (
          <p style={{
            fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#DC2626',
            background: '#FEF2F2', border: '1px solid #FECACA',
            borderRadius: 10, padding: '10px 12px', textAlign: 'center', margin: 0,
          }}>
            {errorPagoTotal}
          </p>
        )}
        <button
          onClick={handlePagarTodoEfectivo}
          disabled={disabledTotal}
          style={{
            width: '100%', padding: '14px 16px',
            background: C.navy, color: 'white', border: 'none',
            borderRadius: 14, fontFamily: 'Montserrat, sans-serif',
            fontWeight: 700, fontSize: 15,
            cursor: disabledTotal ? 'not-allowed' : 'pointer',
            opacity: disabledTotal ? 0.5 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {pagandoTotal === 'efectivo' ? <Spinner size="sm" /> : 'Pagar toda la cuenta en efectivo'}
        </button>
        <button
          onClick={handlePagarTodoMercadoPago}
          disabled={disabledTotal}
          style={{
            width: '100%', padding: '14px 16px',
            background: C.orange, color: 'white', border: 'none',
            borderRadius: 14, fontFamily: 'Montserrat, sans-serif',
            fontWeight: 700, fontSize: 15,
            cursor: disabledTotal ? 'not-allowed' : 'pointer',
            opacity: disabledTotal ? 0.5 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {pagandoTotal === 'mercadopago' ? <Spinner size="sm" /> : 'Pagar toda la cuenta con Mercado Pago'}
        </button>
      </>
    )
  }

  const bottomPanel = (
    <div style={{
      position:      'fixed',
      bottom:        0,
      left:          '50%',
      transform:     'translateX(-50%)',
      width:         '100%',
      maxWidth:      520,
      background:    'white',
      borderTop:     `1px solid ${C.border}`,
      padding:       '14px 16px 24px',
      boxShadow:     '0 -4px 20px rgba(0,0,0,0.08)',
      display:       'flex',
      flexDirection: 'column',
      gap:           10,
    }}>
      {bottomContent}
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

  /* ── resumen de "Total a pagar" ── */
  const totalAPagarContent = (
    <>
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 26, color: C.navy }}>
          {saldoPendiente !== null ? `$${saldoPendiente.toFixed(2)}` : '—'}
        </span>
      </div>
      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: C.gray, margin: '10px 0 0' }}>
        ¿Van a dividir la cuenta entre varios?
      </p>
      <button
        type="button"
        onClick={() => setModalMensajeAbierto(true)}
        style={{
          width: '100%', marginTop: 10, padding: '12px 14px',
          background: 'white', color: C.orange, border: `1.5px solid ${C.orange}`,
          borderRadius: 12, fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 14, cursor: 'pointer',
        }}
      >
        Armar mensaje
      </button>
    </>
  )

  /* ── modal "Generador de mensaje" ── */
  const modalBtnStyle: React.CSSProperties = {
    width: '100%', padding: '14px 16px', textAlign: 'left',
    borderRadius: 12, border: `1.5px solid ${C.border}`, background: 'white',
    fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 14, color: C.text,
    cursor: 'pointer',
  }

  const modal = modalMensajeAbierto && (
    <div
      onClick={() => setModalMensajeAbierto(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(45, 53, 97, 0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: 16, padding: 24,
          width: 320, maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: 10,
        }}
      >
        <p style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 15, color: C.text, margin: '0 0 4px' }}>
          Generador de mensaje
        </p>
        <button type="button" onClick={() => navigate('/dividir/cantidad')} style={modalBtnStyle}>
          Partes iguales
        </button>
        <button type="button" onClick={() => navigate('/etiquetar?destino=mensaje')} style={modalBtnStyle}>
          Por consumo
        </button>

        <button
          type="button"
          onClick={() => setModalMensajeAbierto(false)}
          style={{ width: '100%', padding: '10px 0', border: 'none', background: 'none', color: C.gray, fontFamily: 'Inter, sans-serif', fontSize: 13, cursor: 'pointer', marginTop: 4 }}
        >
          Cancelar
        </button>
      </div>
    </div>
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

        <div style={{
          border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginTop: 16,
        }}>
          <p style={{
            fontFamily: 'Montserrat, sans-serif', fontWeight: 700,
            fontSize: 15, color: C.text, margin: '0 0 14px',
          }}>
            Total a pagar
          </p>
          {totalAPagarContent}
        </div>
      </div>

      {bottomPanel}
      {modal}
    </>,
  )
}
