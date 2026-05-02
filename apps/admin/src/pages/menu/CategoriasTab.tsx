import { useState } from 'react'
import type { FormEvent } from 'react'
import type { CategoriaMenu, SubcategoriaMenu } from '@menyu/types'
import { useAuthStore } from '../../store/authStore'
import { useMenuStore } from '../../store/menuStore'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Spinner } from '../../components/ui/Spinner'

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
    try {
      await onSave(name.trim())
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="flex items-center gap-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="py-1 text-sm w-48"
        autoFocus
      />
      <Button type="submit" size="sm" loading={saving}>
        Guardar
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
        Cancelar
      </Button>
    </form>
  )
}

function SubcategoriaRow({
  sub,
  onUpdate,
  onDelete,
}: {
  sub: SubcategoriaMenu
  onUpdate: (id: string, nombre: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)

  const handleSave = async (nombre: string) => {
    await onUpdate(sub.id, nombre)
    setEditing(false)
  }

  return (
    <div className="flex items-center justify-between py-2 pl-4 pr-2 hover:bg-gray-50 rounded-md group">
      <div className="flex items-center gap-2">
        <span className="text-gray-300 text-xs">└</span>
        {editing ? (
          <InlineEdit value={sub.nombre} onSave={handleSave} onCancel={() => setEditing(false)} />
        ) : (
          <span className="text-sm text-gray-700">{sub.nombre}</span>
        )}
      </div>
      {!editing && (
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Editar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (window.confirm(`¿Eliminar subcategoría "${sub.nombre}"?`)) {
                onDelete(sub.id).catch(() => undefined)
              }
            }}
            className="text-red-500 hover:text-red-600"
          >
            Eliminar
          </Button>
        </div>
      )}
    </div>
  )
}

function CategoriaCard({
  cat,
  onUpdateCat,
  onDeleteCat,
  onCreateSub,
  onUpdateSub,
  onDeleteSub,
}: {
  cat: CategoriaMenu
  onUpdateCat: (id: string, nombre: string) => Promise<void>
  onDeleteCat: (id: string) => Promise<void>
  onCreateSub: (catId: string, nombre: string) => Promise<void>
  onUpdateSub: (id: string, nombre: string) => Promise<void>
  onDeleteSub: (id: string) => Promise<void>
}) {
  const [editingCat, setEditingCat] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [addingSubName, setAddingSubName] = useState('')
  const [showAddSub, setShowAddSub] = useState(false)
  const [savingSub, setSavingSub] = useState(false)

  const subs = cat.subcategorias ?? []

  const handleSaveCat = async (nombre: string) => {
    await onUpdateCat(cat.id, nombre)
    setEditingCat(false)
  }

  const handleAddSub = async (e: FormEvent) => {
    e.preventDefault()
    if (!addingSubName.trim()) return
    setSavingSub(true)
    try {
      await onCreateSub(cat.id, addingSubName.trim())
      setAddingSubName('')
      setShowAddSub(false)
    } finally {
      setSavingSub(false)
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center px-4 py-3 bg-white hover:bg-gray-50 group">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-gray-400 mr-2 text-xs font-mono w-4 shrink-0"
        >
          {expanded ? '▾' : '▸'}
        </button>

        {editingCat ? (
          <InlineEdit
            value={cat.nombre}
            onSave={handleSaveCat}
            onCancel={() => setEditingCat(false)}
          />
        ) : (
          <>
            <span
              className="text-sm font-medium text-gray-800 flex-1 cursor-pointer"
              onClick={() => setExpanded((v) => !v)}
            >
              {cat.nombre}
            </span>
            <span className="text-xs text-gray-400 mr-3">
              {subs.length} sub{subs.length !== 1 ? 's' : ''}
            </span>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setExpanded(true)
                  setShowAddSub(true)
                }}
              >
                + Sub
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditingCat(true)}>
                Editar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (subs.length > 0) {
                    window.alert(
                      'Eliminá todas las subcategorías antes de eliminar la categoría.',
                    )
                    return
                  }
                  if (window.confirm(`¿Eliminar categoría "${cat.nombre}"?`)) {
                    onDeleteCat(cat.id).catch(() => undefined)
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

      {/* Subcategorias */}
      {expanded && (
        <div className="border-t border-gray-100 bg-white px-2 py-1">
          {subs.map((sub) => (
            <SubcategoriaRow
              key={sub.id}
              sub={sub}
              onUpdate={onUpdateSub}
              onDelete={onDeleteSub}
            />
          ))}

          {showAddSub ? (
            <form
              onSubmit={handleAddSub}
              className="flex items-center gap-2 py-2 pl-6 pr-2"
            >
              <Input
                value={addingSubName}
                onChange={(e) => setAddingSubName(e.target.value)}
                placeholder="Nombre de subcategoría"
                className="py-1 text-sm w-48"
                autoFocus
              />
              <Button type="submit" size="sm" loading={savingSub}>
                Agregar
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowAddSub(false)
                  setAddingSubName('')
                }}
              >
                Cancelar
              </Button>
            </form>
          ) : (
            <button
              onClick={() => setShowAddSub(true)}
              className="text-xs text-indigo-500 hover:text-indigo-700 pl-6 py-2 block"
            >
              + Agregar subcategoría
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function CategoriasTab() {
  const { selectedRestauranteId } = useAuthStore()
  const {
    categorias,
    loading,
    createCategoria,
    updateCategoria,
    deleteCategoria,
    createSubcategoria,
    updateSubcategoria,
    deleteSubcategoria,
    error,
  } = useMenuStore()

  const [newCatName, setNewCatName] = useState('')
  const [creatingCat, setCreatingCat] = useState(false)

  const handleCreateCat = async (e: FormEvent) => {
    e.preventDefault()
    if (!newCatName.trim() || !selectedRestauranteId) return
    setCreatingCat(true)
    try {
      await createCategoria({ nombre: newCatName.trim(), restauranteId: selectedRestauranteId })
      setNewCatName('')
    } finally {
      setCreatingCat(false)
    }
  }

  const handleUpdateCat = async (id: string, nombre: string) => {
    await updateCategoria(id, { nombre })
  }

  const handleDeleteCat = async (id: string) => {
    await deleteCategoria(id)
  }

  const handleCreateSub = async (catId: string, nombre: string) => {
    await createSubcategoria(catId, { nombre })
  }

  const handleUpdateSub = async (id: string, nombre: string) => {
    await updateSubcategoria(id, { nombre })
  }

  const handleDeleteSub = async (id: string) => {
    await deleteSubcategoria(id)
  }

  if (!selectedRestauranteId) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        Seleccioná un restaurante para ver las categorías
      </div>
    )
  }

  return (
    <div>
      {/* Nueva categoría */}
      <form onSubmit={handleCreateCat} className="flex items-end gap-3 mb-6">
        <Input
          label="Nueva categoría"
          value={newCatName}
          onChange={(e) => setNewCatName(e.target.value)}
          placeholder="Ej: Platos principales"
          className="w-64"
        />
        <Button type="submit" loading={creatingCat} disabled={!newCatName.trim()}>
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
        <div className="flex flex-col gap-3">
          {categorias.map((cat) => (
            <CategoriaCard
              key={cat.id}
              cat={cat}
              onUpdateCat={handleUpdateCat}
              onDeleteCat={handleDeleteCat}
              onCreateSub={handleCreateSub}
              onUpdateSub={handleUpdateSub}
              onDeleteSub={handleDeleteSub}
            />
          ))}
          {categorias.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-12">
              No hay categorías. Creá la primera.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
