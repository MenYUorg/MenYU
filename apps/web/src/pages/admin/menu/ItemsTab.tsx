import { useState, useRef } from 'react'
import type { FormEvent, ChangeEvent } from 'react'
import type { ItemMenu } from '@menyu/types'
import { useAuthStore } from '../../../store/authStore'
import { useMenuStore } from '../../../store/menuStore'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Textarea } from '../../../components/ui/Textarea'
import { Select } from '../../../components/ui/Select'
import { Badge } from '../../../components/ui/Badge'
import { Modal } from '../../../components/ui/Modal'
import { Spinner } from '../../../components/ui/Spinner'
import { ItemIngredientesPanel } from './ItemIngredientesPanel'
import { api } from '../../../services/api'

interface ItemForm {
  nombre: string
  precioBase: string
  descripcion: string
  categoriaId: string
  subcategoriaId: string
  disponible: boolean
}

const EMPTY_FORM: ItemForm = {
  nombre: '',
  precioBase: '',
  descripcion: '',
  categoriaId: '',
  subcategoriaId: '',
  disponible: true,
}

function itemToForm(item: ItemMenu): ItemForm {
  return {
    nombre: item.nombre,
    precioBase: item.precioBase.toString(),
    descripcion: item.descripcion ?? '',
    // categoriaId directo tiene prioridad; si no, derivar de la subcategoría
    categoriaId: item.categoriaId ?? item.subcategoria?.categoriaId ?? '',
    subcategoriaId: item.subcategoriaId ?? '',
    disponible: item.disponible,
  }
}

export function ItemsTab() {
  const { selectedMarcaId } = useAuthStore()
  const { items, categorias, clasificaciones, loading, createItem, updateItem, deleteItem, uploadItemImage, deleteItemImage } =
    useMenuStore()

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ItemMenu | null>(null)
  const [form, setForm] = useState<ItemForm>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [imageTarget, setImageTarget] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [ingModal, setIngModal] = useState<{ id: string; nombre: string } | null>(null)
  const [clasifSaving, setClasifSaving] = useState<string | null>(null)

  const categoriaOptions = categorias.map((cat) => ({ value: cat.id, label: cat.nombre }))

  const subcategoriaOptions = form.categoriaId
    ? (categorias.find((c) => c.id === form.categoriaId)?.subcategorias ?? []).map((sub) => ({
        value: sub.id,
        label: sub.nombre,
      }))
    : []

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setModalOpen(true)
  }

  const openEdit = (item: ItemMenu) => {
    setEditing(item)
    setForm(itemToForm(item))
    setFormError(null)
    setModalOpen(true)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!selectedMarcaId) return

    const precio = parseFloat(form.precioBase)
    if (isNaN(precio) || precio < 0) {
      setFormError('El precio debe ser un número válido')
      return
    }

    const nombre = form.nombre.trim()
    if (!nombre) {
      setFormError('El nombre es requerido')
      return
    }

    setSubmitting(true)
    setFormError(null)
    try {
      if (editing) {
        await updateItem(editing.id, {
          nombre,
          precioBase: precio,
          descripcion: form.descripcion.trim() || undefined,
          categoriaId: form.categoriaId || null,
          subcategoriaId: form.subcategoriaId || null,
          disponible: form.disponible,
        })
      } else {
        await createItem({
          marcaId: selectedMarcaId,
          nombre,
          precioBase: precio,
          descripcion: form.descripcion.trim() || undefined,
          categoriaId: form.categoriaId || undefined,
          subcategoriaId: form.subcategoriaId || undefined,
          disponible: form.disponible,
        })
      }
      setModalOpen(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error inesperado')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Eliminar este ítem del menú?')) return
    try {
      await deleteItem(id)
    } catch {
      // error queda en store
    }
  }

  const handleUploadClick = (id: string) => {
    setImageTarget(id)
    fileRef.current?.click()
  }

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !imageTarget) return
    try {
      await uploadItemImage(imageTarget, file)
    } catch {
      // error queda en store
    } finally {
      setImageTarget(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleDeleteImage = async (id: string) => {
    if (!window.confirm('¿Quitar la imagen de este ítem?')) return
    try {
      await deleteItemImage(id)
    } catch {
      // error queda en store
    }
  }

  const toggleClasificacion = async (clasificacionId: string) => {
    if (!editing) return
    setClasifSaving(clasificacionId)
    const yaAsignada = (editing.clasificaciones ?? []).some(
      (ic) => ic.clasificacionId === clasificacionId,
    )
    try {
      const updated = yaAsignada
        ? (await api.clasificaciones.removeFromItem(editing.id, clasificacionId), null)
        : await api.clasificaciones.addToItem(editing.id, clasificacionId)

      setEditing((prev) => {
        if (!prev) return prev
        if (yaAsignada) {
          return {
            ...prev,
            clasificaciones: (prev.clasificaciones ?? []).filter(
              (ic) => ic.clasificacionId !== clasificacionId,
            ),
          }
        }
        const nueva = clasificaciones.find((c) => c.id === clasificacionId)
        if (!nueva) return updated ?? prev
        return {
          ...prev,
          clasificaciones: [
            ...(prev.clasificaciones ?? []),
            { clasificacionId, clasificacion: nueva },
          ],
        }
      })
    } catch {
      // no bloqueamos el flujo principal
    } finally {
      setClasifSaving(null)
    }
  }

  if (!selectedMarcaId) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        Seleccioná una marca para ver los ítems
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <p className="text-sm text-gray-500">
          {items.length} {items.length === 1 ? 'ítem' : 'ítems'}
        </p>
        <Button onClick={openCreate} size="md">
          + Nuevo ítem
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm bg-white">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left w-16">Imagen</th>
                <th className="px-4 py-3 text-left">Nombre</th>
                <th className="px-4 py-3 text-left">Precio</th>
                <th className="px-4 py-3 text-left">Subcategoría</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <img
                      src={item.imagenUrl || '/src/assets/predeterminada_menu.png'}
                      alt={item.nombre}
                      className="w-12 h-12 object-cover rounded-md border border-gray-100"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{item.nombre}</div>
                    {item.descripcion && (
                      <div className="text-gray-400 text-xs mt-0.5 truncate max-w-[220px]">
                        {item.descripcion}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-700">
                    ${Number(item.precioBase).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {item.subcategoria?.nombre ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={item.disponible ? 'success' : 'error'}>
                      {item.disponible ? 'Disponible' : 'No disponible'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleUploadClick(item.id)}
                        title="Subir imagen"
                      >
                        📷
                      </Button>
                      {item.imagenUrl && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteImage(item.id)}
                          title="Quitar imagen"
                        >
                          🗑
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setIngModal({ id: item.id, nombre: item.nombre })}
                      >
                        Ingredientes
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => openEdit(item)}>
                        Editar
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => handleDelete(item.id)}>
                        Eliminar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-gray-400 text-sm">
                    No hay ítems en el catálogo. Creá el primero.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      <Modal
        open={!!ingModal}
        onClose={() => setIngModal(null)}
        title={`Ingredientes — ${ingModal?.nombre ?? ''}`}
        size="lg"
      >
        {ingModal && (
          <ItemIngredientesPanel itemId={ingModal.id} itemNombre={ingModal.nombre} />
        )}
      </Modal>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar ítem' : 'Nuevo ítem'}
        size="md"
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Nombre *"
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            required
            placeholder="Ej: Milanesa napolitana"
          />
          <Input
            label="Precio base *"
            type="number"
            min="0"
            step="0.01"
            value={form.precioBase}
            onChange={(e) => setForm((f) => ({ ...f, precioBase: e.target.value }))}
            required
            placeholder="0.00"
          />
          <Textarea
            label="Descripción"
            value={form.descripcion}
            onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
            rows={2}
            placeholder="Descripción opcional"
          />
          {categoriaOptions.length > 0 && (
            <Select
              label="Categoría"
              value={form.categoriaId}
              onChange={(e) =>
                setForm((f) => ({ ...f, categoriaId: e.target.value, subcategoriaId: '' }))
              }
              options={categoriaOptions}
              placeholder="Sin categoría"
            />
          )}
          {subcategoriaOptions.length > 0 && (
            <Select
              label="Subcategoría (opcional)"
              value={form.subcategoriaId}
              onChange={(e) => setForm((f) => ({ ...f, subcategoriaId: e.target.value }))}
              options={subcategoriaOptions}
              placeholder="Sin subcategoría"
            />
          )}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.disponible}
              onChange={(e) => setForm((f) => ({ ...f, disponible: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm font-medium text-gray-700">Disponible para el cliente</span>
          </label>

          {editing && clasificaciones.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Dieta / Restricciones</p>
              <div className="flex flex-wrap gap-2">
                {clasificaciones.map((c) => {
                  const asignada = (editing.clasificaciones ?? []).some(
                    (ic) => ic.clasificacionId === c.id,
                  )
                  const saving = clasifSaving === c.id
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={saving}
                      onClick={() => toggleClasificacion(c.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors disabled:opacity-50 ${
                        asignada
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400 hover:text-indigo-600'
                      }`}
                    >
                      {saving ? '…' : asignada ? '✓ ' : ''}{c.nombre}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {formError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              {formError}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={submitting}>
              {editing ? 'Guardar cambios' : 'Crear ítem'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
