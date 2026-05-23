import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCartStore, buildModsKey } from '../../store/cartStore'
import { useSessionStore } from '../../store/sessionStore'
import { usePublicMenuStore } from '../../store/publicMenuStore'
import { api } from '../../services/api'

export function CartPage() {
  const navigate = useNavigate()
  const { items, total, removeItem, clearCart } = useCartStore()
  const jwt = useSessionStore((s) => s.jwt)
  const getItemById = usePublicMenuStore((s) => s.getItemById)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getIngredienteName = (itemMenuId: string, itemIngredienteId: string): string => {
    const menuItem = getItemById(itemMenuId)
    return (
      menuItem?.ingredientes.find((ii) => ii.id === itemIngredienteId)?.ingrediente?.nombre ??
      itemIngredienteId.slice(0, 8)
    )
  }

  const handleConfirmar = async () => {
    if (!jwt) {
      setError('No hay sesión activa. Volvé al menú e iniciá la sesión.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await api.orders.create(jwt, items)
      clearCart()
      navigate('/confirmacion')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al confirmar el pedido')
    } finally {
      setLoading(false)
    }
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 p-6">
        <p className="text-gray-400 text-sm">Tu carrito está vacío</p>
        <button
          onClick={() => navigate('/menu')}
          className="text-orange-500 text-sm font-semibold"
        >
          ← Volver al menú
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      <header className="flex items-center px-4 py-3 border-b border-gray-100">
        <button
          onClick={() => navigate('/menu')}
          className="text-orange-500 text-sm font-semibold"
        >
          ← Volver
        </button>
        <h1 className="flex-1 text-center text-base font-bold text-gray-900">Mi pedido</h1>
        <div className="w-12" />
      </header>

      <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
        {items.map((item) => {
          const key = buildModsKey(item.modificaciones)
          return (
            <div key={`${item.itemMenuId}-${key}`} className="flex gap-3 p-4">
              {item.imagenUrl && (
                <img
                  src={item.imagenUrl}
                  alt={item.nombre}
                  className="w-16 h-16 rounded-xl object-cover shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900">{item.nombre}</p>

                {item.modificaciones.length > 0 && (
                  <ul className="mt-0.5 space-y-0.5">
                    {item.modificaciones.map((m) => (
                      <li key={m.itemIngredienteId} className="text-xs text-gray-400">
                        {m.accion === 'quitar'
                          ? `Sin ${getIngredienteName(item.itemMenuId, m.itemIngredienteId)}`
                          : `+ ${m.cantidad} ${getIngredienteName(item.itemMenuId, m.itemIngredienteId)}`}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex items-center justify-between mt-2">
                  <p className="text-sm font-bold text-orange-500">
                    ${(item.precioTotal * item.cantidad).toFixed(2)}
                    {item.cantidad > 1 && (
                      <span className="text-xs font-normal text-gray-400 ml-1">
                        (×{item.cantidad})
                      </span>
                    )}
                  </p>
                  <button
                    onClick={() => removeItem(item.itemMenuId, key)}
                    className="text-xs text-red-400 hover:text-red-600 font-medium transition-colors"
                  >
                    Quitar
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="border-t border-gray-100 px-5 py-4 bg-white space-y-3">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">Total</p>
          <p className="text-xl font-bold text-gray-900">${total.toFixed(2)}</p>
        </div>
        <button
          onClick={() => void handleConfirmar()}
          disabled={loading}
          className="w-full py-3.5 bg-orange-500 text-white text-sm font-bold rounded-xl hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Confirmando…' : 'Confirmar pedido'}
        </button>
      </div>
    </div>
  )
}
