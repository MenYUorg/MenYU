import { useState, useEffect, useId, useRef } from 'react'
import type { ChangeEvent } from 'react'
import { ImagePlus, X, Trash2 } from 'lucide-react'
import type { ItemMenu, ItemIngrediente } from '@menyu/types'
import { useContextStore } from '../../../store/contextStore'
import { useMenuStore } from '../../../store/menuStore'
import { api } from '../../../services/api'
import { motivoPrecioBaseIncompatible } from '../../../utils/descuento'
import { mensajeDeLaApi } from '../../../utils/mensajeDeError'
import { AvisoPrecioConDescuento } from './AvisoPrecioConDescuento'
import { DatosAsistenteFields } from './DatosAsistenteFields'
import {
  FORMULARIO_DATOS_VACIO,
  datosParaGuardar,
  errorDatosAsistente,
  formularioDesdeItem,
  hayDatosAsistente,
} from './datosAsistente'
import { chipSt, inputSt, labelSt } from './estilosFormulario'

const matchesBusqueda = (nombre: string, buscar: string): boolean => {
  if (!buscar.trim()) return true
  const query = buscar.toLowerCase().trim()
  return nombre.toLowerCase().split(/\s+/).some((palabra) => palabra.startsWith(query))
}

interface Props {
  open:      boolean
  onClose:   () => void
  item:      ItemMenu | null
  canDelete: boolean
}

/* ── local ingredient model ─────────────────────────────────────────────── */
interface IngredienteLocal {
  assocId:       string | null   // ItemIngrediente.id — null in creation mode
  ingredienteId: string
  nombre:        string
  esOriginal:    boolean
  esRemovible:   boolean
  esAgregable:   boolean
  precioExtra:   number
  cantidadMax:   number
}

/* ── component ──────────────────────────────────────────────────────────── */
export function ItemFormModal({ open, onClose, item, canDelete }: Props) {
  const { selectedRestauranteId } = useContextStore()
  const {
    categorias, clasificaciones,
    ingredientes: ingredientesStore,
    createItem, updateItem, deleteItem,
    uploadItemImage, deleteItemImage,
    createIngrediente,
  } = useMenuStore()

  const isEdit = item !== null
  const idCampo       = useId()
  const fileInputRef  = useRef<HTMLInputElement>(null)
  const ingSearchRef  = useRef<HTMLDivElement>(null)

  /* ── form state ── */
  const [nombre, setNombre]           = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [precio, setPrecio]           = useState('')

  /* ── image state ── */
  const [pendingImage, setPendingImage] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl]     = useState<string | null>(null)

  /* ── classifications state ── */
  const [selectedClasificaciones, setSelectedClasificaciones] = useState<string[]>([])

  /* ── ingredients state ── */
  const [ingredientesLocales, setIngredientesLocales] = useState<IngredienteLocal[]>([])
  const [showIngSearch, setShowIngSearch]             = useState(false)
  const [ingQuery, setIngQuery]                       = useState('')
  const [creatingIng, setCreatingIng]                 = useState(false)

  /* ── datos para el asistente ── */
  const [datosAsistente, setDatosAsistente] = useState(FORMULARIO_DATOS_VACIO)
  // En el alta van en un PATCH después de crear: si ese PATCH falla, el plato ya existe y reintentar no lo vuelve a crear.
  const [platoCreadoId, setPlatoCreadoId]   = useState<string | null>(null)

  /* ── ui ── */
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  /* ── init on open ── */
  useEffect(() => {
    if (!open) return
    setError(null)
    setPendingImage(null)
    setShowIngSearch(false)
    setIngQuery('')
    setDatosAsistente(formularioDesdeItem(item))
    setPlatoCreadoId(null)
    if (item) {
      setNombre(item.nombre)
      setDescripcion(item.descripcion ?? '')
      setCategoriaId(item.categoriaId ?? '')
      setPrecio(String(item.precioBase))
      setPreviewUrl(item.imagenUrl ?? null)
      setSelectedClasificaciones(
        (item.clasificaciones ?? []).map((ic) => ic.clasificacionId),
      )
      setIngredientesLocales(
        (item.ingredientes ?? []).map((ii) => mapToLocal(ii, ingredientesStore)),
      )
    } else {
      setNombre('')
      setDescripcion('')
      setCategoriaId(categorias[0]?.id ?? '')
      setPrecio('')
      setPreviewUrl(null)
      setSelectedClasificaciones([])
      setIngredientesLocales([])
    }
  }, [open, item?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── close search on outside click ── */
  useEffect(() => {
    if (!showIngSearch) return
    function handler(e: MouseEvent) {
      if (ingSearchRef.current && !ingSearchRef.current.contains(e.target as Node)) {
        setShowIngSearch(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showIngSearch])

  if (!open) return null

  /* ── helpers ── */
  function mapToLocal(
    ii: ItemIngrediente,
    store: typeof ingredientesStore,
  ): IngredienteLocal {
    return {
      assocId:       ii.id,
      ingredienteId: ii.ingredienteId,
      nombre:        ii.ingrediente?.nombre
        ?? store.find((i) => i.id === ii.ingredienteId)?.nombre
        ?? '—',
      esOriginal:    ii.esOriginal,
      esRemovible:   ii.esRemovible,
      esAgregable:   ii.esAgregable,
      precioExtra:   Number(ii.precioExtra),
      cantidadMax:   ii.cantidadMax,
    }
  }

  const addedIds = new Set(ingredientesLocales.map((i) => i.ingredienteId))

  const ingResults = ingredientesStore
    .filter(
      (i) =>
        !addedIds.has(i.id) &&
        matchesBusqueda(i.nombre, ingQuery),
    )
    .slice(0, 5)

  const exactMatch = ingredientesStore.some(
    (i) => i.nombre.toLowerCase() === ingQuery.trim().toLowerCase(),
  )
  const showCrear = ingQuery.trim().length > 0 && !exactMatch

  /* ── image ── */
  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const localUrl = URL.createObjectURL(file)
    setPreviewUrl(localUrl)
    if (item) {
      try { await uploadItemImage(item.id, file) }
      catch { setPreviewUrl(item.imagenUrl ?? null) }
    } else {
      setPendingImage(file)
    }
  }

  const handleRemoveImage = async () => {
    if (item) {
      if (!window.confirm('¿Quitar la imagen de este plato?')) return
      try { await deleteItemImage(item.id); setPreviewUrl(null) }
      catch { setError('Error al quitar la imagen') }
    } else {
      setPendingImage(null)
      setPreviewUrl(null)
    }
  }

  /* ── clasificaciones ── */
  const handleToggleClasificacion = async (clasificacionId: string) => {
    const wasSelected = selectedClasificaciones.includes(clasificacionId)
    setSelectedClasificaciones((prev) =>
      wasSelected ? prev.filter((id) => id !== clasificacionId) : [...prev, clasificacionId],
    )
    if (item) {
      try {
        if (wasSelected) await api.clasificaciones.removeFromItem(item.id, clasificacionId)
        else             await api.clasificaciones.addToItem(item.id, clasificacionId)
      } catch {
        setSelectedClasificaciones((prev) =>
          wasSelected ? [...prev, clasificacionId] : prev.filter((id) => id !== clasificacionId),
        )
      }
    }
  }

  /* ── ingredients ── */
  const handleToggleFlag = async (
    ingredienteId: string,
    flag: 'esRemovible' | 'esAgregable',
  ) => {
    const next: Partial<IngredienteLocal> =
      flag === 'esRemovible'
        ? { esOriginal: true, esRemovible: true, esAgregable: false, precioExtra: 0 }
        : { esOriginal: false, esRemovible: false, esAgregable: true }

    setIngredientesLocales((prev) =>
      prev.map((i) => (i.ingredienteId === ingredienteId ? { ...i, ...next } : i)),
    )

    if (item) {
      const row = ingredientesLocales.find((i) => i.ingredienteId === ingredienteId)
      if (row?.assocId) {
        const apiData =
          flag === 'esRemovible'
            ? { esOriginal: true, esRemovible: true, esAgregable: false, precioExtra: 0 }
            : { esRemovible: false, esAgregable: true }
        await api.items.updateIngrediente(item.id, row.assocId, apiData).catch(() => undefined)
      }
    }
  }

  const handleUpdateNumber = async (
    ingredienteId: string,
    field: 'precioExtra' | 'cantidadMax',
    value: number,
  ) => {
    setIngredientesLocales((prev) =>
      prev.map((i) => (i.ingredienteId === ingredienteId ? { ...i, [field]: value } : i)),
    )
    if (item) {
      const row = ingredientesLocales.find((i) => i.ingredienteId === ingredienteId)
      if (row?.assocId) {
        const apiData: { precioExtra?: number; cantidadMax?: number } =
          field === 'precioExtra' ? { precioExtra: value } : { cantidadMax: value }
        await api.items.updateIngrediente(item.id, row.assocId, apiData).catch(() => undefined)
      }
    }
  }

  const handleRemoveIng = async (ingredienteId: string) => {
    const row = ingredientesLocales.find((i) => i.ingredienteId === ingredienteId)
    if (item && row?.assocId) {
      await api.items.removeIngrediente(item.id, row.assocId).catch(() => undefined)
    }
    setIngredientesLocales((prev) => prev.filter((i) => i.ingredienteId !== ingredienteId))
  }

  const handleSelectIngrediente = async (ingredienteId: string) => {
    const nombre = ingredientesStore.find((i) => i.id === ingredienteId)?.nombre ?? '—'
    setShowIngSearch(false)
    setIngQuery('')

    if (item) {
      const updated = await api.items.addIngrediente(item.id, {
        ingredienteId,
        esOriginal:  false,
        cantidad:    1,
        esRemovible: false,
        esAgregable: false,
        precioExtra: 0,
        cantidadMin: 0,
        cantidadMax: 1,
      }).catch(() => null)
      if (updated) {
        setIngredientesLocales((updated.ingredientes ?? []).map((ii) => mapToLocal(ii, ingredientesStore)))
      }
    } else {
      setIngredientesLocales((prev) => [
        ...prev,
        { assocId: null, ingredienteId, nombre, esOriginal: false, esRemovible: false, esAgregable: false, precioExtra: 0, cantidadMax: 1 },
      ])
    }
  }

  const handleCrearYAgregar = async () => {
    const nombre = ingQuery.trim()
    if (!nombre || !selectedRestauranteId) return
    setCreatingIng(true)
    try {
      const created = await createIngrediente({ nombre, restauranteId: selectedRestauranteId })
      setShowIngSearch(false)
      setIngQuery('')
      if (item) {
        const updated = await api.items.addIngrediente(item.id, {
          ingredienteId: created.id,
          esOriginal:    false,
          cantidad:      1,
          esRemovible:   false,
          esAgregable:   false,
          precioExtra:   0,
          cantidadMin:   0,
          cantidadMax:   1,
        }).catch(() => null)
        if (updated) {
          setIngredientesLocales((updated.ingredientes ?? []).map((ii) => mapToLocal(ii, ingredientesStore)))
        }
      } else {
        setIngredientesLocales((prev) => [
          ...prev,
          { assocId: null, ingredienteId: created.id, nombre: created.nombre, esOriginal: false, esRemovible: false, esAgregable: false, precioExtra: 0, cantidadMax: 1 },
        ])
      }
    } catch {
      // silent
    } finally {
      setCreatingIng(false)
    }
  }

  /* ── guardar ── */
  const avisoDatosSinGuardar = (e: unknown) => {
    const detalle = mensajeDeLaApi(e, '')
    return `El plato se creó, pero sus datos para el asistente no se guardaron${detalle ? ` (${detalle})` : ''}. ` +
      'Tocá «Guardar datos del asistente» para reintentar.'
  }

  const handleGuardar = async () => {
    const motivoAsistente = errorDatosAsistente(datosAsistente)

    // Reintento del alta: el plato ya existe y solo faltan sus datos para el asistente.
    if (platoCreadoId) {
      if (motivoAsistente) { setError(motivoAsistente); return }
      setSaving(true)
      setError(null)
      try {
        await updateItem(platoCreadoId, datosParaGuardar(datosAsistente))
        onClose()
      } catch (e) {
        setError(avisoDatosSinGuardar(e))
      } finally {
        setSaving(false)
      }
      return
    }

    const trimmedNombre = nombre.trim()
    if (!trimmedNombre) { setError('El nombre del plato es obligatorio'); return }
    const precioNum = parseFloat(precio)
    if (isNaN(precioNum) || precioNum < 0) { setError('Ingresá un precio válido'); return }

    // Con un descuento activo, el precio base nuevo tiene que seguir siendo mayor al precio con descuento.
    const motivoDescuento = item ? motivoPrecioBaseIncompatible(precioNum, item.precioDescuento) : null
    if (motivoDescuento) { setError(motivoDescuento); return }

    if (!item && ingredientesLocales.some((i) => !i.esRemovible && !i.esAgregable)) {
      setError('Todos los ingredientes deben ser removibles o agregables.')
      return
    }
    if (motivoAsistente) { setError(motivoAsistente); return }
    if (!selectedRestauranteId) return

    setSaving(true)
    setError(null)
    let creadoId: string | null = null
    try {
      if (item) {
        await updateItem(item.id, {
          nombre:      trimmedNombre,
          descripcion: descripcion.trim() || undefined,
          categoriaId: categoriaId || null,
          precioBase:  precioNum,
          // Van todos, con null en los vacíos: así vaciar un campo lo borra.
          ...datosParaGuardar(datosAsistente),
        })
      } else {
        if (!categoriaId) { setError('La categoría es obligatoria.'); setSaving(false); return }
        const nuevoItem = await createItem({
          restauranteId: selectedRestauranteId,
          nombre:        trimmedNombre,
          descripcion:   descripcion.trim() || undefined,
          categoriaId:   categoriaId || undefined,
          precioBase:    precioNum,
          disponible:    true,
        })
        if (pendingImage) {
          await uploadItemImage(nuevoItem.id, pendingImage).catch(() => undefined)
        }
        if (selectedClasificaciones.length > 0) {
          await Promise.all(
            selectedClasificaciones.map((id) =>
              api.clasificaciones.addToItem(nuevoItem.id, id).catch(() => undefined),
            ),
          )
        }
        if (ingredientesLocales.length > 0) {
          await Promise.all(
            ingredientesLocales.map((ing) =>
              api.items.addIngrediente(nuevoItem.id, {
                ingredienteId: ing.ingredienteId,
                esOriginal:    ing.esRemovible ? true : false,
                cantidad:      1,
                esRemovible:   ing.esRemovible,
                esAgregable:   ing.esAgregable,
                precioExtra:   ing.precioExtra,
                cantidadMin:   0,
                cantidadMax:   ing.cantidadMax,
              }).catch(() => undefined),
            ),
          )
        }
        // `POST /items` no acepta los datos para el asistente: van en un PATCH. Este error no se traga: si no, el
        // dueño creería que quedaron guardados.
        if (hayDatosAsistente(datosAsistente)) {
          creadoId = nuevoItem.id
          await updateItem(nuevoItem.id, datosParaGuardar(datosAsistente))
        }
      }
      onClose()
    } catch (e) {
      if (creadoId) {
        setPlatoCreadoId(creadoId)
        setError(avisoDatosSinGuardar(e))
      } else {
        setError(e instanceof Error ? e.message : 'Error al guardar')
      }
    } finally {
      setSaving(false)
    }
  }

  /* ── eliminar ── */
  const handleEliminar = async () => {
    if (!item) return
    if (!window.confirm('¿Eliminar este plato del menú?')) return
    try { await deleteItem(item.id); onClose() }
    catch (e) { setError(e instanceof Error ? e.message : 'Error al eliminar') }
  }

  /* ── render ── */
  return (
    <div
      onClick={onClose}
      style={{
        position:       'fixed',
        inset:          0,
        background:     'rgba(0,0,0,0.5)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        zIndex:         200,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background:    'white',
          width:         640,
          maxWidth:      '95vw',
          maxHeight:     '90vh',
          borderRadius:  16,
          display:       'flex',
          flexDirection: 'column',
          overflow:      'hidden',
        }}
      >

        {/* ── Header ── */}
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '20px 24px',
          borderBottom:   '1px solid #e5e7eb',
          flexShrink:     0,
        }}>
          <h2 style={{
            fontFamily: 'Montserrat, sans-serif',
            fontWeight: 700,
            fontSize:   18,
            color:      '#2D3561',
            margin:     0,
          }}>
            {isEdit ? 'Editar plato' : 'Nuevo plato'}
          </h2>
          <button
            onClick={onClose}
            style={{
              background:   'none',
              border:       'none',
              cursor:       'pointer',
              color:        '#9CA3AF',
              display:      'flex',
              alignItems:   'center',
              padding:      4,
              borderRadius: 6,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{
          flex:               1,
          overflowY:          'auto',
          overscrollBehavior: 'contain',
          padding:            24,
          display:            'flex',
          flexDirection:      'column',
          gap:                20,
        }}>

          {/* 1. Imagen */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => { void handleFileChange(e) }}
            />
            <div
              onClick={() => { if (!previewUrl) fileInputRef.current?.click() }}
              style={{
                width:          '100%',
                height:         180,
                borderRadius:   12,
                border:         '2px dashed #e5e7eb',
                background:     '#f9fafb',
                overflow:       'hidden',
                position:       'relative',
                cursor:         previewUrl ? 'default' : 'pointer',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                flexDirection:  'column',
                gap:            8,
              }}
            >
              {previewUrl ? (
                <>
                  <img
                    src={previewUrl}
                    alt="preview"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }}
                  />
                  <div style={{ position: 'absolute', bottom: 8, right: 8, display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
                      style={{ padding: '4px 10px', fontSize: 12, fontFamily: 'Inter, sans-serif', background: 'white', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', color: '#374151' }}
                    >
                      Cambiar
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); void handleRemoveImage() }}
                      style={{ padding: '4px 10px', fontSize: 12, fontFamily: 'Inter, sans-serif', background: 'white', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', color: '#374151' }}
                    >
                      Quitar
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <ImagePlus size={32} color="#9ca3af" />
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#9ca3af' }}>
                    Subir imagen (opcional)
                  </span>
                </>
              )}
            </div>
          </div>

          {/* 2. Nombre */}
          <div>
            <label style={labelSt}>Nombre del plato *</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Milanesa napolitana" style={inputSt} />
          </div>

          {/* 3. Descripción */}
          <div>
            <label style={labelSt}>Descripción (opcional)</label>
            <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Breve descripción del plato..." rows={3} style={{ ...inputSt, resize: 'vertical' }} />
          </div>

          {/* 4. Categoría */}
          <div>
            <label htmlFor={`${idCampo}-categoria`} style={labelSt}>Categoría</label>
            {categorias.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: '#9ca3af' }}>
                No hay categorías. Creá una desde Gestionar catálogo.
              </p>
            ) : (
              <select id={`${idCampo}-categoria`} value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} style={inputSt}>
                {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            )}
          </div>

          {/* 5. Dietas */}
          {clasificaciones.length > 0 && (
            <div role="group" aria-labelledby={`${idCampo}-dietas`}>
              <span id={`${idCampo}-dietas`} style={labelSt}>Dietas / Restricciones</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {clasificaciones.map((cl) => {
                  const sel = selectedClasificaciones.includes(cl.id)
                  return (
                    <button
                      key={cl.id}
                      type="button"
                      onClick={() => { void handleToggleClasificacion(cl.id) }}
                      style={chipSt(sel)}
                      onMouseEnter={(e) => { if (!sel) (e.currentTarget as HTMLButtonElement).style.borderColor = '#2D3561' }}
                      onMouseLeave={(e) => { if (!sel) (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb' }}
                    >
                      {cl.nombre}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* 6. Precio */}
          <div>
            <label style={labelSt}>Precio base *</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, color: '#6b7280', fontFamily: 'Inter, sans-serif', flexShrink: 0 }}>$</span>
              <input type="number" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="0.00" min={0} step={0.01} style={inputSt} />
            </div>
            {item?.precioDescuento != null && (
              <AvisoPrecioConDescuento
                precioDescuento={item.precioDescuento}
                porcentajeDescuento={item.porcentajeDescuento}
                precioTexto={precio}
              />
            )}
          </div>

          {/* 7. Ingredientes */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <label style={{ ...labelSt, marginBottom: 0 }}>Ingredientes</label>
              <button
                type="button"
                onClick={() => { setShowIngSearch((v) => !v); setIngQuery('') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#E8563A', fontWeight: 500, padding: 0 }}
              >
                + Agregar ingrediente
              </button>
            </div>

            {/* Lista de ingredientes asignados */}
            {ingredientesLocales.length === 0 && !showIngSearch && (
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#9ca3af', margin: '0 0 4px', fontStyle: 'italic' }}>
                Sin ingredientes asignados.
              </p>
            )}
            {ingredientesLocales.map((ing) => (
              <div
                key={ing.ingredienteId}
                style={{
                  display:      'flex',
                  alignItems:   'center',
                  gap:          12,
                  background:   '#f9fafb',
                  borderRadius: 8,
                  padding:      '10px 12px',
                  marginBottom: 8,
                  flexWrap:     'wrap',
                }}
              >
                {/* nombre */}
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 500, color: '#111827', flex: 1, minWidth: 100 }}>
                  {ing.nombre}
                </span>

                {/* toggle Removible */}
                <button
                  type="button"
                  onClick={() => { void handleToggleFlag(ing.ingredienteId, 'esRemovible') }}
                  style={{
                    background:   ing.esRemovible ? '#2D3561' : 'white',
                    color:        ing.esRemovible ? 'white' : '#374151',
                    border:       `1px solid ${ing.esRemovible ? '#2D3561' : '#e5e7eb'}`,
                    borderRadius: 6,
                    padding:      '4px 10px',
                    fontFamily:   'Inter, sans-serif',
                    fontSize:     12,
                    cursor:       'pointer',
                    transition:   'all 150ms',
                    flexShrink:   0,
                  }}
                >
                  Removible
                </button>

                {/* toggle Agregable */}
                <button
                  type="button"
                  onClick={() => { void handleToggleFlag(ing.ingredienteId, 'esAgregable') }}
                  style={{
                    background:   ing.esAgregable ? '#2D3561' : 'white',
                    color:        ing.esAgregable ? 'white' : '#374151',
                    border:       `1px solid ${ing.esAgregable ? '#2D3561' : '#e5e7eb'}`,
                    borderRadius: 6,
                    padding:      '4px 10px',
                    fontFamily:   'Inter, sans-serif',
                    fontSize:     12,
                    cursor:       'pointer',
                    transition:   'all 150ms',
                    flexShrink:   0,
                  }}
                >
                  Agregable
                </button>

                {/* precio extra + max (solo si agregable) */}
                {ing.esAgregable && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#6b7280' }}>Precio extra $</span>
                      <input
                        type="number"
                        value={ing.precioExtra}
                        min={0}
                        step={0.01}
                        onChange={(e) => { void handleUpdateNumber(ing.ingredienteId, 'precioExtra', parseFloat(e.target.value) || 0) }}
                        style={{ width: 72, border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 6px', fontFamily: 'Inter, sans-serif', fontSize: 12, outline: 'none', color: '#111827', textAlign: 'right' }}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#6b7280' }}>Máx.</span>
                      <input
                        type="number"
                        value={ing.cantidadMax}
                        min={1}
                        step={1}
                        onChange={(e) => { void handleUpdateNumber(ing.ingredienteId, 'cantidadMax', parseInt(e.target.value, 10) || 1) }}
                        style={{ width: 52, border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 6px', fontFamily: 'Inter, sans-serif', fontSize: 12, outline: 'none', color: '#111827', textAlign: 'right' }}
                      />
                    </div>
                  </>
                )}

                {/* trash */}
                <button
                  type="button"
                  onClick={() => { void handleRemoveIng(ing.ingredienteId) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex', alignItems: 'center', padding: 2, flexShrink: 0 }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#dc2626' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af' }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}

            {/* Panel de búsqueda */}
            {showIngSearch && (
              <div
                ref={ingSearchRef}
                style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, marginTop: 8 }}
              >
                <div style={{ position: 'relative', marginBottom: 8 }}>
                  <input
                    autoFocus
                    value={ingQuery}
                    onChange={(e) => setIngQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Escape') setShowIngSearch(false) }}
                    placeholder="Buscar ingrediente..."
                    style={{ ...inputSt, paddingRight: ingQuery ? 32 : undefined }}
                  />
                  {ingQuery && (
                    <button
                      onClick={() => setIngQuery('')}
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
                <div>
                  {ingResults.length === 0 && !showCrear && (
                    <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#9ca3af', margin: '8px 0', textAlign: 'center' }}>
                      {ingQuery ? 'Sin coincidencias' : 'Escribí para buscar'}
                    </p>
                  )}
                  {ingResults.map((ing) => (
                    <div
                      key={ing.id}
                      onClick={() => { void handleSelectIngrediente(ing.id) }}
                      style={{ padding: '8px 10px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#111827', borderRadius: 6 }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#f3f4f6' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                    >
                      {ing.nombre}
                      {ing.esAlergeno && (
                        <span style={{ marginLeft: 6, fontSize: 10, color: '#E8563A', fontWeight: 600 }}>ALÉRGENO</span>
                      )}
                    </div>
                  ))}
                  {showCrear && (
                    <div
                      onClick={() => { if (!creatingIng) void handleCrearYAgregar() }}
                      style={{
                        padding:      '8px 10px',
                        cursor:       creatingIng ? 'not-allowed' : 'pointer',
                        fontFamily:   'Inter, sans-serif',
                        fontSize:     13,
                        color:        '#E8563A',
                        fontWeight:   500,
                        borderTop:    '1px solid #e5e7eb',
                        borderRadius: 6,
                        opacity:      creatingIng ? 0.5 : 1,
                      }}
                      onMouseEnter={(e) => { if (!creatingIng) (e.currentTarget as HTMLDivElement).style.background = '#fde5df' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                    >
                      {creatingIng ? '…' : `+ Crear y agregar «${ingQuery.trim()}»`}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 8. Datos para el asistente de la carta */}
          <DatosAsistenteFields
            valor={datosAsistente}
            onChange={setDatosAsistente}
            conFiltroDeDietas={clasificaciones.length > 0}
          />

        </div>

        {/* ── Footer ── */}
        <div style={{
          borderTop:      '1px solid #e5e7eb',
          padding:        '16px 24px',
          display:        'flex',
          alignItems:     'center',
          justifyContent: isEdit ? 'space-between' : 'flex-end',
          flexShrink:     0,
          gap:            12,
        }}>
          {error && (
            <p style={{ flex: 1, fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#dc2626', margin: 0 }}>
              {error}
            </p>
          )}

          {isEdit && canDelete && (
            <button
              type="button"
              onClick={() => { void handleEliminar() }}
              style={{
                display:      'flex',
                alignItems:   'center',
                gap:          6,
                background:   'white',
                color:        '#dc2626',
                border:       '1px solid #dc2626',
                borderRadius: 10,
                padding:      '9px 16px',
                cursor:       'pointer',
                fontFamily:   'Inter, sans-serif',
                fontSize:     13,
                fontWeight:   500,
                flexShrink:   0,
              }}
            >
              <Trash2 size={14} />
              Eliminar plato
            </button>
          )}

          <button
            type="button"
            onClick={() => { void handleGuardar() }}
            disabled={saving}
            style={{
              background:   '#E8563A',
              color:        'white',
              border:       'none',
              borderRadius: 10,
              padding:      '9px 20px',
              cursor:       saving ? 'not-allowed' : 'pointer',
              fontFamily:   'Montserrat, sans-serif',
              fontSize:     13,
              fontWeight:   700,
              opacity:      saving ? 0.7 : 1,
              transition:   'opacity 150ms',
              flexShrink:   0,
            }}
          >
            {saving ? '…' : platoCreadoId ? 'Guardar datos del asistente' : isEdit ? 'Guardar cambios' : 'Crear plato'}
          </button>
        </div>

      </div>
    </div>
  )
}
