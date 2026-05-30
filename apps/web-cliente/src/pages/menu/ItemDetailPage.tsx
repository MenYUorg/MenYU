import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { usePublicMenuStore } from '../../store/publicMenuStore'
import { useSessionStore } from '../../store/sessionStore'
import { useCarritoStore } from '../../store/carritoStore'
import type { MenuPublicoItem } from '@menyu/types'

const C = {
  orange: '#E8563A',
  orangeHover: '#d34a30',
  orangeSoft: '#FDE5DF',
  navy: '#2D3561',
  text: '#1A1A2E',
  textSub: '#6B7280',
  border: '#ECECEE',
  bg: '#F7F7F8',
} as const

export function ItemDetailPage() {
  const { itemId } = useParams<{ itemId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const cartId = (location.state as { cartId?: string } | null)?.cartId ?? null

  const { menu, loading, error, fetchMenu, getItemById } = usePublicMenuStore()
  const { restauranteId } = useSessionStore()
  const item = getItemById(itemId ?? '') as MenuPublicoItem | undefined

  // ── State ──────────────────────────────────────────────────────────────────
  const [removidos, setRemovidos] = useState<Set<string>>(new Set())
  const [agregados, setAgregados] = useState<Map<string, number>>(new Map())
  const [cantidad, setCantidad] = useState(1)
  const [nota, setNota] = useState('')
  const { agregar, reemplazar } = useCarritoStore()
  const itemEnCarrito = useCarritoStore((s) => s.items.find((i) => i.cartId === cartId))

  useEffect(() => {
    if (!menu && restauranteId) {
      void fetchMenu(restauranteId)
    }
  }, [menu, restauranteId, fetchMenu])

  useEffect(() => {
    if (!itemEnCarrito) return
    setRemovidos(new Set(
      itemEnCarrito.modificaciones
        .filter((m) => m.accion === 'quitar')
        .map((m) => m.itemIngredienteId),
    ))
    setAgregados(new Map(
      itemEnCarrito.modificaciones
        .filter((m) => m.accion === 'agregar')
        .map((m) => [m.itemIngredienteId, m.cantidad]),
    ))
    setNota(itemEnCarrito.nota ?? '')
    setCantidad(itemEnCarrito.cantidad)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100svh', background: 'white' }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', border: `3px solid ${C.orangeSoft}`, borderTopColor: C.orange, animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (!restauranteId) {
    navigate('/menu')
    return null
  }

  if (!loading && error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100svh', gap: 16, padding: 24, background: 'white' }}>
        <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 14, color: C.orange, margin: 0 }}>No se pudo cargar el menú</p>
        <button onClick={() => navigate('/menu')} style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 600, fontSize: 13, color: C.navy, background: 'none', border: 'none', cursor: 'pointer' }}>
          ← Volver al menú
        </button>
      </div>
    )
  }

  if (!loading && menu && !item) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100svh', gap: 16, padding: 24, background: 'white' }}>
        <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 14, color: C.orange, margin: 0 }}>Ítem no encontrado</p>
        <button onClick={() => navigate('/menu')} style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 600, fontSize: 13, color: C.navy, background: 'none', border: 'none', cursor: 'pointer' }}>
          ← Volver al menú
        </button>
      </div>
    )
  }

  if (!item) return null

  // ── Lógica sin cambios ─────────────────────────────────────────────────────
  const precioModificaciones = Array.from(agregados.entries()).reduce((acc, [id, qty]) => {
    const ing = item.ingredientes?.find((ii) => ii.id === id)
    return acc + (ing ? Number(ing.precioExtra) * qty : 0)
  }, 0)
  const precioTotal = Number(item.precioBase) + precioModificaciones

  const toggleRemovido = (id: string) => {
    setRemovidos((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const cambiarCantidad = (ii: { id: string; cantidadMin: number; cantidadMax: number }, delta: number) => {
    setAgregados((prev) => {
      const next = new Map(prev)
      const actual = next.get(ii.id) ?? 0
      const nuevo = Math.max(ii.cantidadMin, Math.min(ii.cantidadMax, actual + delta))
      if (nuevo === 0) next.delete(ii.id)
      else next.set(ii.id, nuevo)
      return next
    })
  }

  const ingredientesRemovibles = (item.ingredientes ?? []).filter((ii) => ii.esOriginal && ii.esRemovible)
  const ingredientesAgregables = (item.ingredientes ?? []).filter((ii) => ii.esAgregable)

  const totalConCantidad = precioTotal * cantidad

  return (
    <div style={{ display: 'flex', justifyContent: 'center', background: C.bg, minHeight: '100svh' }}>
      <div style={{
        width: '100%', maxWidth: 640,
        background: 'white',
        display: 'flex', flexDirection: 'column',
        height: '100svh', overflow: 'hidden',
      }}>

        {/* ── Scrollable area ───────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto' }}>

          {/* Hero image */}
          <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', overflow: 'hidden', flexShrink: 0 }}>
            {item.imagenUrl ? (
              <img
                src={item.imagenUrl}
                alt={item.nombre}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            ) : (
              <div style={{ width: '100%', height: '100%', background: `linear-gradient(135deg, ${C.orangeSoft} 0%, #F0CEC2 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 15, color: 'rgba(232,86,58,0.35)', letterSpacing: '0.12em' }}>MENYU</span>
              </div>
            )}
            {/* Back button — overlaid */}
            <button
              onClick={() => navigate('/menu')}
              style={{
                position: 'absolute', top: 16, left: 16,
                width: 38, height: 38, borderRadius: '50%',
                background: 'rgba(255,255,255,0.92)', color: C.navy,
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, fontWeight: 700,
                boxShadow: '0 2px 8px rgba(0,0,0,0.14)',
              }}
            >
              ←
            </button>
          </div>

          {/* Content */}
          <div style={{ padding: '20px 20px 12px' }}>

            {/* Title */}
            <h1 style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 24, color: C.text, margin: '0 0 8px', lineHeight: 1.2 }}>
              {item.nombre}
            </h1>

            {/* Description */}
            {item.descripcion && (
              <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 14, color: C.textSub, lineHeight: 1.6, margin: '0 0 12px' }}>
                {item.descripcion}
              </p>
            )}

            {/* Classification tags */}
            {item.clasificaciones.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                {item.clasificaciones.map((c) => (
                  <span key={c.id} style={{ background: '#FEF3C7', color: '#92400E', fontSize: 12, fontFamily: 'Inter,sans-serif', fontWeight: 500, borderRadius: 999, padding: '4px 10px' }}>
                    {c.nombre}
                  </span>
                ))}
              </div>
            )}

            {/* Separator + section title */}
            {(ingredientesRemovibles.length > 0 || ingredientesAgregables.length > 0) && (
              <>
                <div style={{ height: 1, background: C.border, margin: '4px 0 20px' }} />
                <p style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13, color: C.navy, margin: '0 0 18px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Personalizá tu plato
                </p>
              </>
            )}

            {/* ── Bloque A: Quitar ingredientes ─────────────────────────── */}
            {ingredientesRemovibles.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.orange, flexShrink: 0 }} />
                  <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 12, color: C.navy, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Quitar ingredientes
                  </span>
                  <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 11, color: C.textSub, marginLeft: 2 }}>Sin costo</span>
                </div>

                {ingredientesRemovibles.map((ii) => {
                  const quitado = removidos.has(ii.id)
                  return (
                    <div key={ii.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: quitado ? C.textSub : C.text, textDecoration: quitado ? 'line-through' : 'none', transition: 'color .15s' }}>
                        {ii.ingrediente?.nombre ?? ii.ingredienteId}
                        {ii.ingrediente?.esAlergeno ? ' ⚠️' : ''}
                      </span>
                      {/* Toggle */}
                      <button
                        onClick={() => toggleRemovido(ii.id)}
                        aria-label={quitado ? 'Restaurar' : 'Quitar'}
                        style={{
                          width: 44, height: 24, borderRadius: 999, flexShrink: 0,
                          background: quitado ? C.orange : '#D1D5DB',
                          border: 'none', cursor: 'pointer', position: 'relative',
                          transition: 'background 0.2s',
                        }}
                      >
                        <span style={{
                          position: 'absolute', top: 3,
                          left: quitado ? 23 : 3,
                          width: 18, height: 18, borderRadius: '50%',
                          background: 'white',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                          transition: 'left 0.2s',
                          display: 'block',
                        }} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── Bloque B: Agregar extras ──────────────────────────────── */}
            {ingredientesAgregables.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.orange, flexShrink: 0 }} />
                  <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 12, color: C.navy, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Agregar extras
                  </span>
                  <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 11, color: C.textSub, marginLeft: 2 }}>Opcional</span>
                </div>

                {ingredientesAgregables.map((ii) => {
                  const qty = agregados.get(ii.id) ?? 0
                  return (
                    <div key={ii.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${C.border}`, gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                        <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.text }}>
                          {ii.ingrediente?.nombre ?? ii.ingredienteId}
                        </span>
                        {Number(ii.precioExtra) > 0 && (
                          <span style={{ background: C.orangeSoft, color: C.orange, fontSize: 11, fontWeight: 700, fontFamily: 'Inter,sans-serif', borderRadius: 999, padding: '3px 9px' }}>
                            +${Number(ii.precioExtra).toFixed(2)}
                          </span>
                        )}
                      </div>
                      {/* Qty stepper */}
                      <div style={{ display: 'inline-flex', alignItems: 'center', border: `1px solid ${C.border}`, borderRadius: 999, overflow: 'hidden', background: 'white', flexShrink: 0 }}>
                        <button
                          onClick={() => cambiarCantidad(ii, -1)}
                          disabled={qty <= 0}
                          style={{ width: 32, height: 32, background: 'transparent', color: C.navy, fontSize: 16, fontWeight: 700, border: 'none', cursor: qty <= 0 ? 'not-allowed' : 'pointer', opacity: qty <= 0 ? 0.3 : 1 }}
                        >
                          −
                        </button>
                        <span style={{ width: 28, textAlign: 'center', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13, color: qty === 0 ? '#C9CCD6' : C.navy }}>
                          {qty}
                        </span>
                        <button
                          onClick={() => cambiarCantidad(ii, 1)}
                          disabled={qty >= ii.cantidadMax}
                          style={{ width: 32, height: 32, background: 'transparent', color: C.navy, fontSize: 16, fontWeight: 700, border: 'none', cursor: qty >= ii.cantidadMax ? 'not-allowed' : 'pointer', opacity: qty >= ii.cantidadMax ? 0.3 : 1 }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Nota para cocina ───────────────────────────────────────────── */}
          <div style={{ padding: '0 20px 20px' }}>
            <label style={{
              display:      'block',
              fontFamily:   'Montserrat, sans-serif',
              fontWeight:   600,
              fontSize:     12,
              color:        '#6B7280',
              marginBottom: 6,
            }}>
              📝 Nota para cocina
            </label>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="(opcional)"
              rows={2}
              style={{
                width:        '100%',
                boxSizing:    'border-box',
                border:       '1px solid #E5E7EB',
                borderRadius: 12,
                padding:      '10px 14px',
                fontSize:     13,
                fontFamily:   'Inter, sans-serif',
                resize:       'none',
                background:   '#F7F7F8',
                color:        '#1A1A2E',
                outline:      'none',
                transition:   'border-color 0.15s',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#E8563A' }}
              onBlur={(e)  => { e.currentTarget.style.borderColor = '#E5E7EB' }}
            />
          </div>
        </div>

        {/* ── Bottom bar ────────────────────────────────────────────────────── */}
        <div style={{ flexShrink: 0, padding: '12px 16px 20px', background: 'white', borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'stretch', gap: 10 }}>

          {/* Dish quantity */}
          <div style={{ background: 'white', border: '1px solid #DCDEE7', borderRadius: 14, display: 'flex', alignItems: 'center', padding: '0 4px 0 12px', gap: 2, flexShrink: 0 }}>
            <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 10, color: C.navy, textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: 2 }}>
              Cant.
            </span>
            <button
              onClick={() => setCantidad((c) => Math.max(1, c - 1))}
              disabled={cantidad <= 1}
              style={{ width: 32, height: 44, background: 'transparent', color: C.navy, fontSize: 18, fontWeight: 700, border: 'none', cursor: cantidad <= 1 ? 'not-allowed' : 'pointer', opacity: cantidad <= 1 ? 0.3 : 1, borderRadius: 8 }}
            >
              −
            </button>
            <span style={{ minWidth: 22, textAlign: 'center', fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 15, color: C.navy }}>
              {cantidad}
            </span>
            <button
              onClick={() => setCantidad((c) => c + 1)}
              style={{ width: 32, height: 44, background: 'transparent', color: C.navy, fontSize: 18, fontWeight: 700, border: 'none', cursor: 'pointer', borderRadius: 8 }}
            >
              +
            </button>
          </div>

          {/* Add to cart button */}
          <button
            onClick={() => {
              const modificaciones = [
                ...Array.from(removidos).map((id) => {
                  const ing = item.ingredientes?.find((ii) => ii.id === id)
                  return {
                    itemIngredienteId: id,
                    accion: 'quitar' as const,
                    cantidad: 1,
                    nombre: ing?.ingrediente?.nombre,
                  }
                }),
                ...Array.from(agregados.entries()).map(([id, qty]) => {
                  const ing = item.ingredientes?.find((ii) => ii.id === id)
                  return {
                    itemIngredienteId: id,
                    accion: 'agregar' as const,
                    cantidad: qty,
                    nombre: ing?.ingrediente?.nombre,
                  }
                }),
              ]
              const payload = {
                itemMenuId:     item.id,
                nombre:         item.nombre,
                precioUnitario: precioTotal,
                cantidad,
                nota:           nota.trim() || undefined,
                modificaciones,
              }
              if (cartId) {
                reemplazar(cartId, payload)
              } else {
                agregar(payload)
              }
              navigate('/carrito')
            }}
            style={{
              flex: 1, background: C.orange, color: 'white',
              borderRadius: 14, padding: '14px 18px', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 15,
              boxShadow: '0 8px 22px rgba(232,86,58,0.32)',
              cursor: 'pointer', gap: 12, minHeight: 56,
              transition: 'background .15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = C.orangeHover }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = C.orange }}
            onMouseDown={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(1px)' }}
            onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'none' }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 22, height: 22, background: 'rgba(255,255,255,0.18)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>
                🛒
              </span>
              {cartId ? 'Guardar cambios' : 'Agregar al pedido'}
            </span>
            <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 17, letterSpacing: '0.01em', flexShrink: 0 }}>
              ${totalConCantidad.toFixed(2)}
            </span>
          </button>
        </div>

      </div>
    </div>
  )
}
