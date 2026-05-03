import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Ingrediente } from '@menyu/types'
import { useAuthStore } from '../../store/authStore'
import { useMenuStore } from '../../store/menuStore'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Spinner } from '../../components/ui/Spinner'

function IngredienteRow({
  ing,
  onUpdate,
  onDelete,
}: {
  ing: Ingrediente
  onUpdate: (id: string, nombre: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(ing.nombre)
  const [saving, setSaving] = useState(false)

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    if (!editName.trim()) return
    setSaving(true)
    try {
      await onUpdate(ing.id, editName.trim())
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEditName(ing.nombre)
    setEditing(false)
  }

  return (
    <div className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 group transition-colors">
      {editing ? (
        <form onSubmit={handleSave} className="flex items-center gap-2 flex-1">
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="py-1 text-sm w-48"
            autoFocus
          />
          <Button type="submit" size="sm" loading={saving}>
            Guardar
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={handleCancel}>
            Cancelar
          </Button>
        </form>
      ) : (
        <>
          <span className="text-sm text-gray-800">{ing.nombre}</span>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              Editar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (window.confirm(`¿Eliminar ingrediente "${ing.nombre}"?`)) {
                  onDelete(ing.id).catch(() => undefined)
                }
              }}
              className="text-red-500 hover:text-red-600"
            >
              Eliminar
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

export function IngredientesTab() {
  const { selectedRestauranteId } = useAuthStore()
  const { ingredientes, loading, createIngrediente, updateIngrediente, deleteIngrediente, error } =
    useMenuStore()

  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!newName.trim() || !selectedRestauranteId) return
    setCreating(true)
    try {
      await createIngrediente({ nombre: newName.trim(), restauranteId: selectedRestauranteId })
      setNewName('')
    } finally {
      setCreating(false)
    }
  }

  const handleUpdate = async (id: string, nombre: string) => {
    await updateIngrediente(id, { nombre })
  }

  const handleDelete = async (id: string) => {
    await deleteIngrediente(id)
  }

  if (!selectedRestauranteId) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        Seleccioná un restaurante para ver los ingredientes
      </div>
    )
  }

  return (
    <div>
      <form onSubmit={handleCreate} className="flex items-end gap-3 mb-6">
        <Input
          label="Nuevo ingrediente"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Ej: Tomate, Queso, Jamón"
          className="w-64"
        />
        <Button type="submit" loading={creating} disabled={!newName.trim()}>
          Agregar
        </Button>
      </form>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2 mb-4">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 overflow-hidden bg-white">
          <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {ingredientes.length} ingrediente{ingredientes.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="divide-y divide-gray-100">
            {ingredientes.map((ing) => (
              <IngredienteRow
                key={ing.id}
                ing={ing}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            ))}
            {ingredientes.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-12">
                No hay ingredientes. Agregá el primero.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
