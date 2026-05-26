import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCarritoStore } from '../../store/carritoStore'
import { useSessionStore } from '../../store/sessionStore'
import { api } from '../../services/api'

export function CarritoPage() {
  const navigate = useNavigate()
  const { items, quitar, vaciar, total } = useCarritoStore()
  const jwt = useSessionStore((s) => s.jwt)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState(false)
  const [pedidoId, setPedidoId] = useState<string | null>(null)
  const [totalFinal, setTotalFinal] = useState(0)

  async function confirmarPedido() {
    if (!jwt) {
      setError('No hay sesión activa. Volvé al menú y abrí una mesa.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const montoTotal = total()
      const result = await api.orders.create(
        jwt,
        items.map((i) => ({
          itemMenuId: i.itemMenuId,
          cantidad: i.cantidad,
          nota: i.nota,
          modificaciones: i.modificaciones,
        })),
      )
      setTotalFinal(montoTotal)
      setPedidoId(result.id)
      vaciar()
      setExito(true)
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
        <p className="text-sm text-gray-500">La cocina ya lo recibió.</p>
        <div className="w-full max-w-xs flex flex-col gap-3 mt-4">
          <button
            onClick={() => navigate(`/pago?pedidoId=${pedidoId ?? ''}&monto=${totalFinal}`)}
            className="w-full py-3.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl transition-colors"
          >
            Pedir la cuenta
          </button>
          <button
            onClick={() => navigate('/menu')}
            className="w-full py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors"
          >
            Seguir pidiendo
          </button>
        </div>
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
                {item.modificaciones.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {item.modificaciones.map((m, i) => (
                      <li key={i} className={`text-xs font-medium ${m.accion === 'agregar' ? 'text-green-600' : 'text-red-500'}`}>
                        {m.accion === 'agregar' ? `+ extra ×${m.cantidad}` : '− sin ingrediente'}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                <p className="text-sm font-bold text-orange-500">${item.precioUnitario.toFixed(2)}</p>
                <button
                  onClick={() => quitar(item.cartId)}
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
