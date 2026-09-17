import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Spinner } from '@menyu/ui'
import { useSessionStore } from '../../store/sessionStore'
import { api, ApiError } from '../../services/api'
import { C } from '../../theme'

const CANTIDAD_MAX = 99

export function CantidadComensalesPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const destino: 'pagar' | 'mensaje' = searchParams.get('destino') === 'mensaje' ? 'mensaje' : 'pagar'

  const sesionId = useSessionStore((s) => s.sesionId)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [totalSesion, setTotalSesion] = useState<number | null>(null)
  const [comensalesRegistrados, setComensalesRegistrados] = useState(0)
  const [congelada, setCongelada] = useState(false)

  const [cantidad, setCantidad] = useState(1)
  const [editando, setEditando] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const [confirmando, setConfirmando] = useState(false)
  const [errorConfirmar, setErrorConfirmar] = useState<string | null>(null)

  const cargar = useCallback(() => {
    if (!sesionId) { setLoading(false); setError('No hay sesión activa'); return }
    setLoading(true)
    setError(null)
    Promise.all([
      api.sesiones.saldo(sesionId),
      api.comensales.listar(sesionId),
    ])
      .then(([saldo, comensales]) => {
        setTotalSesion(saldo.totalSesion)
        setCongelada(saldo.totalCobrado > 0)
        setComensalesRegistrados(comensales.length)
        // En "pagar" arrancamos ya en el piso real (comensales registrados);
        // en "mensaje" no hay piso atado a lo registrado, así que arranca en 1.
        setCantidad(destino === 'pagar' ? Math.max(comensales.length, 1) : 1)
        setLoading(false)
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Error al cargar los datos de la sesión')
        setLoading(false)
      })
  }, [sesionId, destino])

  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    if (editando) inputRef.current?.focus()
  }, [editando])

  // Piso del stepper: solo la rama "pagar" fuerza no bajar de los comensales ya
  // registrados (si no, el PATCH que sigue no tendría sentido). En "mensaje" no
  // se persiste nada, así que el piso es 1.
  const piso = destino === 'pagar' ? Math.max(comensalesRegistrados, 1) : 1

  // El backend calcula el divisor real como Math.max(cantidadComensales, comensales.length).
  // El preview tiene que reflejar eso, no la cantidad elegida a secas — pero
  // eso solo aplica a "pagar": ahí es el número que termina persistido y usado
  // por el backend. En "mensaje" no hay backend de por medio, el mensaje es
  // total/N puro con el N que el usuario eligió.
  const divisorEfectivo = destino === 'pagar' ? Math.max(cantidad, comensalesRegistrados) : cantidad
  const montoPorPersona = totalSesion !== null ? totalSesion / divisorEfectivo : null
  const bloqueadaPorCongelamiento = destino === 'pagar' && congelada
  const disabled = bloqueadaPorCongelamiento || confirmando

  function ajustar(delta: number) {
    setCantidad((c) => Math.max(piso, Math.min(CANTIDAD_MAX, c + delta)))
  }

  function abrirEdicion() {
    if (disabled) return
    setInputValue(String(cantidad))
    setEditando(true)
  }

  function commitEdicion() {
    const n = parseInt(inputValue, 10)
    if (!Number.isNaN(n)) setCantidad(Math.max(piso, Math.min(CANTIDAD_MAX, n)))
    setEditando(false)
  }

  async function handleContinuar() {
    if (!sesionId || disabled) return
    setErrorConfirmar(null)

    if (destino === 'mensaje') {
      navigate(`/dividir/mensaje?cantidad=${cantidad}`)
      return
    }

    setConfirmando(true)
    try {
      await api.comensales.setCantidadComensales(sesionId, cantidad)
      navigate('/pagar?modo=partes_iguales')
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setCongelada(true)
        setErrorConfirmar('La sesión ya tiene un pago aprobado: no se puede cambiar la cantidad de comensales.')
      } else {
        setErrorConfirmar(e instanceof Error ? e.message : 'Error al guardar la cantidad de comensales')
      }
    } finally {
      setConfirmando(false)
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
        onClick={() => navigate('/pagar')}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'white', fontSize: 22, lineHeight: 1,
          padding: '2px 8px 2px 0', display: 'flex', alignItems: 'center',
        }}
        aria-label="Volver"
      >
        ←
      </button>
      <span style={{
        flex: 1, fontFamily: 'Montserrat, sans-serif',
        fontWeight: 700, fontSize: 17, color: 'white', textAlign: 'center',
      }}>
        ¿Cuántos son?
      </span>
      <div style={{ width: 38 }} />
    </header>
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

  if (loading) return wrapper(
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Spinner size="md" />
    </div>,
  )

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

  return wrapper(
    <>
      <div style={{ flex: 1, padding: '24px 16px 180px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {bloqueadaPorCongelamiento && (
          <p style={{
            fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#DC2626',
            background: '#FEF2F2', border: '1px solid #FECACA',
            borderRadius: 10, padding: '10px 12px', margin: 0,
          }}>
            Ya se registró un pago en esta mesa. No se puede cambiar la cantidad de comensales para pagar desde el dispositivo — probá con el generador de mensaje.
          </p>
        )}

        <div style={{
          border: `1px solid ${C.border}`, borderRadius: 12, padding: 24,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
        }}>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: C.gray, margin: 0 }}>
            Cantidad de comensales
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <button
              onClick={() => ajustar(-1)}
              disabled={disabled || cantidad <= piso}
              aria-label="Restar"
              style={{
                width: 44, height: 44, borderRadius: '50%',
                border: `1.5px solid ${C.border}`, background: 'white',
                fontSize: 20, color: C.navy, cursor: 'pointer',
                opacity: disabled || cantidad <= piso ? 0.4 : 1,
              }}
            >
              −
            </button>

            {editando ? (
              <input
                ref={inputRef}
                type="number"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onBlur={commitEdicion}
                onKeyDown={(e) => { if (e.key === 'Enter') commitEdicion() }}
                style={{
                  width: 64, textAlign: 'center',
                  fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 32,
                  color: C.navy, border: `1.5px solid ${C.orange}`, borderRadius: 10,
                  padding: '4px 0',
                }}
              />
            ) : (
              <button
                onClick={abrirEdicion}
                disabled={disabled}
                aria-label="Editar cantidad"
                style={{
                  minWidth: 64, background: 'none', border: 'none',
                  fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 32,
                  color: C.navy, cursor: disabled ? 'default' : 'pointer',
                }}
              >
                {cantidad}
              </button>
            )}

            <button
              onClick={() => ajustar(1)}
              disabled={disabled || cantidad >= CANTIDAD_MAX}
              aria-label="Sumar"
              style={{
                width: 44, height: 44, borderRadius: '50%',
                border: `1.5px solid ${C.border}`, background: 'white',
                fontSize: 20, color: C.navy, cursor: 'pointer',
                opacity: disabled || cantidad >= CANTIDAD_MAX ? 0.4 : 1,
              }}
            >
              +
            </button>
          </div>

          {destino === 'pagar' && comensalesRegistrados > 0 && (
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: C.gray, margin: 0, textAlign: 'center' }}>
              Ya hay {comensalesRegistrados} {comensalesRegistrados === 1 ? 'persona registrada' : 'personas registradas'}
            </p>
          )}
        </div>

        <div style={{
          border: `1px solid ${C.border}`, borderRadius: 12, padding: 16,
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        }}>
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: C.gray }}>
            Cada persona paga
          </span>
          <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 22, color: C.navy }}>
            {montoPorPersona !== null ? `$${montoPorPersona.toFixed(2)}` : '—'}
          </span>
        </div>

        {divisorEfectivo > cantidad && (
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: C.gray, margin: 0, textAlign: 'center' }}>
            Se va a dividir entre {divisorEfectivo} porque ya hay {comensalesRegistrados} personas registradas en la mesa.
          </p>
        )}

        {errorConfirmar && (
          <p style={{
            fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#DC2626',
            background: '#FEF2F2', border: '1px solid #FECACA',
            borderRadius: 10, padding: '10px 12px', textAlign: 'center', margin: 0,
          }}>
            {errorConfirmar}
          </p>
        )}
      </div>

      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 520, background: 'white',
        borderTop: `1px solid ${C.border}`, padding: '14px 16px 24px',
        boxShadow: '0 -4px 20px rgba(0,0,0,0.08)',
      }}>
        <button
          onClick={handleContinuar}
          disabled={disabled}
          style={{
            width: '100%', padding: '14px 16px',
            background: C.orange, color: 'white', border: 'none',
            borderRadius: 14, fontFamily: 'Montserrat, sans-serif',
            fontWeight: 700, fontSize: 15,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {confirmando ? <Spinner size="sm" /> : 'Continuar'}
        </button>
      </div>
    </>,
  )
}
