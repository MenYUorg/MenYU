import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Spinner } from '@menyu/ui'
import { useSessionStore } from '../../store/sessionStore'
import { usePagoStore } from '../../store/pagoStore'
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

export function PagarPage() {
  const navigate      = useNavigate()
  const jwt           = useSessionStore((s) => s.jwt)
  const sesionId      = useSessionStore((s) => s.sesionId)
  const numeroMesa    = useSessionStore((s) => s.numeroMesa)
  const {
    estado: estadoPago,
    error: errorPago,
    modoDivision,
    modoElegido,
    montoPartesIguales,
    montoPorConsumo,
    miMonto,
    reset: resetPago,
  } = usePagoStore()

  const [pedidos, setPedidos] = useState<PedidoSesion[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    resetPago()
    if (sesionId) {
      void usePagoStore.getState().cargarDivision(sesionId)
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

  function handleEfectivo() {
    if (!sesionId || miMonto === null) return
    void usePagoStore.getState().solicitarEfectivo(sesionId)
  }

  function handleMercadoPago() {
    if (!sesionId || miMonto === null) return
    void usePagoStore.getState().pagarConMercadoPago(sesionId)
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

  if (estadoPago === 'efectivo_solicitado') {
    bottomContent = (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 32 }}>✅</span>
        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, color: C.text, margin: 0, textAlign: 'center' }}>
          El mozo se acercará a tu mesa en breve.
        </p>
      </div>
    )
  } else if (estadoPago === 'error') {
    bottomContent = (
      <>
        <p style={{
          fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#DC2626',
          background: '#FEF2F2', border: '1px solid #FECACA',
          borderRadius: 10, padding: '10px 12px', textAlign: 'center', margin: 0,
        }}>
          {errorPago}
        </p>
        <button
          onClick={resetPago}
          style={{
            width: '100%', padding: '14px 16px',
            background: C.orange, color: 'white', border: 'none',
            borderRadius: 14, fontFamily: 'Montserrat, sans-serif',
            fontWeight: 700, fontSize: 15, cursor: 'pointer',
          }}
        >
          Reintentar
        </button>
      </>
    )
  } else if (estadoPago === 'loading') {
    bottomContent = (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <Spinner size="md" />
        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: C.gray, margin: 0 }}>
          Conectando con Mercado Pago...
        </p>
      </div>
    )
  } else if (estadoPago === 'mp_redirigiendo') {
    bottomContent = (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <Spinner size="md" />
        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: C.gray, margin: 0 }}>
          Conectando con Mercado Pago...
        </p>
      </div>
    )
  } else {
    const disabled = miMonto === null
    bottomContent = (
      <>
        <button
          onClick={handleEfectivo}
          disabled={disabled}
          style={{
            width: '100%', padding: '14px 16px',
            background: C.navy, color: 'white', border: 'none',
            borderRadius: 14, fontFamily: 'Montserrat, sans-serif',
            fontWeight: 700, fontSize: 15,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1,
          }}
        >
          Llamar al mozo para pagar
        </button>
        <button
          onClick={handleMercadoPago}
          disabled={disabled}
          style={{
            width: '100%', padding: '14px 16px',
            background: C.orange, color: 'white', border: 'none',
            borderRadius: 14, fontFamily: 'Montserrat, sans-serif',
            fontWeight: 700, fontSize: 15,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1,
          }}
        >
          Pagar con Mercado Pago
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

  /* ── selector / resumen de "Tu parte" ── */
  let tuParteContent: React.ReactNode

  if (estadoPago === 'cargando_division') {
    tuParteContent = (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '12px 0' }}>
        <Spinner size="sm" />
        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: C.gray, margin: 0 }}>
          Calculando tu parte...
        </p>
      </div>
    )
  } else if (modoDivision === null) {
    const porConsumoDisponible = montoPorConsumo !== 'no_disponible'

    tuParteContent = (
      <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            onClick={() => usePagoStore.getState().elegirModo('partes_iguales')}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              width: '100%', padding: '12px 14px', textAlign: 'left',
              borderRadius: 12, cursor: 'pointer',
              border: `2px solid ${modoElegido === 'partes_iguales' ? C.orange : C.border}`,
              background: modoElegido === 'partes_iguales' ? C.orangeSoft : 'white',
            }}
          >
            <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 14, color: C.text }}>
              Partes iguales
            </span>
            <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 15, color: C.navy }}>
              {montoPartesIguales !== null ? `$${montoPartesIguales.toFixed(2)}` : '—'}
            </span>
          </button>

          <button
            type="button"
            disabled={!porConsumoDisponible}
            onClick={() => {
              if (!porConsumoDisponible) return
              usePagoStore.getState().elegirModo('por_consumo')
            }}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              width: '100%', padding: '12px 14px', textAlign: 'left',
              borderRadius: 12,
              cursor: porConsumoDisponible ? 'pointer' : 'not-allowed',
              border: `2px solid ${modoElegido === 'por_consumo' ? C.orange : C.border}`,
              background: modoElegido === 'por_consumo' ? C.orangeSoft : 'white',
              opacity: porConsumoDisponible ? 1 : 0.5,
            }}
          >
            <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 14, color: C.text }}>
              Por consumo
            </span>
            {porConsumoDisponible ? (
              <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 15, color: C.navy }}>
                ${(montoPorConsumo as number).toFixed(2)}
              </span>
            ) : (
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: C.gray, textAlign: 'right', maxWidth: 140 }}>
                No disponible: hay ítems sin etiquetar todavía
              </span>
            )}
          </button>
        </div>

        {miMonto !== null && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14 }}>
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: C.gray }}>Total a pagar</span>
            <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 22, color: C.navy }}>
              ${miMonto.toFixed(2)}
            </span>
          </div>
        )}
      </>
    )
  } else {
    tuParteContent = (
      <>
        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: C.gray, margin: '0 0 6px' }}>
          División: {modoDivision === 'partes_iguales' ? 'partes iguales' : 'por consumo'}
        </p>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 26, color: C.navy }}>
            {miMonto !== null ? `$${miMonto.toFixed(2)}` : '—'}
          </span>
        </div>
      </>
    )
  }

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
            Tu parte
          </p>
          {tuParteContent}
        </div>
      </div>

      {bottomPanel}
    </>,
  )
}
