import { useState } from 'react'
import type { FormEvent } from 'react'
import type { CategoriaMenu } from '@menyu/types'
import { useContextStore } from '../../../store/contextStore'
import { useMenuStore } from '../../../store/menuStore'
import { Button, Input, Spinner } from '@menyu/ui'

function InlineEdit({
  value,
  onSave,
  onCancel,
}: {
  value: string
  onSave: (name: string) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(value)
  const [saving, setSaving] = useState(false)

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try { await onSave(name.trim()) }
    finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSave} className="flex items-center gap-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} className="py-1 text-sm w-48" autoFocus />
      <Button type="submit" size="sm" loading={saving}>Guardar</Button>
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
    </form>
  )
}

function CategoriaCard({
  cat,
  onUpdate,
  onDelete,
}: {
  cat: CategoriaMenu
  onUpdate: (id: string, nombre: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)

  const handleSave = async (nombre: string) => {
    await onUpdate(cat.id, nombre)
    setEditing(false)
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center px-4 py-3 bg-white hover:bg-gray-50 group">
        {editing ? (
          <InlineEdit value={cat.nombre} onSave={handleSave} onCancel={() => setEditing(false)} />
        ) : (
          <>
            <span className="text-sm font-medium text-gray-800 flex-1">{cat.nombre}</span>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>Editar</Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (window.confirm(`¿Eliminar categoría "${cat.nombre}"?`)) {
                    onDelete(cat.id).catch(() => undefined)
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
    </div>
  )
}

export function CategoriasTab() {
  const { selectedRestauranteId } = useContextStore()
  const { categorias, loading, createCategoria, updateCategoria, deleteCategoria, error } = useMenuStore()
  const [newCatName, setNewCatName] = useState('')
  const [creatingCat, setCreatingCat] = useState(false)

  const handleCreateCat = async (e: FormEvent) => {
    e.preventDefault()
    if (!newCatName.trim() || !selectedRestauranteId) return
    setCreatingCat(true)
    try { await createCategoria({ nombre: newCatName.trim(), restauranteId: selectedRestauranteId }); setNewCatName('') }
    finally { setCreatingCat(false) }
  }

  if (!selectedRestauranteId) {
    return <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Seleccioná un restaurante para ver las categorías</div>
  }

  return (
    <div>
      <form onSubmit={handleCreateCat} className="flex items-end gap-3 mb-6">
        <Input label="Nueva categoría" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="Ej: Platos principales" className="w-64" />
        <Button type="submit" loading={creatingCat} disabled={!newCatName.trim()}>Agregar</Button>
      </form>
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2 mb-4">{error}</p>}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <div className="flex flex-col gap-3">
          {categorias.map((cat) => (
            <CategoriaCard
              key={cat.id}
              cat={cat}
              onUpdate={(id, nombre) => updateCategoria(id, { nombre })}
              onDelete={deleteCategoria}
            />
          ))}
          {categorias.length === 0 && <p className="text-sm text-gray-400 text-center py-12">No hay categorías. Creá la primera.</p>}
        </div>
      )}
    </div>
  )
}
