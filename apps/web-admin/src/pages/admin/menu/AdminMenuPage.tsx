import { useState, useEffect, useRef, useMemo } from 'react'
import type { FormEvent } from 'react'
import type { ItemMenu } from '@menyu/types'
import { Search, Trash2, Pencil, GripVertical } from 'lucide-react'
import { useAuth } from '@menyu/auth'
import { useContextStore } from '../../../store/contextStore'
import { useMenuStore } from '../../../store/menuStore'
import { ItemFormModal } from './ItemFormModal'

type CatalogTab = 'categorias' | 'ingredientes' | 'dietas'

const matchesBusqueda = (nombre: string, buscar: string): boolean => {
  if (!buscar.trim()) return true
  const query = buscar.toLowerCase().trim()
  return nombre.toLowerCase().split(/\s+/).some((palabra) => palabra.startsWith(query))
}

/* ─── ToggleSwitch ──────────────────────────────────────────────────────── */
function ToggleSwitch({ value, onChange }: { value: boolean; onChange: () => void }) {
  return (
    <div
      role="switch"
      aria-checked={value}
      onClick={(e) => { e.stopPropagation(); onChange() }}
      style={{
        width:        44,
        height:       24,
        borderRadius: 999,
        background:   value ? '#E8563A' : '#d1d5db',
        cursor:       'pointer',
        transition:   'background 200ms',
        position:     'relative',
        flexShrink:   0,
      }}
    >
      <div style={{
        width:        20,
        height:       20,
        borderRadius: '50%',
        background:   'white',
        position:     'absolute',
        top:          2,
        left:         value ? 22 : 2,
        transition:   'left 200ms',
      }} />
    </div>
  )
}

/* ─── TabList (ingredientes + dietas) ───────────────────────────────────── */
function TabList({
  items,
  onDelete,
  onUpdate,
  onCreate,
  newName,
  onNewNameChange,
  creating,
  placeholder,
}: {
  items:           { id: string; nombre: string }[]
  onDelete:        (id: string, nombre: string) => void
  onUpdate:        (id: string, nombre: string) => Promise<void>
  onCreate:        (e: FormEvent) => void
  newName:         string
  onNewNameChange: (v: string) => void
  creating:        boolean
  placeholder:     string
}) {
  const [editingId, setEditingId]     = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [updating, setUpdating]       = useState(false)

  const startEdit = (id: string, nombre: string) => {
    setEditingId(id)
    setEditingName(nombre)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingName('')
  }

  const handleUpdate = async (e: FormEvent) => {
    e.preventDefault()
    if (!editingName.trim() || !editingId) return
    setUpdating(true)
    try {
      await onUpdate(editingId, editingName.trim())
      setEditingId(null)
      setEditingName('')
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div>
      <form onSubmit={onCreate} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          value={newName}
          onChange={(e) => onNewNameChange(e.target.value)}
          placeholder={placeholder}
          style={{
            flex:         1,
            border:       '1px solid #e5e7eb',
            borderRadius: 8,
            padding:      '8px 12px',
            fontFamily:   'Inter, sans-serif',
            fontSize:     13,
            color:        '#111827',
            outline:      'none',
          }}
        />
        <button
          type="submit"
          disabled={!newName.trim() || creating}
          style={{
            background:   '#2D3561',
            color:        'white',
            border:       'none',
            borderRadius: 8,
            padding:      '8px 16px',
            cursor:       !newName.trim() || creating ? 'not-allowed' : 'pointer',
            fontFamily:   'Inter, sans-serif',
            fontSize:     13,
            fontWeight:   600,
            opacity:      !newName.trim() || creating ? 0.5 : 1,
            transition:   'opacity 150ms',
          }}
        >
          {creating ? '…' : 'Agregar'}
        </button>
      </form>

      <div style={{ borderBottom: '1px solid #e5e7eb', marginBottom: 12 }} />

      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        {items.length === 0 ? (
          <p style={{
            fontFamily: 'Inter, sans-serif',
            fontSize:   13,
            color:      '#9CA3AF',
            textAlign:  'center',
            padding:    '20px 0',
            margin:     0,
          }}>
            No hay elementos. Creá el primero.
          </p>
        ) : (
          <div>
            {items.map((item, i) => (
              <div
                key={item.id}
                style={{
                  display:      'flex',
                  alignItems:   'center',
                  gap:          8,
                  padding:      '10px 0',
                  borderBottom: i < items.length - 1 ? '1px solid #f3f4f6' : 'none',
                }}
              >
                {editingId === item.id ? (
                  <form onSubmit={handleUpdate} style={{ display: 'flex', gap: 8, flex: 1 }}>
                    <input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      autoFocus
                      style={{
                        flex:         1,
                        border:       '1px solid #e5e7eb',
                        borderRadius: 8,
                        padding:      '6px 10px',
                        fontFamily:   'Inter, sans-serif',
                        fontSize:     13,
                        color:        '#111827',
                        outline:      'none',
                      }}
                    />
                    <button
                      type="submit"
                      disabled={!editingName.trim() || updating}
                      style={{
                        background:   '#2D3561',
                        color:        'white',
                        border:       'none',
                        borderRadius: 8,
                        padding:      '6px 12px',
                        cursor:       !editingName.trim() || updating ? 'not-allowed' : 'pointer',
                        fontFamily:   'Inter, sans-serif',
                        fontSize:     13,
                        fontWeight:   600,
                        opacity:      !editingName.trim() || updating ? 0.5 : 1,
                        whiteSpace:   'nowrap',
                      }}
                    >
                      {updating ? '…' : 'Guardar'}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      style={{
                        background:   'none',
                        color:        '#6b7280',
                        border:       '1px solid #e5e7eb',
                        borderRadius: 8,
                        padding:      '6px 12px',
                        cursor:       'pointer',
                        fontFamily:   'Inter, sans-serif',
                        fontSize:     13,
                        whiteSpace:   'nowrap',
                      }}
                    >
                      Cancelar
                    </button>
                  </form>
                ) : (
                  <>
                    <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, color: '#111827', flex: 1 }}>
                      {item.nombre}
                    </span>
                    <button
                      onClick={() => startEdit(item.id, item.nombre)}
                      title="Editar"
                      style={{
                        background:   'none',
                        border:       'none',
                        cursor:       'pointer',
                        color:        '#9CA3AF',
                        padding:      4,
                        display:      'flex',
                        alignItems:   'center',
                        borderRadius: 4,
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => onDelete(item.id, item.nombre)}
                      title="Eliminar"
                      style={{
                        background:   'none',
                        border:       'none',
                        cursor:       'pointer',
                        color:        '#9CA3AF',
                        padding:      4,
                        display:      'flex',
                        alignItems:   'center',
                        borderRadius: 4,
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── CategoriasTabContent (con drag & drop) ────────────────────────────── */
function CategoriasTabContent({
  categorias: propCats,
  onDelete,
  onUpdate,
  onCreate,
  newName,
  onNewNameChange,
  creating,
  canDelete = true,
}: {
  categorias:      { id: string; nombre: string; orden?: number }[]
  onDelete:        (id: string, nombre: string) => void
  onUpdate:        (id: string, nombre: string) => Promise<void>
  onCreate:        (e: FormEvent) => void
  newName:         string
  onNewNameChange: (v: string) => void
  creating:        boolean
  canDelete?:      boolean
}) {
  const { updateCategoria } = useMenuStore()
  const sortByOrden = (cats: typeof propCats) =>
    [...cats].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
  const [localCats, setLocalCats] = useState(() => sortByOrden(propCats))
  const [dragIdx, setDragIdx]     = useState<number | null>(null)
  const [overIdx, setOverIdx]     = useState<number | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [updating, setUpdating]   = useState(false)
  const reorderingRef             = useRef(false)

  useEffect(() => {
    if (!reorderingRef.current) setLocalCats(sortByOrden(propCats))
  }, [propCats]) // eslint-disable-line react-hooks/exhaustive-deps

  const startEdit = (id: string, nombre: string) => {
    setEditingId(id); setEditingName(nombre)
  }
  const cancelEdit = () => { setEditingId(null); setEditingName('') }

  const handleUpdate = async (e: FormEvent) => {
    e.preventDefault()
    if (!editingName.trim() || !editingId) return
    setUpdating(true)
    try {
      await onUpdate(editingId, editingName.trim())
      setEditingId(null); setEditingName('')
    } finally { setUpdating(false) }
  }

  const handleDragStart = (i: number) => setDragIdx(i)
  const handleDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault(); setOverIdx(i)
  }
  const handleDrop = async (e: React.DragEvent, dropIdx: number) => {
    e.preventDefault()
    if (dragIdx === null || dragIdx === dropIdx) {
      setDragIdx(null); setOverIdx(null); return
    }
    const reordered = [...localCats]
    const [moved] = reordered.splice(dragIdx, 1)
    reordered.splice(dropIdx, 0, moved)
    setLocalCats(reordered)
    setDragIdx(null); setOverIdx(null)
    reorderingRef.current = true
    try {
      await Promise.all(reordered.map((cat, i) => updateCategoria(cat.id, { orden: i })))
    } finally {
      reorderingRef.current = false
    }
  }
  const handleDragEnd = () => { setDragIdx(null); setOverIdx(null) }

  return (
    <div>
      <form onSubmit={onCreate} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          value={newName}
          onChange={(e) => onNewNameChange(e.target.value)}
          placeholder="Nueva categoría"
          style={{
            flex:         1,
            border:       '1px solid #e5e7eb',
            borderRadius: 8,
            padding:      '8px 12px',
            fontFamily:   'Inter, sans-serif',
            fontSize:     13,
            color:        '#111827',
            outline:      'none',
          }}
        />
        <button
          type="submit"
          disabled={!newName.trim() || creating}
          style={{
            background:   '#2D3561',
            color:        'white',
            border:       'none',
            borderRadius: 8,
            padding:      '8px 16px',
            cursor:       !newName.trim() || creating ? 'not-allowed' : 'pointer',
            fontFamily:   'Inter, sans-serif',
            fontSize:     13,
            fontWeight:   600,
            opacity:      !newName.trim() || creating ? 0.5 : 1,
            transition:   'opacity 150ms',
          }}
        >
          {creating ? '…' : 'Agregar'}
        </button>
      </form>

      <div style={{ borderBottom: '1px solid #e5e7eb', marginBottom: 12 }} />

      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        {localCats.length === 0 ? (
          <p style={{
            fontFamily: 'Inter, sans-serif',
            fontSize:   13,
            color:      '#9CA3AF',
            textAlign:  'center',
            padding:    '20px 0',
            margin:     0,
          }}>
            No hay elementos. Creá el primero.
          </p>
        ) : (
          <div>
            {localCats.map((cat, i) => (
              <div
                key={cat.id}
                draggable
                onDragStart={() => handleDragStart(i)}
                onDragOver={(e) => handleDragOver(e, i)}
                onDrop={(e) => handleDrop(e, i)}
                onDragEnd={handleDragEnd}
                style={{
                  display:      'flex',
                  alignItems:   'center',
                  gap:          8,
                  padding:      '10px 0',
                  borderBottom: i < localCats.length - 1 ? '1px solid #f3f4f6' : 'none',
                  borderTop:    overIdx === i && dragIdx !== i ? '2px solid #E8563A' : '2px solid transparent',
                  opacity:      dragIdx === i ? 0.4 : 1,
                  transition:   'opacity 150ms',
                }}
              >
                <GripVertical
                  size={14}
                  color="#9ca3af"
                  style={{ cursor: 'grab', flexShrink: 0 }}
                />
                {editingId === cat.id ? (
                  <form onSubmit={handleUpdate} style={{ display: 'flex', gap: 8, flex: 1 }}>
                    <input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      autoFocus
                      style={{
                        flex:         1,
                        border:       '1px solid #e5e7eb',
                        borderRadius: 8,
                        padding:      '6px 10px',
                        fontFamily:   'Inter, sans-serif',
                        fontSize:     13,
                        color:        '#111827',
                        outline:      'none',
                      }}
                    />
                    <button
                      type="submit"
                      disabled={!editingName.trim() || updating}
                      style={{
                        background:   '#2D3561',
                        color:        'white',
                        border:       'none',
                        borderRadius: 8,
                        padding:      '6px 12px',
                        cursor:       !editingName.trim() || updating ? 'not-allowed' : 'pointer',
                        fontFamily:   'Inter, sans-serif',
                        fontSize:     13,
                        fontWeight:   600,
                        opacity:      !editingName.trim() || updating ? 0.5 : 1,
                        whiteSpace:   'nowrap',
                      }}
                    >
                      {updating ? '…' : 'Guardar'}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      style={{
                        background:   'none',
                        color:        '#6b7280',
                        border:       '1px solid #e5e7eb',
                        borderRadius: 8,
                        padding:      '6px 12px',
                        cursor:       'pointer',
                        fontFamily:   'Inter, sans-serif',
                        fontSize:     13,
                        whiteSpace:   'nowrap',
                      }}
                    >
                      Cancelar
                    </button>
                  </form>
                ) : (
                  <>
                    <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, color: '#111827', flex: 1 }}>
                      {cat.nombre}
                    </span>
                    <button
                      onClick={() => startEdit(cat.id, cat.nombre)}
                      title="Editar"
                      style={{
                        background:   'none',
                        border:       'none',
                        cursor:       'pointer',
                        color:        '#9CA3AF',
                        padding:      4,
                        display:      'flex',
                        alignItems:   'center',
                        borderRadius: 4,
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                    {canDelete && (
                      <button
                        onClick={() => onDelete(cat.id, cat.nombre)}
                        title="Eliminar"
                        style={{
                          background:   'none',
                          border:       'none',
                          cursor:       'pointer',
                          color:        '#9CA3AF',
                          padding:      4,
                          display:      'flex',
                          alignItems:   'center',
                          borderRadius: 4,
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── CatalogModal ──────────────────────────────────────────────────────── */
function CatalogModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth()
  const isOwner = user?.rol === 'OWNER' || user?.rol === 'ROOT'
  const { selectedRestauranteId } = useContextStore()
  const {
    categorias, ingredientes, clasificaciones,
    createCategoria, updateCategoria, deleteCategoria,
    createIngrediente, updateIngrediente, deleteIngrediente,
    createClasificacion, updateClasificacion, deleteClasificacion,
    error,
  } = useMenuStore()

  const [tab, setTab]               = useState<CatalogTab>('categorias')
  const [catName, setCatName]       = useState('')
  const [ingName, setIngName]       = useState('')
  const [dietaName, setDietaName]   = useState('')
  const [catCreating, setCatCreating]     = useState(false)
  const [ingCreating, setIngCreating]     = useState(false)
  const [dietaCreating, setDietaCreating] = useState(false)
  const [ingBusqueda, setIngBusqueda]     = useState('')

  if (!open) return null

  const TABS: { id: CatalogTab; label: string }[] = [
    { id: 'categorias',   label: 'Categorías'   },
    { id: 'ingredientes', label: 'Ingredientes' },
    { id: 'dietas',       label: 'Dietas'       },
  ]

  const sortedIngredientes = [...ingredientes]
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .filter((i) => matchesBusqueda(i.nombre, ingBusqueda))

  const sortedClasificaciones = [...clasificaciones]
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  const handleCreateCat = async (e: FormEvent) => {
    e.preventDefault()
    if (!catName.trim() || !selectedRestauranteId) return
    setCatCreating(true)
    try {
      await createCategoria({ nombre: catName.trim(), restauranteId: selectedRestauranteId })
      setCatName('')
    } finally { setCatCreating(false) }
  }

  const handleDeleteCat = async (id: string, nombre: string) => {
    if (!window.confirm(`¿Eliminar categoría "${nombre}"?`)) return
    await deleteCategoria(id).catch(() => undefined)
  }

  const handleCreateIng = async (e: FormEvent) => {
    e.preventDefault()
    if (!ingName.trim() || !selectedRestauranteId) return
    setIngCreating(true)
    try {
      await createIngrediente({ nombre: ingName.trim(), restauranteId: selectedRestauranteId })
      setIngName('')
    } finally { setIngCreating(false) }
  }

  const handleDeleteIng = async (id: string, nombre: string) => {
    if (!window.confirm(`¿Eliminar ingrediente "${nombre}"?`)) return
    await deleteIngrediente(id).catch(() => undefined)
  }

  const handleCreateDieta = async (e: FormEvent) => {
    e.preventDefault()
    if (!dietaName.trim()) return
    setDietaCreating(true)
    try {
      await createClasificacion(dietaName.trim())
      setDietaName('')
    } finally { setDietaCreating(false) }
  }

  const handleDeleteDieta = async (id: string, nombre: string) => {
    if (!window.confirm(`¿Eliminar dieta "${nombre}"?`)) return
    await deleteClasificacion(id).catch(() => undefined)
  }

  return (
    <div
      onClick={onClose}
      style={{
        position:        'fixed',
        inset:           0,
        background:      'rgba(0,0,0,0.4)',
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        zIndex:          100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background:     'white',
          width:          520,
          maxWidth:       '90vw',
          borderRadius:   16,
          padding:        28,
          maxHeight:      '80vh',
          display:        'flex',
          flexDirection:  'column',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{
            fontFamily: 'Montserrat, sans-serif',
            fontWeight: 700,
            fontSize:   17,
            color:      '#111827',
            margin:     0,
          }}>
            Gestionar catálogo
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border:     'none',
              cursor:     'pointer',
              color:      '#9CA3AF',
              fontSize:   22,
              lineHeight: 1,
              padding:    '0 4px',
            }}
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: 20 }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                background:   'none',
                border:       'none',
                cursor:       'pointer',
                padding:      '8px 16px',
                fontFamily:   'Inter, sans-serif',
                fontSize:     14,
                fontWeight:   tab === t.id ? 600 : 400,
                color:        tab === t.id ? '#E8563A' : '#6b7280',
                borderBottom: tab === t.id ? '2px solid #E8563A' : '2px solid transparent',
                marginBottom: -1,
                transition:   'color 150ms',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && (
          <p style={{
            fontFamily:   'Inter, sans-serif',
            fontSize:     13,
            color:        '#dc2626',
            marginBottom: 12,
          }}>
            {error}
          </p>
        )}

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {tab === 'categorias' && (
            <CategoriasTabContent
              categorias={categorias}
              onDelete={handleDeleteCat}
              onUpdate={(id, nombre) => updateCategoria(id, { nombre })}
              onCreate={handleCreateCat}
              newName={catName}
              onNewNameChange={setCatName}
              creating={catCreating}
              canDelete={isOwner}
            />
          )}
          {tab === 'ingredientes' && (
            <>
              <div style={{ position: 'relative', marginBottom: 12 }}>
                <input
                  value={ingBusqueda}
                  onChange={(e) => setIngBusqueda(e.target.value)}
                  placeholder="Buscar ingrediente..."
                  style={{
                    width:        '100%',
                    boxSizing:    'border-box',
                    border:       '1px solid #e5e7eb',
                    borderRadius: 8,
                    padding:      `8px ${ingBusqueda ? 32 : 12}px 8px 12px`,
                    fontFamily:   'Inter, sans-serif',
                    fontSize:     13,
                    color:        '#111827',
                    outline:      'none',
                  }}
                />
                {ingBusqueda && (
                  <button
                    onClick={() => setIngBusqueda('')}
                    style={{
                      position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#9CA3AF', fontSize: 16, lineHeight: 1, padding: 0,
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
              <TabList
                items={sortedIngredientes}
                onDelete={handleDeleteIng}
                onUpdate={(id, nombre) => updateIngrediente(id, { nombre })}
                onCreate={handleCreateIng}
                newName={ingName}
                onNewNameChange={setIngName}
                creating={ingCreating}
                placeholder="Nuevo ingrediente"
              />
            </>
          )}
          {tab === 'dietas' && (
            <TabList
              items={sortedClasificaciones}
              onDelete={handleDeleteDieta}
              onUpdate={(id, nombre) => updateClasificacion(id, nombre)}
              onCreate={handleCreateDieta}
              newName={dietaName}
              onNewNameChange={setDietaName}
              creating={dietaCreating}
              placeholder="Nueva dieta"
            />
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── AdminMenuPage ─────────────────────────────────────────────────────── */
export function AdminMenuPage() {
  const { user } = useAuth()
  const isOwner = user?.rol === 'OWNER' || user?.rol === 'ROOT'
  const { selectedRestauranteId } = useContextStore()
  const {
    items, categorias, loading,
    fetchItems, fetchCategorias, fetchIngredientes, fetchClasificaciones,
    updateItem, error, clearError,
  } = useMenuStore()

  const [busqueda, setBusqueda]   = useState('')
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [optimistic, setOptimistic]   = useState<Record<string, boolean>>({})
  const [itemModal, setItemModal]     = useState<{ open: boolean; item: ItemMenu | null }>({ open: false, item: null })
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null)

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const sectionRefs        = useRef<Map<string, HTMLDivElement>>(new Map())

  useEffect(() => {
    if (selectedRestauranteId) {
      fetchItems(selectedRestauranteId).catch(() => undefined)
      fetchCategorias(selectedRestauranteId).catch(() => undefined)
      fetchIngredientes(selectedRestauranteId).catch(() => undefined)
      fetchClasificaciones(selectedRestauranteId).catch(() => undefined)
    }
  }, [selectedRestauranteId]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Grouped + filtered data ── */
  const categoriasFiltradas = useMemo(() => {
    const cats = [...categorias].sort((a, b) =>
      ((a as { orden?: number }).orden ?? 0) - ((b as { orden?: number }).orden ?? 0),
    )
    const grupos = cats.map((cat) => ({
      categoria: cat,
      items: items.filter(
        (item) => item.categoriaId === cat.id && matchesBusqueda(item.nombre, busqueda),
      ),
    })).filter((g) => g.items.length > 0)

    const sinCategoria = items.filter(
      (item) => !item.categoriaId && matchesBusqueda(item.nombre, busqueda),
    )
    if (sinCategoria.length > 0) {
      grupos.push({
        categoria: { id: '__sin_categoria__', nombre: 'Sin categoría', orden: 9999 } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        items: sinCategoria,
      })
    }
    return grupos
  }, [items, categorias, busqueda])

  /* ── Scroll spy ── */
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setCategoriaActiva(entry.target.getAttribute('data-categoria-id'))
          }
        })
      },
      { root: scrollContainerRef.current, rootMargin: '-10% 0px -80% 0px', threshold: 0 },
    )
    sectionRefs.current.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [categoriasFiltradas])

  const handleCategoriaClick = (categoriaId: string) => {
    const el = sectionRefs.current.get(categoriaId)
    if (el && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: el.offsetTop - 16, behavior: 'smooth' })
    }
    setCategoriaActiva(categoriaId)
  }

  /* ── Toggle disponible ── */
  function getDisponible(item: ItemMenu): boolean {
    return item.id in optimistic ? optimistic[item.id] : item.disponible
  }

  async function handleToggle(item: ItemMenu) {
    const current = getDisponible(item)
    const next = !current
    setOptimistic((prev) => ({ ...prev, [item.id]: next }))
    try {
      await updateItem(item.id, { disponible: next })
    } catch {
      setOptimistic((prev) => ({ ...prev, [item.id]: current }))
    } finally {
      setOptimistic((prev) => {
        const copy = { ...prev }
        delete copy[item.id]
        return copy
      })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── Fixed header block ── */}
      <div style={{ flexShrink: 0, padding: '24px 28px 0' }}>

        {/* Error banner */}
        {error && (
          <div style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            background:     '#fef2f2',
            border:         '1px solid #fecaca',
            borderRadius:   10,
            padding:        '10px 16px',
            marginBottom:   16,
          }}>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#dc2626', margin: 0 }}>
              {error}
            </p>
            <button
              onClick={clearError}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 18 }}
            >
              ×
            </button>
          </div>
        )}

        {/* Topbar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h1 style={{
            fontFamily: 'Montserrat, sans-serif',
            fontWeight: 700,
            fontSize:   22,
            color:      '#2D3561',
            margin:     0,
          }}>
            Menú
          </h1>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => setCatalogOpen(true)}
              style={{
                background:   'white',
                color:        '#2D3561',
                border:       '1px solid #2D3561',
                borderRadius: 10,
                padding:      '9px 16px',
                cursor:       'pointer',
                fontFamily:   'Inter, sans-serif',
                fontSize:     13,
                fontWeight:   500,
                transition:   'background 150ms',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#E5E7F0' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'white' }}
            >
              ⚙ Gestionar catálogo
            </button>
            <button
              onClick={() => setItemModal({ open: true, item: null })}
              style={{
                background:   '#E8563A',
                color:        'white',
                border:       'none',
                borderRadius: 10,
                padding:      '9px 16px',
                cursor:       'pointer',
                fontFamily:   'Montserrat, sans-serif',
                fontSize:     13,
                fontWeight:   700,
                transition:   'background 150ms',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#d44a2e' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#E8563A' }}
            >
              + Agregar plato
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 14 }}>
          <Search
            size={16}
            color="#9CA3AF"
            style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar plato..."
            style={{
              width:        '100%',
              boxSizing:    'border-box',
              border:       '1px solid #e5e7eb',
              borderRadius: 12,
              padding:      `12px ${busqueda ? 36 : 16}px 12px 42px`,
              fontFamily:   'Inter, sans-serif',
              fontSize:     14,
              color:        '#111827',
              outline:      'none',
            }}
          />
          {busqueda && (
            <button
              onClick={() => setBusqueda('')}
              style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#9CA3AF', fontSize: 16, lineHeight: 1, padding: 0,
              }}
            >
              ×
            </button>
          )}
        </div>

        {/* Category pills */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12, paddingTop: 4, scrollbarWidth: 'none' }}>
          {categoriasFiltradas.map(({ categoria }) => {
            const active = categoriaActiva === categoria.id
            return (
              <button
                key={categoria.id}
                onClick={() => handleCategoriaClick(categoria.id)}
                style={{
                  background:   active ? '#2D3561' : 'white',
                  color:        active ? 'white' : '#374151',
                  border:       `1px solid ${active ? '#2D3561' : '#e5e7eb'}`,
                  borderRadius: 999,
                  padding:      '8px 18px',
                  fontFamily:   active ? 'Montserrat, sans-serif' : 'Inter, sans-serif',
                  fontWeight:   active ? 700 : 400,
                  fontSize:     14,
                  cursor:       'pointer',
                  whiteSpace:   'nowrap',
                  transition:   'all 150ms',
                  flexShrink:   0,
                }}
              >
                {categoria.nombre}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Scrollable content ── */}
      {loading ? (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'Inter, sans-serif', fontSize: 14, color: '#9CA3AF',
        }}>
          Cargando…
        </div>
      ) : (
        <div ref={scrollContainerRef} style={{ flex: 1, overflowY: 'auto', padding: '0 28px 24px' }}>
          {categoriasFiltradas.length === 0 ? (
            <p style={{ textAlign: 'center', fontFamily: 'Inter, sans-serif', fontSize: 14, color: '#9CA3AF', padding: '48px 0', margin: 0 }}>
              {busqueda ? `Sin resultados para "${busqueda}"` : 'No hay platos en el catálogo.'}
            </p>
          ) : (
            categoriasFiltradas.map(({ categoria, items: grupoItems }) => (
              <div
                key={categoria.id}
                ref={(el) => { if (el) sectionRefs.current.set(categoria.id, el) }}
                data-categoria-id={categoria.id}
                style={{ marginBottom: 32 }}
              >
                {/* Section header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, paddingTop: 16 }}>
                  <span style={{
                    fontFamily:    'Montserrat, sans-serif',
                    fontWeight:    800,
                    fontSize:      13,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color:         '#2D3561',
                    whiteSpace:    'nowrap',
                  }}>
                    {categoria.nombre}
                  </span>
                  <div style={{ flex: 1, height: 2, background: 'linear-gradient(90deg, #E8563A, transparent)' }} />
                  <span style={{ fontSize: 12, color: '#9ca3af', whiteSpace: 'nowrap' }}>
                    {(() => {
                      const total = grupoItems.length
                      const inactivos = total - grupoItems.filter((i) => i.disponible).length
                      return inactivos > 0
                        ? `${total} platos · ${inactivos} inactivo${inactivos > 1 ? 's' : ''}`
                        : `${total} platos`
                    })()}
                  </span>
                </div>

                {/* Item rows */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {grupoItems.map((item) => {
                    const disponible = getDisponible(item)
                    return (
                      <div
                        key={item.id}
                        style={{
                          background:   'white',
                          border:       '1px solid #e5e7eb',
                          borderRadius: 12,
                          padding:      '12px 16px',
                          display:      'flex',
                          alignItems:   'center',
                          gap:          16,
                          opacity:      disponible ? 1 : 0.55,
                          transition:   'opacity 200ms',
                        }}
                      >
                        {item.imagenUrl ? (
                          <img
                            src={item.imagenUrl}
                            alt={item.nombre}
                            style={{ width: 64, height: 64, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }}
                          />
                        ) : (
                          <div style={{ width: 64, height: 64, borderRadius: 10, background: '#f3f4f6', flexShrink: 0 }} />
                        )}

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{
                            fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: 15,
                            color: '#111827', margin: '0 0 3px',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>
                            {item.nombre}
                          </p>
                          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#6b7280', margin: 0 }}>
                            ${Number(item.precioBase).toLocaleString('es-AR')}
                            {!disponible && <span style={{ color: '#dc2626' }}> · Sin stock</span>}
                          </p>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                          <button
                            onClick={() => setItemModal({ open: true, item })}
                            style={{
                              background: 'white', color: '#374151',
                              border: '1px solid #e5e7eb', borderRadius: 8,
                              padding: '6px 14px', cursor: 'pointer',
                              fontFamily: 'Inter, sans-serif', fontSize: 13,
                              transition: 'border-color 150ms, color 150ms',
                            }}
                            onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#2D3561'; b.style.color = '#2D3561' }}
                            onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#e5e7eb'; b.style.color = '#374151' }}
                          >
                            Editar
                          </button>
                          <ToggleSwitch value={disponible} onChange={() => handleToggle(item)} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <ItemFormModal
        open={itemModal.open}
        onClose={() => setItemModal({ open: false, item: null })}
        item={itemModal.item}
        canDelete={isOwner}
      />
      <CatalogModal open={catalogOpen} onClose={() => setCatalogOpen(false)} />
    </div>
  )
}
