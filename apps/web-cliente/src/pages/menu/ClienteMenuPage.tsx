import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePublicMenuStore } from '../../store/publicMenuStore'
import { useSessionStore } from '../../store/sessionStore'
import { useCarritoStore } from '../../store/carritoStore'
import { Spinner } from '@menyu/ui'
import { api } from '../../services/api'
import type { MenuPublicoCategoria, MenuPublicoItem } from '@menyu/types'

type MozoStatus = 'idle' | 'loading' | 'ok' | 'error'

function LlamarMozoBtn({ sesionId, jwt }: { sesionId: string; jwt: string }) {
  const [status, setStatus] = useState<MozoStatus>('idle')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function handleClick() {
    if (status !== 'idle') return
    setStatus('loading')
    try {
      await api.waiterCalls.llamar(sesionId, jwt)
      setStatus('ok')
    } catch {
      setStatus('error')
    }
    timerRef.current = setTimeout(() => setStatus('idle'), 3000)
  }

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  const label =
    status === 'loading' ? 'Llamando…' :
    status === 'ok'      ? '¡Mozo en camino!' :
    status === 'error'   ? 'Error, intentá de nuevo' :
                           'Llamar al mozo'

  const color =
    status === 'ok'    ? 'bg-green-500 border-green-500 text-white' :
    status === 'error' ? 'bg-red-100 border-red-400 text-red-700' :
                         'bg-white border-orange-400 text-orange-500 hover:bg-orange-50'

  return (
    <button
      onClick={() => void handleClick()}
      disabled={status !== 'idle'}
      className={`w-full py-3 rounded-xl border font-semibold text-sm transition-colors disabled:cursor-not-allowed ${color}`}
    >
      {label}
    </button>
  )
}

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
  const { restauranteId, sesionId, jwt, openSession, loading: sessionLoading, error: sessionError } =
    useSessionStore()
  const carritoCount = useCarritoStore((s) => s.items.length)
  const { menu, loading, error, fetchMenu } = usePublicMenuStore()
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null)
  const [buscar, setBuscar] = useState('')
  const [checkInPin, setCheckInPin] = useState('')
  const [checkInRestauranteId, setCheckInRestauranteId] = useState('')

  useEffect(() => {
    if (restauranteId && !menu) void fetchMenu(restauranteId)
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
              <label className="block text-sm font-medium text-gray-700 mb-1">ID del restaurante</label>
              <input type="text" value={checkInRestauranteId} onChange={(e) => setCheckInRestauranteId(e.target.value)} placeholder="UUID del restaurante" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <div className="flex-1 h-px bg-gray-200" /> o <div className="flex-1 h-px bg-gray-200" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PIN de la mesa</label>
              <input type="text" value={checkInPin} onChange={(e) => setCheckInPin(e.target.value)} placeholder="Ej: 1234" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </div>
            {sessionError && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{sessionError}</p>}
            <button type="submit" disabled={sessionLoading || (!checkInRestauranteId.trim() && !checkInPin.trim())} className="w-full py-2.5 bg-orange-500 text-white text-sm font-semibold rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {sessionLoading ? 'Conectando…' : 'Ver menú'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (loading) return <div className="flex items-center justify-center h-screen"><Spinner size="lg" /></div>

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 p-6">
        <p className="text-red-600 text-sm text-center">{error}</p>
        <button onClick={() => restauranteId && void fetchMenu(restauranteId)} className="text-orange-500 text-sm font-semibold">Reintentar</button>
      </div>
    )
  }

  if (!menu) return null

  const buscarLower = buscar.toLowerCase().trim()
  const categoriasFiltradas: MenuPublicoCategoria[] = menu.categorias
    .map((cat) => ({
      ...cat,
      itemsDirectos: cat.itemsDirectos.filter((item) => buscarLower ? item.nombre.toLowerCase().includes(buscarLower) : true),
    }))
    .filter((cat) => cat.itemsDirectos.length > 0)

  const categoriaVisible = categoriaActiva
    ? categoriasFiltradas.find((c) => c.id === categoriaActiva) ?? categoriasFiltradas[0]
    : categoriasFiltradas[0]

  return (
    <div className="flex flex-col h-screen bg-white">
      <header className="flex items-center px-4 py-3 border-b border-gray-100 bg-white">
        <span className="text-base font-bold text-gray-900 flex-1">{menu.restaurante.nombre}</span>
        {carritoCount > 0 && (
          <button
            onClick={() => navigate('/carrito')}
            className="relative flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white text-xs font-bold rounded-full hover:bg-orange-600 transition-colors"
          >
            🛒 {carritoCount}
          </button>
        )}
      </header>
      {sesionId && jwt && (
        <div className="px-4 pt-3 pb-1">
          <LlamarMozoBtn sesionId={sesionId} jwt={jwt} />
        </div>
      )}
      <div className="px-4 py-2 border-b border-gray-100">
        <input type="text" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar en el menú…" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-300" />
      </div>
      <div className="flex overflow-x-auto border-b border-gray-100 bg-white shrink-0 scrollbar-none">
        {categoriasFiltradas.map((cat) => (
          <button key={cat.id} onClick={() => setCategoriaActiva(cat.id)} className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${categoriaActiva === cat.id ? 'border-orange-500 text-orange-500' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {cat.nombre}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-2">
          {categoriaVisible?.itemsDirectos.map((item) => (
            <ItemCard key={item.id} item={item} onPress={() => navigate(`/menu/${item.id}`)} />
          ))}
        </div>
        {categoriasFiltradas.length === 0 && <p className="text-center text-gray-400 text-sm mt-12">No hay ítems que coincidan con la búsqueda.</p>}
      </div>
    </div>
  )
}
