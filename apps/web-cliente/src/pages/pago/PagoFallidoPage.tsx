import { useNavigate } from 'react-router-dom'

export function PagoFallidoPage() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-white gap-4 p-6 text-center">
      <p className="text-5xl">❌</p>
      <p className="text-xl font-bold text-gray-900">El pago no pudo procesarse</p>
      <p className="text-sm text-gray-500">Podés intentarlo nuevamente o elegir otro método de pago.</p>
      <button
        onClick={() => navigate('/pagar')}
        className="mt-2 px-6 py-3 bg-orange-500 text-white font-semibold rounded-xl text-sm"
      >
        Reintentar
      </button>
      <button
        onClick={() => navigate('/menu')}
        className="text-sm text-gray-400 underline"
      >
        Volver al menú
      </button>
    </div>
  )
}
