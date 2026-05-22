import { useEffect, useState } from 'react'
import { useAuth } from '@menyu/auth'
import { Badge } from '@menyu/ui'
import type { Pedido } from '@menyu/types'
import { useMozoStore } from '../../store/mozoStore'
import * as socketService from '../../services/socket'

// Tipos locales para el payload rico del socket (igual que CocinaPage)
interface ItemRico {
  id: string
  cantidad: number
  item?: { nombre: string }
}
interface PedidoRico extends Omit<Pedido, 'items'> {
  mesa?: { numero: string }
  items?: ItemRico[]
}

function formatHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

function PedidoListoCard({
  pedido,
  onEntregado,
}: {
  pedido: Pedido
  onEntregado: () => Promise<void>
}) {
  const [loading, setLoading] = useState(false)
  const rico = pedido as PedidoRico
  const mesaLabel = rico.mesa?.numero ? `Mesa ${rico.mesa.numero}` : `#${pedido.sesionId.slice(0, 6)}`

  async function handleEntregado() {
    if (loading) return
    setLoading(true)
    try {
      await onEntregado()
    } catch (e) {
      console.error('Error al marcar entregado:', e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-green-100 px-5 py-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-1">
          <p className="text-sm font-bold text-gray-900">
            {mesaLabel}{' '}
            <span className="text-xs font-normal text-gray-400">{formatHora(pedido.createdAt)}</span>
          </p>
          <ul className="text-xs text-gray-600 space-y-0.5">
            {rico.items?.map((item) => (
              <li key={item.id}>
                {item.cantidad}× {item.item?.nombre ?? `ítem ${item.id.slice(0, 6)}`}
              </li>
            ))}
          </ul>
        </div>
        <button
          onClick={() => void handleEntregado()}
          disabled={loading}
          className="px-4 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          {loading ? 'Guardando…' : 'Entregado'}
        </button>
      </div>
    </div>
  )
}

export function MozoPanel() {
  const { user, logout } = useAuth()
  const { llamados, addLlamado, marcarAtendido, pedidosListos, agregarPedidoListo, marcarEntregado, restauranteId: restauranteIdStore } =
    useMozoStore()
  const { getToken } = useAuth()

  const API = import.meta.env.VITE_API_URL ?? ''

  useEffect(() => {
    const restauranteId = user?.restauranteId ?? restauranteIdStore
    if (!restauranteId) return

    // Cargar pedidos listos existentes al montar
    const token = getToken()
    if (token) {
      void fetch(`${API}/pedidos?restauranteId=${restauranteId}&estado=listo`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((pedidos: Pedido[]) => pedidos.forEach(agregarPedidoListo))
        .catch(() => undefined)
    }

    socketService.joinRestauranteComoMozo(restauranteId)

    const unsubLlamado = socketService.onMozoCalled((data) => {
      addLlamado(data)
    })

    const unsubPedido = socketService.onPedidoActualizado((pedido) => {
      if (pedido.estado === 'listo') {
        agregarPedidoListo(pedido)
      }
    })

    return () => {
      unsubLlamado()
      unsubPedido()
      socketService.disconnect()
    }
  }, [user?.restauranteId, restauranteIdStore]) // eslint-disable-line react-hooks/exhaustive-deps

  const pendientes = llamados.filter((l) => !l.atendido)
  const atendidos = llamados.filter((l) => l.atendido)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <span className="text-lg font-bold text-indigo-600">MenYu</span>
          <span className="ml-2 text-xs text-gray-400 font-medium">Mozo</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{user?.email}</span>
          <button
            onClick={logout}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-8">

        {/* Pedidos listos para entregar — siempre visible */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-base font-bold text-gray-900">Listos para entregar</h2>
            {pedidosListos.length > 0 && <Badge variant="success">{pedidosListos.length}</Badge>}
          </div>
          {pedidosListos.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 px-6 py-8 text-center">
              <p className="text-sm text-gray-400">Sin pedidos listos</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pedidosListos.map((p) => (
                <PedidoListoCard
                  key={p.id}
                  pedido={p}
                  onEntregado={() => {
                    const jwt = getToken()
                    if (!jwt) return Promise.reject(new Error('Sin JWT'))
                    return marcarEntregado(p.id, jwt)
                  }}
                />
              ))}
            </div>
          )}
        </section>

        {/* Llamados pendientes */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-base font-bold text-gray-900">Llamados pendientes</h2>
            {pendientes.length > 0 && <Badge variant="error">{pendientes.length}</Badge>}
          </div>
          {pendientes.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 px-6 py-10 text-center">
              <p className="text-2xl mb-2">✓</p>
              <p className="text-sm text-gray-400">Sin llamados pendientes</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pendientes.map((l) => (
                <div
                  key={l.sesionId}
                  className="bg-white rounded-xl border border-red-100 px-5 py-4 flex items-center justify-between shadow-sm"
                >
                  <div>
                    <p className="text-sm font-bold text-gray-900">
                      Mesa <span className="text-red-600">{l.mesaNumero}</span>
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {l.recibitoEn.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <button
                    onClick={() => marcarAtendido(l.sesionId)}
                    className="px-4 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    Atendido
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Historial de llamados */}
        {atendidos.length > 0 && (
          <section>
            <h2 className="text-base font-bold text-gray-900 mb-4">Historial de hoy</h2>
            <div className="space-y-2">
              {atendidos.map((l) => (
                <div
                  key={l.sesionId}
                  className="bg-white rounded-xl border border-gray-100 px-5 py-3 flex items-center justify-between opacity-60"
                >
                  <p className="text-sm text-gray-600">Mesa {l.mesaNumero}</p>
                  <Badge variant="success">Atendido</Badge>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
