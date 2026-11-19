import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Spinner, useCerrarConEscape } from '@menyu/ui'
import { useFocoDelDialogo } from '../../hooks/useFocoDelDialogo'
import { useSessionStore } from '../../store/sessionStore'
import { api } from '../../services/api'
import { C } from '../../theme'
import { anunciar } from '../../utils/anunciador'
import { formatearPrecio } from '../../utils/precio'
import { EncabezadoPantalla, InsigniaMesa, MarcoPantalla } from '../../components/PantallaComensal'
import { estadoCargando, estadoError, estadoVacio } from '../../components/estadosPantalla'

interface PedidoSesion {
  id: string
  items: Array<{
    id: string
    cantidad: number
    precioUnitario: number
    item: { nombre: string }
  }>
}

/** Las columnas de la cuenta: lo que se ve (corto, para que entre) y lo que dice el lector (entero). */
const COLUMNAS_DE_LA_CUENTA = [
  { visible: 'ÍTEM', lector: 'Ítem' },
  { visible: 'CANT.', lector: 'Cantidad' },
  { visible: 'P. UNIT.', lector: 'Precio unitario' },
  { visible: 'TOTAL', lector: 'Total' },
]

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
  // El "Generador de mensaje" es un diálogo: el foco entra a él al abrirlo y vuelve a "Armar mensaje" al cerrarlo, Esc lo
  // cierra (el hook escucha siempre: solo se actúa si está abierto) y el resto de la pantalla queda inerte mientras tanto.
  const dialogoDelMensaje = useRef<HTMLDivElement>(null)
  const idDelTituloDelDialogo = useId()
  const idDeLaCuenta = useId()
  useCerrarConEscape(() => { if (modalMensajeAbierto) setModalMensajeAbierto(false) })
  useFocoDelDialogo(modalMensajeAbierto, dialogoDelMensaje)

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
      await api.payments.solicitarEfectivo(jwt, sesionId)
      setPagoTotalConfirmado(true)
      // Los botones que se tocaron desaparecen y el foco se pierde: se dice qué pasó.
      anunciar('El mozo se va a acercar a la mesa a cobrar el total.')
    } catch (e) {
      // Por ejemplo, "ya está completamente pagada" (400) llega acá con su mensaje.
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
      const { initPoint } = await api.payments.pagarConMercadoPago(jwt, sesionId)
      window.location.href = initPoint
    } catch (e) {
      setErrorPagoTotal(e instanceof Error ? e.message : 'Error al iniciar el pago con Mercado Pago')
      setPagandoTotal(null)
    }
  }

  const header = (
    <EncabezadoPantalla
      titulo="Pagar la cuenta"
      onVolver={() => navigate('/menu')}
      etiquetaVolver="Volver al menú"
      derecha={<InsigniaMesa numero={numeroMesa} />}
      inerte={modalMensajeAbierto}
    />
  )

  let bottomContent: React.ReactNode

  if (pagoTotalConfirmado) {
    bottomContent = (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <span aria-hidden="true" style={{ fontSize: 32 }}>✅</span>
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
          <p role="alert" style={{
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
    <div inert={modalMensajeAbierto} style={{
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
    <MarcoPantalla ancho={520} encabezado={header}>
      {children}
    </MarcoPantalla>
  )

  if (loading) return wrapper(estadoCargando())

  if (error) return wrapper(estadoError(error, cargar))

  if (itemsAgrupados.length === 0) {
    return wrapper(estadoVacio({ texto: 'No hay pedidos en esta sesión', accion: { texto: 'Ver menú', onClick: () => navigate('/menu') } }))
  }

  /* ── resumen de "Total a pagar" ── */
  const totalAPagarContent = (
    <>
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 26, color: C.navy }}>
          {saldoPendiente !== null ? formatearPrecio(saldoPendiente) : '—'}
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

  // El fondo se puede tocar para cerrar (con el mouse o el dedo); para teclado y lector, el cierre es Esc o "Cancelar".
  const modal = modalMensajeAbierto && (
    <div
      role="presentation"
      onClick={() => setModalMensajeAbierto(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(45, 53, 97, 0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        ref={dialogoDelMensaje}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idDelTituloDelDialogo}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: 16, padding: 24,
          width: 320, maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: 10,
          // Un contenedor al que se le da el foco por código, no un control: sin anillo (los botones de adentro conservan el suyo).
          outline: 'none',
        }}
      >
        <h2 id={idDelTituloDelDialogo} style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 15, color: C.text, margin: '0 0 4px' }}>
          Generador de mensaje
        </h2>
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
      <div inert={modalMensajeAbierto} style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 180px' }}>
        <div style={{
          border: `1px solid ${C.border}`, borderRadius: 12, padding: 16,
        }}>
          <h2 id={idDeLaCuenta} style={{
            fontFamily: 'Montserrat, sans-serif', fontWeight: 700,
            fontSize: 15, color: C.text, margin: '0 0 14px',
          }}>
            Cuenta de la mesa
          </h2>

          {/* La cuenta es una tabla de verdad: con encabezados de columna, el lector dice "Hamburguesa, cantidad 2, precio
              unitario $ 9.000, total $ 18.000". Las columnas con nombre corto tienen el entero solo para el lector. */}
          <table aria-labelledby={idDeLaCuenta} style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col />
              <col style={{ width: 52 }} />
              <col style={{ width: 80 }} />
              <col style={{ width: 80 }} />
            </colgroup>
            <thead>
              <tr>
                {COLUMNAS_DE_LA_CUENTA.map((col, i) => (
                  <th key={col.visible} scope="col" style={{
                    fontFamily: 'Montserrat, sans-serif', fontWeight: 700,
                    fontSize: 11, color: C.gray,
                    letterSpacing: '0.08em',
                    textAlign: i === 0 ? 'left' : 'right',
                    padding: i === 0 ? '0 0 8px' : '0 0 8px 8px',
                  }}>
                    <span aria-hidden="true">{col.visible}</span>
                    <span className="sr-only">{col.lector}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {itemsAgrupados.map((item, idx) => {
                const separador = idx > 0 ? '1px solid #F3F4F6' : undefined
                return (
                  <tr key={item.nombre}>
                    <th scope="row" style={{
                      fontFamily: 'Inter, sans-serif', fontWeight: 400, fontSize: 13, color: C.text,
                      textAlign: 'left', padding: '10px 0 4px', borderTop: separador,
                      overflowWrap: 'anywhere', verticalAlign: 'top',
                    }}>
                      {item.nombre}
                    </th>
                    <td style={{
                      fontFamily: 'Inter, sans-serif', fontSize: 13, color: C.text,
                      textAlign: 'right', padding: '10px 0 4px 8px', borderTop: separador, verticalAlign: 'top',
                    }}>
                      {item.cantidad}
                    </td>
                    <td style={{
                      fontFamily: 'Inter, sans-serif', fontSize: 13, color: C.gray,
                      textAlign: 'right', padding: '10px 0 4px 8px', borderTop: separador, verticalAlign: 'top',
                    }}>
                      {formatearPrecio(item.precioUnitario)}
                    </td>
                    <td style={{
                      fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 13, color: C.text,
                      textAlign: 'right', padding: '10px 0 4px 8px', borderTop: separador, verticalAlign: 'top',
                    }}>
                      {formatearPrecio(item.precioUnitario * item.cantidad)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={3} style={{
                  fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 14, color: C.text,
                  textAlign: 'left', padding: '16px 0 0', borderTop: `1px solid ${C.border}`,
                }}>
                  Subtotal
                </th>
                <td style={{
                  fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 15, color: C.navy,
                  textAlign: 'right', padding: '16px 0 0 8px', borderTop: `1px solid ${C.border}`,
                }}>
                  {formatearPrecio(total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div style={{
          border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginTop: 16,
        }}>
          <h2 style={{
            fontFamily: 'Montserrat, sans-serif', fontWeight: 700,
            fontSize: 15, color: C.text, margin: '0 0 14px',
          }}>
            Total a pagar
          </h2>
          {totalAPagarContent}
        </div>
      </div>

      {bottomPanel}
      {modal}
    </>,
  )
}
