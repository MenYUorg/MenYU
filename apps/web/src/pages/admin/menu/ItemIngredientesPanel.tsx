import { useState, useEffect } from 'react'
import type { ItemIngrediente } from '@menyu/types'
import { useMenuStore } from '../../../store/menuStore'
import { api } from '../../../services/api'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Spinner } from '../../../components/ui/Spinner'

interface Props {
  itemId: string
  itemNombre: string
}

interface Row {
  assoc: ItemIngrediente
  esRemovible: boolean
  esAgregable: boolean
  precioExtra: string
  cantidadMax: string
  dirty: boolean
  saving: boolean
}

function toRow(assoc: ItemIngrediente): Row {
  return {
    assoc,
    esRemovible: assoc.esRemovible,
    esAgregable: assoc.esAgregable,
    precioExtra: assoc.precioExtra.toString(),
    cantidadMax: assoc.cantidadMax.toString(),
    dirty: false,
    saving: false,
  }
}

export function ItemIngredientesPanel({ itemId, itemNombre }: Props) {
  const { ingredientes } = useMenuStore()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState<string | null>(null)

  const [addIngredienteId, setAddIngredienteId] = useState('')
  const [addEsOriginal, setAddEsOriginal] = useState(true)
  const [addCantidad, setAddCantidad] = useState('1')
  const [addEsRemovible, setAddEsRemovible] = useState(false)
  const [addEsAgregable, setAddEsAgregable] = useState(false)
  const [addPrecioExtra, setAddPrecioExtra] = useState('0')
  const [addCantidadMin, setAddCantidadMin] = useState('0')
  const [addCantidadMax, setAddCantidadMax] = useState('1')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    api.items
      .get(itemId)
      .then((item) => {
        if (!cancelled) setRows((item.ingredientes ?? []).map(toRow))
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error al cargar ingredientes')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [itemId])

  const patch = (assocId: string, partial: Partial<Omit<Row, 'assoc'>>) =>
    setRows((prev) =>
      prev.map((r) => (r.assoc.id === assocId ? { ...r, ...partial, dirty: true } : r)),
    )

  const handleSave = async (row: Row) => {
    const precioExtra = parseFloat(row.precioExtra)
    const cantidadMax = parseInt(row.cantidadMax, 10)
    if (isNaN(precioExtra) || precioExtra < 0 || isNaN(cantidadMax) || cantidadMax < 1) {
      setError('Precio extra debe ser ≥ 0 y cantidad máxima ≥ 1')
      return
    }
    setError(null)
    setRows((prev) =>
      prev.map((r) => (r.assoc.id === row.assoc.id ? { ...r, saving: true } : r)),
    )
    try {
      await api.items.updateIngrediente(itemId, row.assoc.id, {
        esRemovible: row.esRemovible,
        esAgregable: row.esAgregable,
        precioExtra,
        cantidadMax,
      })
      setRows((prev) =>
        prev.map((r) => (r.assoc.id === row.assoc.id ? { ...r, dirty: false, saving: false } : r)),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
      setRows((prev) =>
        prev.map((r) => (r.assoc.id === row.assoc.id ? { ...r, saving: false } : r)),
      )
    }
  }

  const handleRemove = async (row: Row) => {
    const nombre = row.assoc.ingrediente?.nombre ?? 'este ingrediente'
    if (!window.confirm(`¿Quitar "${nombre}" de ${itemNombre}?`)) return
    setError(null)
    try {
      await api.items.removeIngrediente(itemId, row.assoc.id)
      setRows((prev) => prev.filter((r) => r.assoc.id !== row.assoc.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al quitar ingrediente')
    }
  }

  const handleAdd = async () => {
    if (!addIngredienteId) return
    const cantidad = parseInt(addCantidad, 10)
    const precioExtra = parseFloat(addPrecioExtra)
    const cantidadMin = parseInt(addCantidadMin, 10)
    const cantidadMax = parseInt(addCantidadMax, 10)
    if (isNaN(cantidad) || cantidad < 1 || isNaN(precioExtra) || precioExtra < 0 || isNaN(cantidadMin) || isNaN(cantidadMax) || cantidadMax < 1) {
      setError('Verificá los campos numéricos (cantidad ≥ 1, precio ≥ 0, cant. máx ≥ 1)')
      return
    }
    setError(null)
    setAdding(true)
    try {
      const updated = await api.items.addIngrediente(itemId, {
        ingredienteId: addIngredienteId,
        esOriginal: addEsOriginal,
        cantidad,
        esRemovible: addEsRemovible,
        esAgregable: addEsAgregable,
        precioExtra,
        cantidadMin,
        cantidadMax,
      })
      setRows((updated.ingredientes ?? []).map(toRow))
      setAddIngredienteId('')
      setAddEsOriginal(true)
      setAddCantidad('1')
      setAddEsRemovible(false)
      setAddEsAgregable(false)
      setAddPrecioExtra('0')
      setAddCantidadMin('0')
      setAddCantidadMax('1')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al agregar ingrediente')
    } finally {
      setAdding(false)
    }
  }

  const assignedIds = new Set(rows.map((r) => r.assoc.ingredienteId))
  const available = ingredientes.filter((i) => !assignedIds.has(i.id))

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
          Asignados ({rows.length})
        </p>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6 border border-dashed border-gray-200 rounded-lg">
            Sin ingredientes asignados todavía.
          </p>
        ) : (
          <div className="rounded-lg border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm bg-white">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-2 text-left">Ingrediente</th>
                  <th className="px-3 py-2 text-center">Removible</th>
                  <th className="px-3 py-2 text-center">Agregable</th>
                  <th className="px-3 py-2 text-center">Precio extra</th>
                  <th className="px-3 py-2 text-center">Cant. máx.</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => (
                  <tr key={row.assoc.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-gray-800">
                          {row.assoc.ingrediente?.nombre ?? row.assoc.ingredienteId}
                        </span>
                        {row.assoc.ingrediente?.esAlergeno && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                            ⚠️ Alérg.
                          </span>
                        )}
                        {row.assoc.esOriginal && (
                          <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                            orig.
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={row.esRemovible}
                        onChange={(e) => patch(row.assoc.id, { esRemovible: e.target.checked })}
                        className="cursor-pointer h-4 w-4"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={row.esAgregable}
                        onChange={(e) => patch(row.assoc.id, { esAgregable: e.target.checked })}
                        className="cursor-pointer h-4 w-4"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.precioExtra}
                        onChange={(e) => patch(row.assoc.id, { precioExtra: e.target.value })}
                        className="w-20 border border-gray-300 rounded-md px-2 py-1 text-sm text-center focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={row.cantidadMax}
                        onChange={(e) => patch(row.assoc.id, { cantidadMax: e.target.value })}
                        className="w-16 border border-gray-300 rounded-md px-2 py-1 text-sm text-center focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5 justify-end">
                        <Button
                          size="sm"
                          variant={row.dirty ? 'primary' : 'ghost'}
                          disabled={!row.dirty}
                          loading={row.saving}
                          onClick={() => handleSave(row)}
                        >
                          Guardar
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => handleRemove(row)}
                        >
                          Quitar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="border-t border-gray-100 pt-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
          Agregar ingrediente
        </p>

        {ingredientes.length === 0 ? (
          <p className="text-sm text-gray-400">
            No hay ingredientes creados. Creá ingredientes en la pestaña "Ingredientes" primero.
          </p>
        ) : available.length === 0 ? (
          <p className="text-sm text-gray-400">
            Todos los ingredientes disponibles ya están asignados a este ítem.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Ingrediente</label>
              <select
                value={addIngredienteId}
                onChange={(e) => setAddIngredienteId(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">— Seleccioná —</option>
                {available.map((ing) => (
                  <option key={ing.id} value={ing.id}>
                    {ing.nombre}
                    {ing.esAlergeno ? ' ⚠️' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={addEsOriginal}
                  onChange={(e) => setAddEsOriginal(e.target.checked)}
                  className="h-4 w-4 cursor-pointer"
                />
                Es original del plato
              </label>
              <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={addEsRemovible}
                  onChange={(e) => setAddEsRemovible(e.target.checked)}
                  className="h-4 w-4 cursor-pointer"
                />
                Removible
              </label>
              <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={addEsAgregable}
                  onChange={(e) => setAddEsAgregable(e.target.checked)}
                  className="h-4 w-4 cursor-pointer"
                />
                Agregable
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Input
                label="Cantidad base"
                type="number"
                min="1"
                step="1"
                value={addCantidad}
                onChange={(e) => setAddCantidad(e.target.value)}
              />
              <Input
                label="Precio extra ($)"
                type="number"
                min="0"
                step="0.01"
                value={addPrecioExtra}
                onChange={(e) => setAddPrecioExtra(e.target.value)}
              />
              <Input
                label="Cant. mín."
                type="number"
                min="0"
                step="1"
                value={addCantidadMin}
                onChange={(e) => setAddCantidadMin(e.target.value)}
              />
              <Input
                label="Cant. máx."
                type="number"
                min="1"
                step="1"
                value={addCantidadMax}
                onChange={(e) => setAddCantidadMax(e.target.value)}
              />
            </div>

            <div>
              <Button onClick={handleAdd} loading={adding} disabled={!addIngredienteId}>
                Asignar ingrediente
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
