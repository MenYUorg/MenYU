import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useSessionStore } from '../../store/sessionStore'
import { usePagoStore } from '../../store/pagoStore'

function CountdownRedirect({ mensaje, submensaje }: { mensaje: string; submensaje: string }) {
  const navigate = useNavigate()
  const [segundos, setSegundos] = useState(30)

  useEffect(() => {
    const interval = setInterval(() => {
      setSegundos((s) => {
        if (s <= 1) {
          clearInterval(interval)
          navigate('/menu')
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [navigate])

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-white gap-4 p-6 text-center">
      <p className="text-5xl">✅</p>
      <p className="text-xl font-bold text-gray-900">{mensaje}</p>
      <p className="text-sm text-gray-500">{submensaje}</p>
      <p className="text-sm text-gray-400">
        Volviendo al menú en <span className="font-bold text-orange-500">{segundos}s</span>
      </p>
      <button
        onClick={() => navigate('/menu')}
        className="mt-2 text-sm text-orange-500 font-semibold underline"
      >
        Ir ahora
      </button>
    </div>
  )
}

export function PagoPage() {
  const [searchParams] = useSearchParams()
  const pedidoId = searchParams.get('pedidoId') ?? ''
  const monto = parseFloat(searchParams.get('monto') ?? '0')

  const { sesionId, jwt, restauranteId } = useSessionStore()
  const { estado, error, initiarPagoMP, solicitarEfectivo, reset } = usePagoStore()

  useEffect(() => {
    reset()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleMP = () => {
    if (!jwt || !sesionId || !restauranteId) return
    void initiarPagoMP(jwt, sesionId, restauranteId, pedidoId, monto)
  }

  const handleEfectivo = () => {
    if (!jwt || !sesionId) return
    void solicitarEfectivo(jwt, sesionId, pedidoId, monto)
  }

  if (estado === 'loading' || estado === 'mp_redirect') {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-white gap-4 p-6 text-center">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Conectando con Mercado Pago...</p>
      </div>
    )
  }

  if (estado === 'efectivo_solicitado') {
    return (
      <CountdownRedirect
        mensaje="Le avisamos al mozo que vas a pagar en efectivo."
        submensaje="En breve se acercará a tu mesa."
      />
    )
  }

  if (estado === 'error') {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-white gap-4 p-6 text-center">
        <p className="text-5xl">❌</p>
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
        <button
          onClick={reset}
          className="w-full max-w-xs py-3.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl transition-colors"
        >
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      <header className="flex items-center px-4 py-3 border-b border-gray-100">
        <span className="flex-1 text-center text-sm font-bold text-gray-900">Cerrar cuenta</span>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-900">¿Cómo querés pagar?</p>
          <p className="mt-1 text-sm text-gray-500">
            Total:{' '}
            <span className="font-bold text-orange-500">${monto.toFixed(2)}</span>
          </p>
        </div>

        <div className="w-full max-w-xs flex flex-col gap-3">
          <button
            onClick={handleMP}
            className="w-full py-4 bg-[#009EE3] hover:bg-[#0088c7] text-white font-bold rounded-xl transition-colors"
          >
            Pagar con Mercado Pago
          </button>
          <button
            onClick={handleEfectivo}
            className="w-full py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors"
          >
            Pagar en efectivo
          </button>
        </div>
      </div>
    </div>
  )
}
