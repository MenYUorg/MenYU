import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuthStore } from '../../../store/authStore'
import { api } from '../../../services/api'
import type { MesaConQr } from '../../../services/api'

function QrModal({ mesa, onClose }: { mesa: MesaConQr; onClose: () => void }) {
  const copiar = () => {
    navigator.clipboard.writeText(mesa.qrToken).catch(() => undefined)
  }

  const descargar = () => {
    const a = document.createElement('a')
    a.href = mesa.qrImage
    a.download = `mesa-${mesa.numero}-qr.png`
    a.click()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl">
        <h3 className="text-base font-bold text-gray-900 mb-1">Mesa {mesa.numero} — QR</h3>
        <p className="text-xs text-gray-400 mb-4 font-mono">{mesa.qrToken}</p>
        <img src={mesa.qrImage} alt="QR de la mesa" className="w-full rounded-lg border border-gray-100" />
        <div className="flex gap-2 mt-4">
          <button
            onClick={descargar}
            className="flex-1 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Descargar PNG
          </button>
          <button
            onClick={copiar}
            className="flex-1 py-2 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 transition-colors"
          >
            Copiar token
          </button>
        </div>
        <button
          onClick={onClose}
          className="w-full mt-2 py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          Cerrar
        </button>
      </div>
    </div>
  )
}

export function TablesPage() {
  const { selectedRestauranteId } = useAuthStore()
  const [mesas, setMesas] = useState<MesaConQr[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [qrMesa, setQrMesa] = useState<MesaConQr | null>(null)

  const [newNumero, setNewNumero] = useState('')
  const [creating, setCreating] = useState(false)

  const cargarMesas = async () => {
    if (!selectedRestauranteId) return
    setLoading(true)
    setError(null)
    try {
      const data = await api.mesas.list(selectedRestauranteId)
      setMesas(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar mesas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void cargarMesas()
  }, [selectedRestauranteId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!newNumero.trim() || !selectedRestauranteId) return
    setCreating(true)
    try {
      const m = await api.mesas.create({ restauranteId: selectedRestauranteId, numero: newNumero.trim() })
      setMesas((prev) => [...prev, m])
      setNewNumero('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear mesa')
    } finally {
      setCreating(false)
    }
  }

  const handleToggleActiva = async (mesa: MesaConQr) => {
    try {
      await api.mesas.update(mesa.id, { activo: !mesa.activo })
      setMesas((prev) =>
        prev.map((m) => (m.id === mesa.id ? { ...m, activo: !m.activo } : m)),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al actualizar mesa')
    }
  }

  const handleRegenerarQr = async (id: string) => {
    try {
      const updated = await api.mesas.regenerarQr(id)
      setMesas((prev) => prev.map((m) => (m.id === id ? updated : m)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al regenerar QR')
    }
  }

  if (!selectedRestauranteId) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        Seleccioná un restaurante para ver las mesas
      </div>
    )
  }

  return (
    <div className="px-6 py-6">
      <h2 className="text-lg font-bold text-gray-900 mb-5">Gestión de mesas</h2>

      <form onSubmit={(e) => void handleCreate(e)} className="flex gap-3 mb-6">
        <input
          value={newNumero}
          onChange={(e) => setNewNumero(e.target.value)}
          placeholder="Número de mesa (ej: 1, A1, VIP)"
          className="flex-1 max-w-xs border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={creating || !newNumero.trim()}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {creating ? 'Creando…' : 'Agregar mesa'}
        </button>
      </form>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2 mb-4">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Cargando mesas…</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm bg-white">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">Mesa</th>
                <th className="px-4 py-3 text-left">PIN</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-left">Activa</th>
                <th className="px-4 py-3 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {mesas.map((mesa) => (
                <tr key={mesa.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-gray-900">{mesa.numero}</td>
                  <td className="px-4 py-3 font-mono text-gray-500">{mesa.pin}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      mesa.estado === 'libre'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-orange-100 text-orange-700'
                    }`}>
                      {mesa.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={mesa.activo}
                      onChange={() => void handleToggleActiva(mesa)}
                      className="cursor-pointer h-4 w-4 accent-indigo-600"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setQrMesa(mesa)}
                        className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                      >
                        Ver QR
                      </button>
                      <button
                        onClick={() => void handleRegenerarQr(mesa.id)}
                        className="px-3 py-1 text-xs bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-md hover:bg-indigo-100 transition-colors"
                      >
                        Regenerar QR
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {mesas.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center text-gray-400 text-sm">
                    No hay mesas. Agregá la primera.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {qrMesa && <QrModal mesa={qrMesa} onClose={() => setQrMesa(null)} />}
    </div>
  )
}
