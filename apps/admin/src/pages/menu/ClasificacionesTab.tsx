import { useState } from 'react'
import type { FormEvent } from 'react'
import type { ClasificacionDieta } from '@menyu/types'
import { useAuthStore } from '../../store/authStore'
import { useMenuStore } from '../../store/menuStore'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Spinner } from '../../components/ui/Spinner'

function ClasificacionRow({
  c,
  onUpdate,
  onDelete,
}: {
  c: ClasificacionDieta
  onUpdate: (id: string, nombre: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(c.nombre)
  const [saving, setSaving] = useState(false)

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    if (!editName.trim()) return
    setSaving(true)
    try {
      await onUpdate(c.id, editName.trim())
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEditName(c.nombre)
    setEditing(false)
  }

  return (
    <div className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 group transition-colors">
      {editing ? (
        <form onSubmit={handleSave} className="flex items-center gap-3 flex-1">
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="py-1 text-sm w-56"
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
          <span className="text-sm text-gray-800 font-medium">{c.nombre}</span>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              Editar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-red-500 hover:text-red-600"
              onClick={() => {
                if (window.confirm(`¿Eliminar la clasificación "${c.nombre}"?\nSolo es posible si no está asignada a ningún ítem.`)) {
                  onDelete(c.id).catch(() => undefined)
                }
              }}
            >
              Eliminar
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

export function ClasificacionesTab() {
  const { selectedRestauranteId } = useAuthStore()
  const { clasificaciones, loading, createClasificacion, updateClasificacion, deleteClasificacion, error } =
    useMenuStore()

  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!newName.trim() || !selectedRestauranteId) return
    setCreating(true)
    try {
      await createClasificacion(newName.trim())
      setNewName('')
    } finally {
      setCreating(false)
    }
  }

  if (!selectedRestauranteId) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        Seleccioná un restaurante para gestionar las clasificaciones
      </div>
    )
  }

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        Las clasificaciones se asignan directamente a los ítems del menú. Usá texto libre:
        "Vegano", "Sin TACC", "Apto celíaco", "Keto", etc.
      </p>

      <form onSubmit={handleCreate} className="flex items-end gap-3 mb-6">
        <Input
          label="Nueva clasificación"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Ej: Vegano, Sin TACC, Bajo sodio..."
          className="w-72"
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
              {clasificaciones.length} clasificación{clasificaciones.length !== 1 ? 'es' : ''}
            </span>
          </div>
          <div className="divide-y divide-gray-100">
            {clasificaciones.map((c) => (
              <ClasificacionRow
                key={c.id}
                c={c}
                onUpdate={updateClasificacion}
                onDelete={deleteClasificacion}
              />
            ))}
            {clasificaciones.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-12">
                No hay clasificaciones. Agregá la primera.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
