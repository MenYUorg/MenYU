import { useEffect, useState } from 'react'
import { useAuthStore } from '../../store/authStore'
import { api } from '../../services/api'
import type { Admin } from '@menyu/types'

type GerenteConRestaurantes = Admin & {
  restaurantes: { restaurante: { id: string; nombre: string } }[]
}

export function GerentesPage() {
  const { selectedMarcaId, restaurantes } = useAuthStore()
  const [gerentes, setGerentes] = useState<GerenteConRestaurantes[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formEmail, setFormEmail] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [formLoading, setFormLoading] = useState(false)

  async function load() {
    if (!selectedMarcaId) return
    setLoading(true)
    setError(null)
    try {
      const data = await api.gerentes.list(selectedMarcaId)
      setGerentes(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar gerentes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [selectedMarcaId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function crearGerente() {
    if (!selectedMarcaId || !formEmail || !formPassword) return
    setFormLoading(true)
    setFormError(null)
    try {
      await api.gerentes.crear({ email: formEmail, password: formPassword, marcaId: selectedMarcaId })
      setFormEmail('')
      setFormPassword('')
      setShowForm(false)
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Error al crear gerente')
    } finally {
      setFormLoading(false)
    }
  }

  async function toggleRestaurante(adminId: string, restauranteId: string, tieneAcceso: boolean) {
    try {
      if (tieneAcceso) {
        await api.gerentes.desasignar(adminId, restauranteId)
      } else {
        await api.gerentes.asignar(adminId, restauranteId)
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al actualizar asignación')
    }
  }

  if (!selectedMarcaId) {
    return <div className="px-6 py-6 text-sm text-gray-500">Seleccioná una marca para ver los gerentes.</div>
  }

  return (
    <div className="px-6 py-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-base font-semibold text-gray-800">Gerentes de la marca</h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 transition-colors"
        >
          {showForm ? 'Cancelar' : '+ Nuevo gerente'}
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-100 rounded-md px-4 py-2.5 flex items-center justify-between">
          <p className="text-sm text-red-600">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-4">×</button>
        </div>
      )}

      {showForm && (
        <div className="mb-6 bg-white border border-gray-200 rounded-md p-4 space-y-3">
          <p className="text-sm font-medium text-gray-700">Crear nuevo gerente</p>
          {formError && <p className="text-xs text-red-500">{formError}</p>}
          <input
            type="email"
            placeholder="Email"
            value={formEmail}
            onChange={(e) => setFormEmail(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={formPassword}
            onChange={(e) => setFormPassword(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={crearGerente}
            disabled={formLoading || !formEmail || !formPassword}
            className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {formLoading ? 'Creando...' : 'Crear'}
          </button>
        </div>
      )}

      {loading && <p className="text-sm text-gray-400">Cargando...</p>}

      {!loading && gerentes.length === 0 && (
        <p className="text-sm text-gray-400">No hay gerentes en esta marca todavía.</p>
      )}

      <div className="space-y-4">
        {gerentes.map((gerente) => {
          const idsAsignados = new Set(gerente.restaurantes.map((r) => r.restaurante.id))

          return (
            <div key={gerente.id} className="bg-white border border-gray-200 rounded-md p-4">
              <p className="text-sm font-medium text-gray-800 mb-3">{gerente.email}</p>
              <p className="text-xs text-gray-400 mb-3">Restaurantes asignados:</p>
              <div className="space-y-1.5">
                {restaurantes.map((r) => {
                  const asignado = idsAsignados.has(r.id)
                  return (
                    <div key={r.id} className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id={`${gerente.id}-${r.id}`}
                        checked={asignado}
                        onChange={() => toggleRestaurante(gerente.id, r.id, asignado)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <label htmlFor={`${gerente.id}-${r.id}`} className="text-sm text-gray-700 cursor-pointer">
                        {r.nombre}
                      </label>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
