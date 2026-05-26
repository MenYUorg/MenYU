import { useEffect, useState, useCallback } from 'react'
import { useContextStore } from '../../../store/contextStore'
import { api } from '../../../services/api'
import type { SesionResumen } from '../../../services/api'

type Tab = 'activa' | 'efectivo_solicitado' | 'mp_pendiente' | 'cerradas_hoy'

const TABS: { key: Tab; label: string }[] = [
  { key: 'activa', label: 'Activas' },
  { key: 'efectivo_solicitado', label: 'Efectivo pendiente' },
  { key: 'mp_pendiente', label: 'MP pendiente' },
  { key: 'cerradas_hoy', label: 'Cerradas hoy' },
]

function esHoy(isoString: string): boolean {
  const hoy = new Date()
  const fecha = new Date(isoString)
  return (
    fecha.getFullYear() === hoy.getFullYear() &&
    fecha.getMonth() === hoy.getMonth() &&
    fecha.getDate() === hoy.getDate()
  )
}

function filtrar(sesiones: SesionResumen[], tab: Tab): SesionResumen[] {
  if (tab === 'cerradas_hoy') {
    return sesiones.filter((s) => s.estado === 'cerrada' && s.cerradaEn != null && esHoy(s.cerradaEn))
  }
  return sesiones.filter((s) => s.estado === tab)
}

const ESTADO_BADGE: Record<SesionResumen['estado'], { bg: string; label: string }> = {
  activa: { bg: 'bg-blue-100 text-blue-700', label: 'Activa' },
  efectivo_solicitado: { bg: 'bg-yellow-100 text-yellow-700', label: 'Efectivo pendiente' },
  mp_pendiente: { bg: 'bg-purple-100 text-purple-700', label: 'MP pendiente' },
  cerrada: { bg: 'bg-green-100 text-green-700', label: 'Cerrada' },
}

function Badge({ estado }: { estado: SesionResumen['estado'] }) {
  const { bg, label } = ESTADO_BADGE[estado]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${bg}`}>
      {label}
    </span>
  )
}

function SesionCard({
  sesion,
  onConfirmar,
  confirmando,
}: {
  sesion: SesionResumen
  onConfirmar: (id: string) => void
  confirmando: boolean
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-bold text-gray-900 text-base">Mesa {sesion.mesaNumero}</span>
        <Badge estado={sesion.estado} />
      </div>

      {sesion.pedidos.length > 0 && (
        <div className="space-y-1">
          {sesion.pedidos.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-xs text-gray-500">
              <span className="font-mono text-gray-400">{p.id.slice(0, 8)}…</span>
              <span className="capitalize">{p.estado}</span>
              <span className="font-medium text-gray-700">${p.total.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-gray-100 pt-2">
        <span className="text-sm text-gray-500">Total</span>
        <span className="text-lg font-bold text-gray-900">${sesion.total.toFixed(2)}</span>
      </div>

      {sesion.cerradaEn && (
        <p className="text-xs text-gray-400">
          Cerrada:{' '}
          {new Date(sesion.cerradaEn).toLocaleTimeString('es-AR', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      )}

      {sesion.estado === 'efectivo_solicitado' && (
        <button
          onClick={() => onConfirmar(sesion.sesionId)}
          disabled={confirmando}
          className="w-full py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
        >
          {confirmando ? 'Confirmando…' : 'Confirmar pago en efectivo'}
        </button>
      )}
    </div>
  )
}

export function PagosPage() {
  const { selectedRestauranteId } = useContextStore()
  const [sesiones, setSesiones] = useState<SesionResumen[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('activa')
  const [confirmando, setConfirmando] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!selectedRestauranteId) return
    try {
      const data = await api.pagos.listSesiones(selectedRestauranteId)
      setSesiones(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar sesiones')
    }
  }, [selectedRestauranteId])

  useEffect(() => {
    setLoading(true)
    void cargar().finally(() => setLoading(false))
    const interval = setInterval(() => { void cargar() }, 30_000)
    return () => clearInterval(interval)
  }, [cargar])

  const handleConfirmar = async (sesionId: string) => {
    setConfirmando(sesionId)
    try {
      await api.pagos.confirmarEfectivo(sesionId)
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al confirmar pago')
    } finally {
      setConfirmando(null)
    }
  }

  if (!selectedRestauranteId) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        Seleccioná un restaurante para ver la caja
      </div>
    )
  }

  const filtradas = filtrar(sesiones, tab)

  return (
    <div className="px-6 py-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-gray-900">Caja</h2>
        <span className="text-xs text-gray-400">Actualización automática cada 30s</span>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2 mb-4">
          {error}
        </p>
      )}

      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
              tab === t.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-xs text-gray-400">
              ({filtrar(sesiones, t.key).length})
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Cargando sesiones…</p>
      ) : filtradas.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl">
          No hay sesiones en esta categoría
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtradas.map((sesion) => (
            <SesionCard
              key={sesion.sesionId}
              sesion={sesion}
              onConfirmar={(id) => void handleConfirmar(id)}
              confirmando={confirmando === sesion.sesionId}
            />
          ))}
        </div>
      )}
    </div>
  )
}
