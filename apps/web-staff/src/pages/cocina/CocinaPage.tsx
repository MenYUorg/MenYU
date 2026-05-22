import { useEffect, useState } from 'react'
import { useAuth } from '@menyu/auth'
import type { Pedido, EstadoPedido } from '@menyu/types'
import { useCocinaStore } from '../../store/cocinaStore'
import { useMozoStore } from '../../store/mozoStore'
import * as socketService from '../../services/socket'

// El backend envía datos más ricos que los de @menyu/types.
// Estos tipos locales reflejan el payload real del socket.
interface IngredienteInfo { nombre: string }
interface ItemIngredienteRico { ingrediente?: IngredienteInfo }
interface ModRico {
  pedidoItemId: string
  itemIngredienteId: string
  accion: string   // 'AGREGAR' | 'QUITAR' (mayúsculas, tal como llega del backend)
  cantidad: number
  itemIngrediente?: ItemIngredienteRico
}
interface ItemRico {
  id: string
  cantidad: number
  precioUnitario: number
  notas: string | null
  item?: { nombre: string }
  mods?: ModRico[]
}
interface PedidoRico extends Omit<Pedido, 'items'> {
  mesa?: { numero: string }
  items?: ItemRico[]
}

// ─── Config de columnas ───────────────────────────────────────────────────────

interface Columna {
  estado: EstadoPedido
  label: string
  topColor: string
  badgeColor: string
  next?: EstadoPedido
  nextLabel?: string
}

const COLUMNAS: Columna[] = [
  {
    estado: 'pendiente',
    label: 'Pendiente',
    topColor: 'border-yellow-500',
    badgeColor: 'bg-yellow-500/20 text-yellow-300',
    next: 'en_preparacion',
    nextLabel: 'Iniciar preparación',
  },
  {
    estado: 'en_preparacion',
    label: 'En preparación',
    topColor: 'border-blue-500',
    badgeColor: 'bg-blue-500/20 text-blue-300',
    next: 'listo',
    nextLabel: 'Marcar listo',
  },
  {
    estado: 'listo',
    label: 'Listo',
    topColor: 'border-green-500',
    badgeColor: 'bg-green-500/20 text-green-300',
  },
  {
    estado: 'entregado',
    label: 'Entregado',
    topColor: 'border-gray-600',
    badgeColor: 'bg-gray-700 text-gray-400',
  },
]

const API = import.meta.env.VITE_API_URL ?? ''

// ─── Tarjeta de pedido ────────────────────────────────────────────────────────

function formatHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

interface PedidoCardProps {
  pedido: Pedido
  nextEstado?: EstadoPedido
  nextLabel?: string
  token: string | null
  onEstadoActualizado: (pedido: Pedido) => void
}

function PedidoCard({ pedido, nextEstado, nextLabel, token, onEstadoActualizado }: PedidoCardProps) {
  const [loading, setLoading] = useState(false)
  const rico = pedido as PedidoRico
  const mesaLabel = rico.mesa?.numero
    ? `Mesa ${rico.mesa.numero}`
    : `#${pedido.sesionId.slice(0, 6)}`

  async function handleAvanzar() {
    if (!nextEstado || !token || loading) return
    setLoading(true)
    try {
      const res = await fetch(`${API}/pedidos/${pedido.id}/estado`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ estado: nextEstado }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as Record<string, unknown>
        console.error('Error al actualizar estado:', err['message'] ?? res.status)
        return
      }
      const actualizado = await res.json() as Pedido
      onEstadoActualizado(actualizado)
    } catch (e) {
      console.error('Error de red al actualizar estado:', e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 space-y-3 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="font-bold text-white text-sm">{mesaLabel}</span>
        <span className="text-xs text-gray-500">{formatHora(pedido.createdAt)}</span>
      </div>

      {/* Items */}
      <div className="space-y-2">
        {rico.items?.map((item) => (
          <div key={item.id}>
            <p className="text-sm text-gray-100">
              <span className="font-semibold text-white">{item.cantidad}×</span>{' '}
              {item.item?.nombre ?? `ítem ${item.id.slice(0, 6)}`}
            </p>

            {item.notas && (
              <p className="text-xs text-yellow-400 ml-3 mt-0.5 italic">
                "{item.notas}"
              </p>
            )}

            {item.mods && item.mods.length > 0 && (
              <ul className="ml-3 mt-1 space-y-0.5">
                {item.mods.map((mod, i) => {
                  const esAgregar = mod.accion?.toUpperCase() === 'AGREGAR'
                  const nombre = mod.itemIngrediente?.ingrediente?.nombre ?? 'ingrediente'
                  return (
                    <li
                      key={i}
                      className={`text-xs font-medium ${esAgregar ? 'text-green-400' : 'text-red-400'}`}
                    >
                      {esAgregar
                        ? `+ ${nombre}${Number(mod.cantidad) > 1 ? ` ×${mod.cantidad}` : ''}`
                        : `− ${nombre}`}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        ))}
      </div>

      {/* Botón avanzar */}
      {nextEstado && nextLabel && (
        <button
          onClick={handleAvanzar}
          disabled={loading}
          className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:bg-indigo-900 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-colors"
        >
          {loading ? 'Actualizando…' : nextLabel}
        </button>
      )}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export function CocinaPage() {
  const { user, logout, getToken } = useAuth()
  const { pedidos, agregarPedido, actualizarEstado } = useCocinaStore()
  const restauranteIdStore = useMozoStore((s) => s.restauranteId)

  useEffect(() => {
    const restauranteId = user?.restauranteId ?? restauranteIdStore
    if (!restauranteId) return

    socketService.joinRestauranteComoCocina(restauranteId)

    const unsubNuevo = socketService.onPedidoNuevo((pedido) => {
      agregarPedido(pedido)
    })

    const unsubActualizado = socketService.onPedidoActualizado((pedido) => {
      actualizarEstado(pedido.id, pedido.estado)
    })

    return () => {
      unsubNuevo()
      unsubActualizado()
      socketService.disconnect()
    }
  }, [user?.restauranteId, restauranteIdStore]) // eslint-disable-line react-hooks/exhaustive-deps

  const token = getToken()

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-700 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-orange-400">MenYu</span>
          <span className="text-xs text-gray-500 font-medium">Cocina</span>
        </div>
        <button
          onClick={logout}
          className="text-xs text-gray-400 hover:text-red-400 transition-colors"
        >
          Cerrar sesión
        </button>
      </header>

      {/* Kanban */}
      <main className="flex-1 overflow-x-auto px-4 py-6">
        <div className="flex gap-4" style={{ minWidth: `${COLUMNAS.length * 19}rem` }}>
          {COLUMNAS.map(({ estado, label, topColor, badgeColor, next, nextLabel }) => {
            const columna = pedidos.filter((p) => p.estado === estado)

            return (
              <div key={estado} className={`flex-1 min-w-[17rem] border-t-2 ${topColor} pt-4`}>
                {/* Cabecera columna */}
                <div className="flex items-center gap-2 mb-4 px-1">
                  <h2 className="text-xs font-bold text-gray-300 uppercase tracking-widest">
                    {label}
                  </h2>
                  {columna.length > 0 && (
                    <span className={`text-xs rounded-full px-2 py-0.5 font-semibold ${badgeColor}`}>
                      {columna.length}
                    </span>
                  )}
                </div>

                {/* Tarjetas */}
                <div className="space-y-3">
                  {columna.length === 0 ? (
                    <p className="text-xs text-gray-700 text-center py-10">Sin pedidos</p>
                  ) : (
                    columna.map((pedido) => (
                      <PedidoCard
                        key={pedido.id}
                        pedido={pedido}
                        nextEstado={next}
                        nextLabel={nextLabel}
                        token={token}
                        onEstadoActualizado={(p) => actualizarEstado(p.id, p.estado)}
                      />
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}
