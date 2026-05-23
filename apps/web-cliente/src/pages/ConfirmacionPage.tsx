import { useNavigate } from 'react-router-dom'

export function ConfirmacionPage() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-white gap-5 p-8 text-center">
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center text-3xl">
        ✓
      </div>
      <div>
        <h1 className="text-xl font-bold text-gray-900">¡Pedido confirmado!</h1>
        <p className="text-sm text-gray-500 mt-1">Tu pedido fue enviado a cocina.</p>
      </div>
      <button
        onClick={() => navigate('/menu')}
        className="mt-4 px-8 py-3 bg-orange-500 text-white text-sm font-bold rounded-xl hover:bg-orange-600 transition-colors"
      >
        Volver al menú
      </button>
    </div>
  )
}
