import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { usePublicMenuStore } from '../../store/publicMenuStore'
import { useCarritoStore } from '../../store/carritoStore'
import type { MenuPublicoItem } from '@menyu/types'

export function ItemDetailPage() {
  const { itemId } = useParams<{ itemId: string }>()
  const navigate = useNavigate()
  const getItemById = usePublicMenuStore((s) => s.getItemById)
  const item = getItemById(itemId ?? '') as MenuPublicoItem | undefined

  const [removidos, setRemovidos] = useState<Set<string>>(new Set())
  const [agregados, setAgregados] = useState<Map<string, number>>(new Map())
  const { agregar } = useCarritoStore()

  if (!item) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 p-6">
        <p className="text-red-600 text-sm">Ítem no encontrado</p>
        <button onClick={() => navigate('/menu')} className="text-orange-500 text-sm font-semibold">← Volver al menú</button>
      </div>
    )
  }

  const precioModificaciones = Array.from(agregados.entries()).reduce((acc, [id, qty]) => {
    const ing = item.ingredientes?.find((ii) => ii.id === id)
    return acc + (ing ? Number(ing.precioExtra) * qty : 0)
  }, 0)
  const precioTotal = Number(item.precioBase) + precioModificaciones

  const toggleRemovido = (id: string) => {
    setRemovidos((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const cambiarCantidad = (ii: { id: string; cantidadMin: number; cantidadMax: number }, delta: number) => {
    setAgregados((prev) => {
      const next = new Map(prev)
      const actual = next.get(ii.id) ?? 0
      const nuevo = Math.max(ii.cantidadMin, Math.min(ii.cantidadMax, actual + delta))
      if (nuevo === 0) next.delete(ii.id)
      else next.set(ii.id, nuevo)
      return next
    })
  }

  const ingredientesOriginales = (item.ingredientes ?? []).filter((ii) => ii.esOriginal)
  const ingredientesAgregables = (item.ingredientes ?? []).filter((ii) => ii.esAgregable && !ii.esOriginal)

  return (
    <div className="flex flex-col h-screen bg-white">
      <header className="flex items-center px-4 py-3 border-b border-gray-100">
        <button onClick={() => navigate('/menu')} className="text-orange-500 text-sm font-semibold">← Volver</button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <img src={item.imagenUrl || '/src/assets/predeterminada_menu.png'} alt={item.nombre} className="w-full h-56 object-cover" />
        <div className="p-5 space-y-5">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{item.nombre}</h1>
            {item.descripcion && <p className="text-sm text-gray-500 mt-1 leading-relaxed">{item.descripcion}</p>}
            <p className="text-xl font-bold text-orange-500 mt-2">${Number(item.precioBase).toFixed(2)}</p>
          </div>

          {ingredientesOriginales.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Incluye</p>
              <div className="space-y-1">
                {ingredientesOriginales.map((ii) => (
                  <div key={ii.id} className="flex items-center justify-between py-2.5 border-b border-gray-50">
                    <span className={`text-sm ${removidos.has(ii.id) ? 'line-through text-gray-300' : 'text-gray-800'}`}>
                      {ii.ingrediente?.nombre ?? ii.ingredienteId}
                      {ii.ingrediente?.esAlergeno ? ' ⚠️' : ''}
                    </span>
                    {ii.esRemovible ? (
                      <button onClick={() => toggleRemovido(ii.id)} className="text-xs font-semibold text-orange-500 bg-orange-50 px-3 py-1 rounded-full">
                        {removidos.has(ii.id) ? 'Restaurar' : 'Quitar'}
                      </button>
                    ) : ii.esAgregable ? (
                      <div className="flex items-center gap-2">
                        {Number(ii.precioExtra) > 0 && (
                          <span className="text-xs text-orange-500 font-semibold">
                            +${Number(ii.precioExtra).toFixed(2)} c/u extra
                          </span>
                        )}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => cambiarCantidad(ii, -1)}
                            disabled={(agregados.get(ii.id) ?? 0) <= 0}
                            className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-700 text-base font-medium disabled:opacity-30"
                          >−</button>
                          <span className="text-sm font-bold text-gray-900 w-4 text-center">
                            {agregados.get(ii.id) ?? 0}
                          </span>
                          <button
                            onClick={() => cambiarCantidad(ii, 1)}
                            disabled={(agregados.get(ii.id) ?? 0) >= ii.cantidadMax}
                            className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-700 text-base font-medium disabled:opacity-30"
                          >+</button>
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-300">Fijo</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {ingredientesAgregables.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Extras opcionales</p>
              <div className="space-y-1">
                {ingredientesAgregables.map((ii) => {
                  const qty = agregados.get(ii.id) ?? 0
                  return (
                    <div key={ii.id} className="flex items-center justify-between py-2.5 border-b border-gray-50">
                      <div>
                        <p className="text-sm text-gray-800">{ii.ingrediente?.nombre ?? ii.ingredienteId}</p>
                        {Number(ii.precioExtra) > 0 && <p className="text-xs text-orange-500 font-semibold">+${Number(ii.precioExtra).toFixed(2)} c/u</p>}
                      </div>
                      <div className="flex items-center gap-3">
                        <button onClick={() => cambiarCantidad(ii, -1)} disabled={qty <= 0} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-700 text-base font-medium disabled:opacity-30">−</button>
                        <span className="text-sm font-bold text-gray-900 w-4 text-center">{qty}</span>
                        <button onClick={() => cambiarCantidad(ii, 1)} disabled={qty >= ii.cantidadMax} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-700 text-base font-medium disabled:opacity-30">+</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 bg-white">
        <div>
          <p className="text-xs text-gray-400">Total</p>
          <p className="text-xl font-bold text-orange-500">${precioTotal.toFixed(2)}</p>
        </div>
        <button
          onClick={() => {
            const modificaciones = [
              ...Array.from(removidos).map((id) => ({
                itemIngredienteId: id,
                accion: 'quitar' as const,
                cantidad: 1,
              })),
              ...Array.from(agregados.entries()).map(([id, qty]) => ({
                itemIngredienteId: id,
                accion: 'agregar' as const,
                cantidad: qty,
              })),
            ]
            agregar({
              itemMenuId: item.id,
              nombre: item.nombre,
              precioUnitario: precioTotal,
              cantidad: 1,
              modificaciones,
            })
            navigate('/carrito')
          }}
          className="px-6 py-3 bg-orange-500 text-white text-sm font-bold rounded-xl hover:bg-orange-600 transition-colors"
        >
          Agregar al carrito
        </button>
      </div>
    </div>
  )
}
