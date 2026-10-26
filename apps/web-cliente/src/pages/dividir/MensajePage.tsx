import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Spinner } from '@menyu/ui'
import { useSessionStore } from '../../store/sessionStore'
import { useEtiquetado } from '../../hooks/useEtiquetado'
import { api } from '../../services/api'
import { C } from '../../theme'
import { EncabezadoPantalla, MarcoPantalla } from '../../components/PantallaComensal'
import { estadoCargando, estadoError, estadoVacio } from '../../components/estadosPantalla'

type Rama = 'partes_iguales' | 'por_consumo' | 'invalido'

const TEXTAREA_MAX_ROWS = 20

interface PorConsumoResult {
  partes: Array<{ comensalId: string; nombre: string; monto: number }>
  huerfanos: { total: number }
}

function fmt(n: number) {
  return `$${n.toFixed(2)}`
}

export function MensajePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const cantidadParam = searchParams.get('cantidad')
  const cantidad = cantidadParam !== null ? parseInt(cantidadParam, 10) : NaN
  const rama: Rama =
    cantidadParam !== null && Number.isFinite(cantidad) && cantidad > 0
      ? 'partes_iguales'
      : searchParams.get('modo') === 'por_consumo'
        ? 'por_consumo'
        : 'invalido'

  const sesionId = useSessionStore((s) => s.sesionId)
  const jwt = useSessionStore((s) => s.jwt)
  const numeroMesa = useSessionStore((s) => s.numeroMesa)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [totalSesion, setTotalSesion] = useState<number | null>(null)
  const [saldoPendiente, setSaldoPendiente] = useState<number | null>(null)
  const [porConsumo, setPorConsumo] = useState<PorConsumoResult | null>(null)

  const {
    items: itemsEtiquetados,
    comensales,
    loading: etiquetadoLoading,
    error: etiquetadoError,
  } = useEtiquetado(rama === 'por_consumo' ? sesionId ?? '' : '')

  const cargar = useCallback(() => {
    if (!sesionId) { setLoading(false); setError('No hay sesión activa'); return }
    if (rama === 'invalido') { setLoading(false); return }
    if (!jwt) { setLoading(false); setError('No hay sesión activa'); return }

    setLoading(true)
    setError(null)

    const llamadaSaldo = api.sesiones.saldo(jwt, sesionId)
    const llamadaConsumo = rama === 'por_consumo' ? api.comensales.calcularPorConsumo(jwt, sesionId) : Promise.resolve(null)

    Promise.all([llamadaSaldo, llamadaConsumo])
      .then(([saldo, consumo]) => {
        setTotalSesion(saldo.totalSesion)
        setSaldoPendiente(saldo.saldoPendiente)
        if (consumo) setPorConsumo(consumo)
        setLoading(false)
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Error al cargar los datos de la sesión')
        setLoading(false)
      })
  }, [sesionId, jwt, rama])

  useEffect(() => { cargar() }, [cargar])

  // ── Portapapeles ──
  const [copiado, setCopiado] = useState(false)
  const copiadoTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [avisoCopiaManual, setAvisoCopiaManual] = useState(false)

  useEffect(() => () => { if (copiadoTimeout.current) clearTimeout(copiadoTimeout.current) }, [])

  async function copiarMensaje(mensaje: string) {
    setAvisoCopiaManual(false)
    try {
      await navigator.clipboard.writeText(mensaje)
      mostrarCopiado()
      return
    } catch {
      // sigue al fallback
    }
    try {
      const ta = document.createElement('textarea')
      ta.value = mensaje
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      if (ok) { mostrarCopiado(); return }
    } catch {
      // sigue al aviso manual
    }
    setAvisoCopiaManual(true)
  }

  function mostrarCopiado() {
    setCopiado(true)
    if (copiadoTimeout.current) clearTimeout(copiadoTimeout.current)
    copiadoTimeout.current = setTimeout(() => setCopiado(false), 2000)
  }

  // ── Pago de mesa completa ──
  const [pagando, setPagando] = useState<'efectivo' | 'mercadopago' | null>(null)
  const [pagoConfirmado, setPagoConfirmado] = useState(false)
  const [errorPago, setErrorPago] = useState<string | null>(null)

  const bloqueadoPorSaldo = saldoPendiente !== null && saldoPendiente <= 0
  const pagoDisabled = pagando !== null || bloqueadoPorSaldo || pagoConfirmado

  async function pagarEfectivo() {
    if (!sesionId || !jwt || pagoDisabled) return
    setPagando('efectivo')
    setErrorPago(null)
    try {
      await api.payments.solicitarEfectivo(jwt, sesionId)
      setPagoConfirmado(true)
    } catch (e) {
      // Por ejemplo, "ya está completamente pagada" (400) llega acá con su mensaje.
      setErrorPago(e instanceof Error ? e.message : 'Error al registrar el pago en efectivo')
    } finally {
      setPagando(null)
    }
  }

  async function pagarMercadoPago() {
    if (!sesionId || !jwt || pagoDisabled) return
    setPagando('mercadopago')
    setErrorPago(null)
    try {
      const { initPoint } = await api.payments.pagarConMercadoPago(jwt, sesionId)
      window.location.href = initPoint
    } catch (e) {
      // Mismo caso que en pagarEfectivo, más los propios de Mercado Pago (sin conectar, etc).
      setErrorPago(e instanceof Error ? e.message : 'Error al iniciar el pago con Mercado Pago')
      setPagando(null)
    }
  }

  // ── Armado del mensaje ──
  const totalCobrado = totalSesion !== null && saldoPendiente !== null ? totalSesion - saldoPendiente : null
  const hayCobradoParcial = totalCobrado !== null && totalCobrado > 0

  let mensaje = ''
  if (rama === 'partes_iguales' && totalSesion !== null && saldoPendiente !== null) {
    const porPersona = saldoPendiente / cantidad
    const lineas = [`🧾 Mesa ${numeroMesa ?? ''} — MenYu`, `Total de la cuenta: ${fmt(totalSesion)}`]
    if (hayCobradoParcial) {
      lineas.push(`Ya cobrado: ${fmt(totalCobrado as number)}`)
      lineas.push(`Falta cobrar: ${fmt(saldoPendiente)}`)
    }
    lineas.push('')
    lineas.push(`Dividido en partes iguales entre ${cantidad}: ${fmt(porPersona)} cada uno`)
    mensaje = lineas.join('\n')
  } else if (rama === 'por_consumo' && totalSesion !== null && saldoPendiente !== null && porConsumo) {
    const lineas = [`🧾 Mesa ${numeroMesa ?? ''} — MenYu`, `Total de la cuenta: ${fmt(totalSesion)}`]
    if (hayCobradoParcial) {
      lineas.push(`Ya cobrado: ${fmt(totalCobrado as number)}`)
      lineas.push(`Falta cobrar: ${fmt(saldoPendiente)}`)
    }
    lineas.push('')

    for (const comensal of comensales) {
      const misItems = itemsEtiquetados.filter((i) => i.etiquetas.some((e) => e.id === comensal.id))
      if (misItems.length === 0) continue
      const parte = porConsumo.partes.find((p) => p.comensalId === comensal.id)

      lineas.push(comensal.nombre)
      for (const item of misItems) {
        const compartido = item.etiquetas.length > 1 ? ` (compartido entre ${item.etiquetas.length})` : ''
        lineas.push(`• ${item.cantidad}x ${item.nombre} — ${fmt(item.precioUnitario * item.cantidad)}${compartido}`)
      }
      lineas.push(`Total ${comensal.nombre}: ${fmt(parte?.monto ?? 0)}`)
      lineas.push('')
    }

    const huerfanos = itemsEtiquetados.filter((i) => i.etiquetas.length === 0)
    if (huerfanos.length > 0) {
      lineas.push(`⚠️ Sin asignar todavía (${fmt(porConsumo.huerfanos.total)}):`)
      for (const item of huerfanos) {
        lineas.push(`• ${item.cantidad}x ${item.nombre} — ${fmt(item.precioUnitario * item.cantidad)}`)
      }
      lineas.push('Avisen quién lo pidió para sumarlo a su parte.')
      lineas.push('')
    }

    if (hayCobradoParcial) {
      lineas.push('⚠️ Los montos de arriba son la parte de cada uno sobre el total de la cuenta. Si alguien ya pagó, no se lo vuelvas a pedir.')
    }

    mensaje = lineas.join('\n').trim()
  }

  const header = <EncabezadoPantalla titulo="Armar mensaje" onVolver={() => navigate('/pagar')} etiquetaVolver="Volver" />

  const wrapper = (children: React.ReactNode) => (
    <MarcoPantalla ancho={520} encabezado={header}>
      {children}
    </MarcoPantalla>
  )

  const loadingTotal = loading || (rama === 'por_consumo' && etiquetadoLoading)
  const errorTotal = error ?? (rama === 'por_consumo' ? etiquetadoError : null)

  if (rama === 'invalido') {
    return wrapper(estadoVacio({ texto: 'No se pudo determinar cómo armar el mensaje', accion: { texto: 'Volver', onClick: () => navigate('/pagar') } }))
  }

  if (loadingTotal) return wrapper(estadoCargando())

  if (errorTotal) return wrapper(estadoError(errorTotal, cargar))

  return wrapper(
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
        <p style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 14, color: C.text, margin: '0 0 10px' }}>
          Mensaje para el grupo
        </p>
        <textarea
          readOnly
          value={mensaje}
          rows={Math.min(mensaje.split('\n').length + 1, TEXTAREA_MAX_ROWS)}
          style={{
            width: '100%', resize: 'none', border: `1px solid ${C.border}`, borderRadius: 10,
            padding: 12, fontFamily: 'Inter, sans-serif', fontSize: 13, color: C.text,
            background: C.bg, overflowY: 'auto',
          }}
        />
        <button
          onClick={() => copiarMensaje(mensaje)}
          style={{
            width: '100%', marginTop: 10, padding: '12px 16px',
            background: copiado ? C.navy : C.orange, color: 'white', border: 'none',
            borderRadius: 12, fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 14, cursor: 'pointer',
          }}
        >
          {copiado ? '¡Copiado! ✅' : 'Copiar mensaje'}
        </button>
        {avisoCopiaManual && (
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: C.gray, margin: '8px 0 0', textAlign: 'center' }}>
            No pudimos copiarlo automáticamente. Seleccioná el texto de arriba y copialo a mano.
          </p>
        )}
      </div>

      <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 14, color: C.text, margin: 0 }}>
          Pagar toda la cuenta
        </p>

        {bloqueadoPorSaldo ? (
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: C.gray, margin: 0 }}>
            Esta cuenta ya está saldada.
          </p>
        ) : pagoConfirmado ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '8px 0' }}>
            <span style={{ fontSize: 28 }}>✅</span>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: C.text, margin: 0, textAlign: 'center' }}>
              El mozo se va a acercar a la mesa a cobrar el total.
            </p>
          </div>
        ) : (
          <>
            <button
              onClick={pagarEfectivo}
              disabled={pagoDisabled}
              style={{
                width: '100%', padding: '14px 16px',
                background: C.navy, color: 'white', border: 'none',
                borderRadius: 14, fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 15,
                cursor: pagoDisabled ? 'not-allowed' : 'pointer',
                opacity: pagoDisabled ? 0.5 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {pagando === 'efectivo' ? <Spinner size="sm" /> : 'Pagar toda la cuenta en efectivo'}
            </button>
            <button
              onClick={pagarMercadoPago}
              disabled={pagoDisabled}
              style={{
                width: '100%', padding: '14px 16px',
                background: C.orange, color: 'white', border: 'none',
                borderRadius: 14, fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 15,
                cursor: pagoDisabled ? 'not-allowed' : 'pointer',
                opacity: pagoDisabled ? 0.5 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {pagando === 'mercadopago' ? <Spinner size="sm" /> : 'Pagar toda la cuenta con Mercado Pago'}
            </button>
          </>
        )}

        {errorPago && (
          <p style={{
            fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#DC2626',
            background: '#FEF2F2', border: '1px solid #FECACA',
            borderRadius: 10, padding: '10px 12px', textAlign: 'center', margin: 0,
          }}>
            {errorPago}
          </p>
        )}
      </div>
    </div>,
  )
}
