import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCarritoStore } from '../../store/carritoStore'
import { useSessionStore } from '../../store/sessionStore'
import { api } from '../../services/api'

export function CarritoPage() {
  const navigate = useNavigate()
  const { items, quitarUno, vaciar, total } = useCarritoStore()
  const { sesionId, mesaId, jwt } = useSessionStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState(false)

  async function confirmarPedido() {
    if (!sesionId || !mesaId || !jwt) {
      setError('No hay sesión activa. Volvé al menú y abrí una mesa.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await api.pedidos.confirmar(sesionId, mesaId, items, jwt)
      vaciar()
      setExito(true)
      setTimeout(() => navigate('/menu'), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al enviar el pedido')
    } finally {
      setLoading(false)
    }
  }

  if (exito) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-white gap-4 p-6 text-center">
        <p className="text-5xl">✅</p>
        <p className="text-xl font-bold text-gray-900">¡Pedido enviado!</p>
        <p className="text-sm text-gray-500">La cocina ya lo recibió. Volvés al menú en un momento…</p>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col h-screen bg-white">
        <header className="flex items-center px-4 py-3 border-b border-gray-100">
          <button onClick={() => navigate('/menu')} className="text-orange-500 text-sm font-semibold">← Volver</button>
          <span className="flex-1 text-center text-sm font-bold text-gray-900">Mi pedido</span>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-4xl">🛒</p>
          <p className="text-gray-400 text-sm">El carrito está vacío</p>
          <button onClick={() => navigate('/menu')} className="text-orange-500 text-sm font-semibold">Ver el menú</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      <header className="flex items-center px-4 py-3 border-b border-gray-100">
        <button onClick={() => navigate('/menu')} className="text-orange-500 text-sm font-semibold">← Volver</button>
        <span className="flex-1 text-center text-sm font-bold text-gray-900">Mi pedido</span>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {items.map((item) => (
          <div key={item.cartId} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <p className="text-sm font-bold text-gray-900">{item.nombre}</p>
                {item.mods.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {item.mods.map((m, i) => (
                      <li key={i} className={`text-xs font-medium ${m.accion === 'AGREGAR' ? 'text-green-600' : 'text-red-500'}`}>
                        {m.accion === 'AGREGAR' ? `+ extra ×${m.cantidad}` : '− sin ingrediente'}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                <p className="text-sm font-bold text-orange-500">${item.precioUnitario.toFixed(2)}</p>
                <button
                  onClick={() => quitarUno(item.cartId)}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                >
                  Quitar
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="px-4 py-4 border-t border-gray-100 space-y-3 bg-white">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-center">
            {error}
          </p>
        )}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">Total</span>
          <span className="text-xl font-bold text-orange-500">${total().toFixed(2)}</span>
        </div>
        <button
          onClick={() => void confirmarPedido()}
          disabled={loading}
          className="w-full py-3.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors"
        >
          {loading ? 'Enviando pedido…' : 'Confirmar pedido'}
        </button>
      </div>
    </div>
  )
}
