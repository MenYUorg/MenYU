import { useNavigate } from 'react-router-dom'

export function PagoPendientePage() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-white gap-4 p-6 text-center">
      <p className="text-5xl">⏳</p>
      <p className="text-xl font-bold text-gray-900">Pago en proceso</p>
      <p className="text-sm text-gray-500">
        Tu pago está siendo verificado. Te avisaremos cuando se confirme.
      </p>
      <button
        onClick={() => navigate('/pedidos')}
        className="mt-2 px-6 py-3 bg-orange-500 text-white font-semibold rounded-xl text-sm"
      >
        Ver mis pedidos
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
