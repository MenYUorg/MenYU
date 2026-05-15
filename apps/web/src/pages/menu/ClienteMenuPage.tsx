import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePublicMenuStore } from '../../store/publicMenuStore'
import { useSessionStore } from '../../store/sessionStore'
import { Spinner } from '../../components/ui/Spinner'
import type { MenuPublicoCategoria, MenuPublicoItem } from '@menyu/types'

function ItemCard({ item, onPress }: { item: MenuPublicoItem; onPress: () => void }) {
  return (
    <button
      onClick={onPress}
      className="w-full flex items-center gap-3 bg-white border border-gray-100 rounded-xl overflow-hidden hover:border-orange-200 hover:bg-orange-50/30 transition-colors text-left"
    >
      <img
        src={item.imagenUrl || '/src/assets/predeterminada_menu.png'}
        alt={item.nombre}
        className="w-20 h-20 object-cover shrink-0"
      />
      <div className="flex-1 py-3 pr-3">
        <p className="text-sm font-bold text-gray-900">{item.nombre}</p>
        {item.descripcion && (
          <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{item.descripcion}</p>
        )}
        <p className="text-sm font-bold text-orange-500 mt-1">
          ${Number(item.precioBase).toFixed(2)}
        </p>
      </div>
    </button>
  )
}

export function ClienteMenuPage() {
  const navigate = useNavigate()
  const { restauranteId, openSession, loading: sessionLoading, error: sessionError } = useSessionStore()
  const { menu, loading, error, fetchMenu } = usePublicMenuStore()

  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null)
  const [buscar, setBuscar] = useState('')

  const [checkInPin, setCheckInPin] = useState('')
  const [checkInRestauranteId, setCheckInRestauranteId] = useState('')

  useEffect(() => {
    if (restauranteId && !menu) {
      void fetchMenu(restauranteId)
    }
  }, [restauranteId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (menu && menu.categorias.length > 0 && !categoriaActiva) {
      setCategoriaActiva(menu.categorias[0]?.id ?? null)
    }
  }, [menu]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCheckIn = async (e: React.FormEvent) => {
    e.preventDefault()
    const rid = checkInRestauranteId.trim() || undefined
    const pin = checkInPin.trim() || undefined
    if (!rid && !pin) return
    await openSession({ restauranteId: rid, pin })
    if (rid) void fetchMenu(rid)
  }

  if (!restauranteId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 w-full max-w-sm p-8">
          <div className="mb-6 text-center">
            <span className="text-2xl font-bold text-orange-500">MenYu</span>
            <p className="text-sm text-gray-500 mt-1">Ingresá el código del restaurante</p>
          </div>

          <form onSubmit={(e) => void handleCheckIn(e)} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ID del restaurante
              </label>
              <input
                type="text"
                value={checkInRestauranteId}
                onChange={(e) => setCheckInRestauranteId(e.target.value)}
                placeholder="UUID del restaurante"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <div className="flex-1 h-px bg-gray-200" />
              o
              <div className="flex-1 h-px bg-gray-200" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                PIN de la mesa
              </label>
              <input
                type="text"
                value={checkInPin}
                onChange={(e) => setCheckInPin(e.target.value)}
                placeholder="Ej: 1234"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>

            {sessionError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                {sessionError}
              </p>
            )}

            <button
              type="submit"
              disabled={sessionLoading || (!checkInRestauranteId.trim() && !checkInPin.trim())}
              className="w-full py-2.5 bg-orange-500 text-white text-sm font-semibold rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sessionLoading ? 'Conectando…' : 'Ver menú'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 p-6">
        <p className="text-red-600 text-sm text-center">{error}</p>
        <button
          onClick={() => restauranteId && void fetchMenu(restauranteId)}
          className="text-orange-500 text-sm font-semibold"
        >
          Reintentar
        </button>
      </div>
    )
  }

  if (!menu) return null

  const buscarLower = buscar.toLowerCase().trim()

  const categoriasFiltradas: MenuPublicoCategoria[] = menu.categorias
    .map((cat) => ({
      ...cat,
      itemsDirectos: cat.itemsDirectos.filter((item) =>
        buscarLower ? item.nombre.toLowerCase().includes(buscarLower) : true,
      ),
      subcategorias: cat.subcategorias
        .map((sub) => ({
          ...sub,
          items: sub.items.filter((item) =>
            buscarLower ? item.nombre.toLowerCase().includes(buscarLower) : true,
          ),
        }))
        .filter((sub) => sub.items.length > 0),
    }))
    .filter((cat) => cat.subcategorias.length > 0 || cat.itemsDirectos.length > 0)

  const categoriaVisible = categoriaActiva
    ? categoriasFiltradas.find((c) => c.id === categoriaActiva) ?? categoriasFiltradas[0]
    : categoriasFiltradas[0]

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <header className="flex items-center px-4 py-3 border-b border-gray-100 bg-white">
        <span className="text-base font-bold text-gray-900 flex-1">{menu.restaurante.nombre}</span>
      </header>

      {/* Buscador */}
      <div className="px-4 py-2 border-b border-gray-100">
        <input
          type="text"
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          placeholder="Buscar en el menú…"
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-300"
        />
      </div>

      {/* Tabs de categorías */}
      <div className="flex overflow-x-auto border-b border-gray-100 bg-white shrink-0 scrollbar-none">
        {categoriasFiltradas.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setCategoriaActiva(cat.id)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              categoriaActiva === cat.id
                ? 'border-orange-500 text-orange-500'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {cat.nombre}
          </button>
        ))}
      </div>

      {/* Ítems */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Ítems directo en la categoría (sin subcategoría) */}
        {(categoriaVisible?.itemsDirectos.length ?? 0) > 0 && (
          <div className="space-y-2">
            {categoriaVisible!.itemsDirectos.map((item) => (
              <ItemCard key={item.id} item={item} onPress={() => navigate(`/menu/${item.id}`)} />
            ))}
          </div>
        )}

        {/* Ítems agrupados por subcategoría */}
        {categoriaVisible?.subcategorias.map((sub) => (
          <div key={sub.id}>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
              {sub.nombre}
            </p>
            <div className="space-y-2">
              {sub.items.map((item) => (
                <ItemCard key={item.id} item={item} onPress={() => navigate(`/menu/${item.id}`)} />
              ))}
            </div>
          </div>
        ))}

        {categoriasFiltradas.length === 0 && (
          <p className="text-center text-gray-400 text-sm mt-12">
            No hay ítems que coincidan con la búsqueda.
          </p>
        )}
      </div>
    </div>
  )
}
