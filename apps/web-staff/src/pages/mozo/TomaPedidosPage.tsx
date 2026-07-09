import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Mesa } from '@menyu/types'
import { ClipboardList, Minus, Plus, ShoppingBag, X } from 'lucide-react'
import { useAuth } from '@menyu/auth'
import { useMozoStore } from '../../store/mozoStore'
import { api } from '../../services/api'
import type { MenuItem, MenuCategoria, SesionActivaRico } from '../../services/api'
import { PageHeader } from '../../components/PageHeader'
import { MenuItemImage } from '@menyu/ui'

function getInitials(name?: string): string {
  if (!name) return '?'
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

// ── Palette ────────────────────────────────────────────────────────────────────
const C = {
  orange:      '#E8563A',
  navy:        '#2D3561',
  green:       '#16a34a',
  greenBg:     '#f0fdf4',
  greenBadge:  '#dcfce7',
  orangeBg:    '#fff8f6',
  orangeBadge: '#FDE5DF',
  border:      '#e5e7eb',
  bgLight:     '#f9fafb',
  textSub:     '#6b7280',
  textMuted:   '#9ca3af',
  red:         '#dc2626',
} as const

// ── Types ─────────────────────────────────────────────────────────────────────
interface CarritoMod {
  itemIngredienteId: string
  accion: 'AGREGAR' | 'QUITAR'
  cantidad: number
  ingredienteNombre: string
}

interface CarritoItem {
  cartId: string
  itemId: string
  nombre: string
  cantidad: number
  notas: string
  mods: CarritoMod[]
  precioTotal: number
}

interface SesionActual {
  sesionId: string
  mesaId:   string
  numeroMesa: string
}

type Vista = 'mesas' | 'menu' | 'carrito'

// ── Helpers ───────────────────────────────────────────────────────────────────
function tiempoTranscurrido(creadaEn: string): string {
  const diff = Date.now() - new Date(creadaEn).getTime()
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m` : `${m} min`
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function calcPrecio(precioBase: number, ingredientes: MenuItem['ingredientes'], agregados: Map<string, number>, cantidad: number): number {
  let price = precioBase
  for (const ing of ingredientes) {
    const qty = agregados.get(ing.id) ?? 0
    if (qty > 0) price += ing.precioExtra * qty
  }
  return price * cantidad
}

// ── MesaTile ──────────────────────────────────────────────────────────────────
function MesaTile({
  mesa, sesion, onClick,
}: {
  mesa: Mesa
  sesion: SesionActivaRico | undefined
  onClick: () => void
}) {
  const ocupada = mesa.estado === 'ocupada'
  const [hov, setHov] = useState(false)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background:    ocupada ? C.orangeBg : C.greenBg,
        borderRadius:  16,
        border:        `2px solid ${ocupada ? C.orange : C.green}`,
        padding:       20,
        cursor:        'pointer',
        minHeight:     150,
        display:       'flex',
        flexDirection: 'column',
        transition:    'box-shadow 0.2s',
        boxShadow:     hov ? '0 4px 12px rgba(0,0,0,0.1)' : 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 32, color: C.navy, lineHeight: 1 }}>
          {mesa.numero}
        </span>
        <span style={{
          background: ocupada ? C.orangeBadge : C.greenBadge,
          color:      ocupada ? C.orange : C.green,
          fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
          padding: '3px 8px', borderRadius: 999, fontFamily: 'Inter,sans-serif',
        }}>
          {ocupada ? 'Ocupada' : 'Libre'}
        </span>
      </div>

      {ocupada && sesion ? (
        <div style={{ marginTop: 10 }}>
          <span style={{ fontSize: 13, color: C.textSub, fontFamily: 'Inter,sans-serif' }}>
            {tiempoTranscurrido(sesion.creadaEn)} · ${sesion.totalAcumulado.toLocaleString('es-AR')}
          </span>
          <div style={{ fontSize: 12, color: C.textMuted, fontFamily: 'Inter,sans-serif', marginTop: 4 }}>
            Toca para agregar pedido
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 13, color: C.textMuted, fontFamily: 'Inter,sans-serif', textAlign: 'center' }}>
            {ocupada ? 'Cargando...' : 'Toca para abrir mesa'}
          </span>
        </div>
      )}
    </div>
  )
}

// ── ItemModal ──────────────────────────────────────────────────────────────────
function ItemModal({
  item,
  initialCantidad = 1,
  initialRemovidos,
  initialAgregados,
  initialNota = '',
  isEditing = false,
  onAgregar,
  onCerrar,
}: {
  item: MenuItem
  initialCantidad?: number
  initialRemovidos?: Set<string>
  initialAgregados?: Map<string, number>
  initialNota?: string
  isEditing?: boolean
  onAgregar: (ci: Omit<CarritoItem, 'cartId'>) => void
  onCerrar: () => void
}) {
  const [cantidad,  setCantidad]  = useState(initialCantidad)
  const [removidos, setRemovidos] = useState<Set<string>>(initialRemovidos ?? new Set())
  const [agregados, setAgregados] = useState<Map<string, number>>(initialAgregados ?? new Map())
  const [nota,      setNota]      = useState(initialNota)

  const removibles = item.ingredientes.filter((i) => i.esRemovible)
  const agregables = item.ingredientes.filter((i) => i.esAgregable)
  const precioTotal = calcPrecio(item.precioBase, item.ingredientes, agregados, cantidad)

  const toggleRemover = (id: string) => {
    setRemovidos((prev) => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  const cambiarAgregado = (id: string, delta: number, max: number) => {
    setAgregados((prev) => {
      const next = new Map(prev)
      const nv = Math.min(max, Math.max(0, (next.get(id) ?? 0) + delta))
      if (nv === 0) { next.delete(id) } else { next.set(id, nv) }
      return next
    })
  }

  const btnCircle = (disabled: boolean, filled: boolean): React.CSSProperties => ({
    width: 32, height: 32, borderRadius: '50%',
    border: filled ? 'none' : `1px solid ${disabled ? C.border : C.navy}`,
    background: filled ? (disabled ? '#d1d5db' : C.navy) : 'white',
    color: filled ? 'white' : disabled ? C.textMuted : C.navy,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled && !filled ? 0.5 : 1, flexShrink: 0,
  })

  const btnCircleSm = (disabled: boolean, filled: boolean): React.CSSProperties => ({
    ...btnCircle(disabled, filled), width: 26, height: 26,
  })

  const handleAgregar = () => {
    const mods: CarritoMod[] = []
    for (const id of removidos) {
      const ing = item.ingredientes.find((i) => i.id === id)
      mods.push({ itemIngredienteId: id, accion: 'QUITAR', cantidad: 1, ingredienteNombre: ing?.ingrediente.nombre ?? '' })
    }
    for (const [id, qty] of agregados) {
      const ing = item.ingredientes.find((i) => i.id === id)
      mods.push({ itemIngredienteId: id, accion: 'AGREGAR', cantidad: qty, ingredienteNombre: ing?.ingrediente.nombre ?? '' })
    }
    onAgregar({ itemId: item.id, nombre: item.nombre, cantidad, notas: nota.trim(), mods, precioTotal })
    onCerrar()
  }

  return (
    <div
      onClick={onCerrar}
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'white', width: 440, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', borderRadius: 16, padding: 24 }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 16, color: C.navy, margin: 0, flex: 1, paddingRight: 12 }}>
            {item.nombre}
          </h3>
          <button onClick={onCerrar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 0, display: 'flex' }}>
            <X size={20} />
          </button>
        </div>

        {/* Cantidad */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, margin: '4px 0 16px' }}>
          <button style={btnCircle(cantidad <= 1, false)} onClick={() => setCantidad((c) => Math.max(1, c - 1))}>
            <Minus size={15} />
          </button>
          <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 22, color: C.navy, minWidth: 28, textAlign: 'center' }}>
            {cantidad}
          </span>
          <button style={btnCircle(false, true)} onClick={() => setCantidad((c) => c + 1)}>
            <Plus size={15} />
          </button>
        </div>

        {/* Removibles */}
        {removibles.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <p style={{ fontFamily: 'Inter,sans-serif', fontWeight: 600, fontSize: 14, color: '#374151', margin: '0 0 8px' }}>
              Ingredientes
            </p>
            {removibles.map((ing) => (
              <label key={ing.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={removidos.has(ing.id)}
                  onChange={() => toggleRemover(ing.id)}
                  style={{ width: 16, height: 16, accentColor: C.orange, cursor: 'pointer' }}
                />
                <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 14, color: '#374151' }}>
                  sin {ing.ingrediente.nombre}
                </span>
              </label>
            ))}
          </div>
        )}

        {/* Agregables */}
        {agregables.length > 0 && (
          <div style={{ marginTop: removibles.length > 0 ? 16 : 8 }}>
            <p style={{ fontFamily: 'Inter,sans-serif', fontWeight: 600, fontSize: 14, color: '#374151', margin: '0 0 8px' }}>
              Extras
            </p>
            {agregables.map((ing) => {
              const qty = agregados.get(ing.id) ?? 0
              return (
                <div key={ing.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                  <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 14, color: '#374151' }}>
                    + {ing.ingrediente.nombre}
                    {ing.precioExtra > 0 && <span style={{ color: C.textSub, fontSize: 12 }}> (+${ing.precioExtra.toFixed(2)})</span>}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button style={btnCircleSm(qty === 0, false)} onClick={() => cambiarAgregado(ing.id, -1, ing.cantidadMax)}><Minus size={12} /></button>
                    <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 600, fontSize: 15, color: C.navy, minWidth: 18, textAlign: 'center' }}>{qty}</span>
                    <button style={btnCircleSm(qty >= ing.cantidadMax, true)} onClick={() => cambiarAgregado(ing.id, 1, ing.cantidadMax)}><Plus size={12} /></button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Nota */}
        <div style={{ marginTop: 16 }}>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Nota para cocina..."
            rows={2}
            style={{ width: '100%', borderRadius: 8, border: `1px solid ${C.border}`, padding: '10px 12px', fontFamily: 'Inter,sans-serif', fontSize: 14, color: '#374151', resize: 'none', boxSizing: 'border-box', outline: 'none' }}
          />
        </div>

        <button
          onClick={handleAgregar}
          style={{ marginTop: 16, width: '100%', padding: '13px 0', borderRadius: 10, border: 'none', background: C.orange, color: 'white', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
        >
          {isEditing ? 'Guardar cambios' : 'Agregar a la comanda'} — ${precioTotal.toFixed(2)}
        </button>
      </div>
    </div>
  )
}

// ── CartItemCard ───────────────────────────────────────────────────────────────
function CartItemCard({ ci, onEditar, onQuitar }: { ci: CarritoItem; onEditar: () => void; onQuitar: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <div
      onClick={onEditar}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ background: hov ? '#fafafa' : 'white', border: `1px solid ${hov ? '#d1d5db' : C.border}`, borderRadius: 12, padding: '14px 16px', marginBottom: 10, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, cursor: 'pointer', transition: 'background 0.15s' }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
          <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 14, color: C.navy }}>{ci.cantidad}×</span>
          <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 14, fontWeight: 600, color: '#374151' }}>{ci.nombre}</span>
        </div>
        {ci.mods.length > 0 && (
          <div style={{ paddingLeft: 4, marginTop: 2 }}>
            {ci.mods.map((mod, i) => (
              <div key={i} style={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>
                {mod.accion === 'QUITAR' ? `sin ${mod.ingredienteNombre}` : `+ ${mod.ingredienteNombre}${mod.cantidad > 1 ? ` ×${mod.cantidad}` : ''}`}
              </div>
            ))}
          </div>
        )}
        {ci.notas && (
          <span style={{ display: 'inline-block', fontSize: 11, color: '#92400E', background: '#FEF3C7', borderRadius: 6, padding: '2px 6px', marginTop: 4 }}>
            📝 {ci.notas}
          </span>
        )}
        <p style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 14, color: C.orange, margin: '6px 0 0' }}>
          ${ci.precioTotal.toFixed(2)}
        </p>
      </div>
      <button onClick={(e) => { e.stopPropagation(); onQuitar() }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4, display: 'flex', flexShrink: 0 }}>
        <X size={16} />
      </button>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export function TomaPedidosPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const mesaIdFromUrl = searchParams.get('mesaId')
  const { restauranteId } = useMozoStore()
  const nombreMozo = user?.nombre ?? user?.email ?? 'Mozo'

  const [mesas,        setMesas]        = useState<Mesa[]>([])
  const [sesiones,     setSesiones]     = useState<Map<string, SesionActivaRico>>(new Map())
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [vista,        setVista]        = useState<Vista>('mesas')
  const [sesionActual, setSesionActual] = useState<SesionActual | null>(null)
  const [menuCats,     setMenuCats]     = useState<MenuCategoria[]>([])
  const [recomendados, setRecomendados] = useState<MenuItem[]>([])
  const [restauranteMenu, setRestauranteMenu] = useState<{ id: string; nombre: string; nombreSeccionRecomendados: string } | null>(null)
  const [menuLoading,  setMenuLoading]  = useState(false)
  const [busqueda,     setBusqueda]     = useState('')
  const [catSel,       setCatSel]       = useState<string | null | 'recomendados'>(null)
  const [carrito,      setCarrito]      = useState<CarritoItem[]>([])
  const [itemModal,      setItemModal]      = useState<MenuItem | null>(null)
  const [editingCartId,  setEditingCartId]  = useState<string | null>(null)
  const [modalInitial,   setModalInitial]   = useState<{ cantidad: number; removidos: Set<string>; agregados: Map<string, number>; nota: string } | null>(null)
  const [abriendo,     setAbriendo]     = useState(false)
  const [enviando,     setEnviando]     = useState(false)
  const [enviado,      setEnviado]      = useState(false)
  const [submitError,  setSubmitError]  = useState<string | null>(null)

  const autoOpenRef = useRef(false)

  const cargarSesiones = useCallback(async (ocupadas: Mesa[]) => {
    if (ocupadas.length === 0) return
    const results = await Promise.allSettled(ocupadas.map((m) => api.sesiones.getActiva(m.id)))
    setSesiones((prev) => {
      const next = new Map(prev)
      ocupadas.forEach((m, i) => {
        const r = results[i]
        if (r.status === 'fulfilled' && r.value) next.set(m.id, r.value)
        else if (r.status === 'fulfilled')        next.delete(m.id)
      })
      return next
    })
  }, [])

  const cargarMesas = useCallback(async () => {
    if (!restauranteId) return
    setLoading(true); setError(null)
    try {
      const data = await api.mesas.getAll(restauranteId)
      setMesas(data)
      await cargarSesiones(data.filter((m) => m.estado === 'ocupada'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar mesas')
    } finally {
      setLoading(false)
    }
  }, [restauranteId, cargarSesiones])

  const cargarMenu = useCallback(async () => {
    if (!restauranteId) return
    setMenuLoading(true)
    try {
      const data = await api.menu.getByRestaurante(restauranteId)
      setMenuCats(data.categorias)
      setRecomendados(data.recomendados)
      setRestauranteMenu(data.restaurante)
    } catch {
      // no bloquea el flujo
    } finally {
      setMenuLoading(false)
    }
  }, [restauranteId])

  const abrirMesa = useCallback(async (mesaId: string) => {
    if (abriendo) return
    setAbriendo(true); setError(null)
    try {
      const result = await api.sesiones.abrir(mesaId)
      setSesionActual({ sesionId: result.sesionId, mesaId: result.mesaId, numeroMesa: result.numeroMesa })
      setCarrito([]); setBusqueda(''); setCatSel(null)
      await cargarMenu()
      setVista('menu')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al abrir la sesión')
    } finally {
      setAbriendo(false)
    }
  }, [abriendo, cargarMenu])

  useEffect(() => {
    void cargarMesas()
  }, [cargarMesas])

  // Auto-abrir si viene ?mesaId=X
  useEffect(() => {
    if (mesaIdFromUrl && restauranteId && !autoOpenRef.current) {
      autoOpenRef.current = true
      void abrirMesa(mesaIdFromUrl)
    }
  }, [mesaIdFromUrl, restauranteId, abrirMesa])

  const agregarAlCarrito = (item: Omit<CarritoItem, 'cartId'>) => {
    setCarrito((prev) => [...prev, { ...item, cartId: genId() }])
    setVista('carrito')
  }

  const reemplazarEnCarrito = (cartId: string, item: Omit<CarritoItem, 'cartId'>) => {
    setCarrito((prev) => prev.map((ci) => ci.cartId === cartId ? { ...item, cartId } : ci))
  }

  const quitarDelCarrito = (cartId: string) => {
    setCarrito((prev) => prev.filter((i) => i.cartId !== cartId))
  }

  const handleEditarItem = (ci: CarritoItem) => {
    const menuItem = menuCats.flatMap((c) => c.itemsDirectos).find((i) => i.id === ci.itemId)
    if (!menuItem) return
    const initialRemovidos = new Set(ci.mods.filter((m) => m.accion === 'QUITAR').map((m) => m.itemIngredienteId))
    const initialAgregados = new Map(ci.mods.filter((m) => m.accion === 'AGREGAR').map((m) => [m.itemIngredienteId, m.cantidad]))
    setModalInitial({ cantidad: ci.cantidad, removidos: initialRemovidos, agregados: initialAgregados, nota: ci.notas })
    setEditingCartId(ci.cartId)
    setItemModal(menuItem)
    setVista('menu')
  }

  const totalCarrito    = useMemo(() => carrito.reduce((a, i) => a + i.precioTotal, 0), [carrito])
  const cantidadCarrito = useMemo(() => carrito.reduce((a, i) => a + i.cantidad, 0), [carrito])

  const handleEnviar = async () => {
    if (!sesionActual || enviando || carrito.length === 0) return
    setEnviando(true); setSubmitError(null)
    try {
      await api.pedidos.crear({
        sesionId: sesionActual.sesionId,
        mesaId:   sesionActual.mesaId,
        items: carrito.map((ci) => ({
          itemId:   ci.itemId,
          cantidad: ci.cantidad,
          notas:    ci.notas || undefined,
          mods:     ci.mods.map(({ itemIngredienteId, accion, cantidad }) => ({ itemIngredienteId, accion, cantidad })),
        })),
      })
      setEnviado(true)
      setCarrito([])
      setTimeout(() => {
        setEnviado(false); setSesionActual(null); setMenuCats([])
        setBusqueda(''); setCatSel(null); setVista('mesas')
        void cargarMesas()
      }, 2000)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Error al enviar el pedido')
    } finally {
      setEnviando(false)
    }
  }

  const categoriasFiltradas = useMemo(() => {
    const q = busqueda.toLowerCase().trim()
    return menuCats
      .filter((cat) => !catSel || cat.id === catSel)
      .map((cat) => ({
        id:     cat.id,
        nombre: cat.nombre,
        items:  cat.itemsDirectos.filter((item) => !q || item.nombre.toLowerCase().split(/\s+/).some((p) => p.startsWith(q))),
      }))
      .filter((cat) => cat.items.length > 0)
  }, [menuCats, catSel, busqueda])

  const recomendadosFiltrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim()
    return recomendados.filter((item) => !q || item.nombre.toLowerCase().split(/\s+/).some((p) => p.startsWith(q)))
  }, [recomendados, busqueda])

  // ── Vista C — Carrito ─────────────────────────────────────────────────────────
  if (vista === 'carrito') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <PageHeader
          title={`Comanda · Mesa ${sesionActual?.numeroMesa ?? ''}`}
          icon={<ClipboardList size={18} />}
          onBack={() => setVista('menu')}
          userName={nombreMozo}
          userRole="Mozo"
          userInitials={getInitials(user?.nombre ?? user?.email)}
        />

        <main style={{ flex: 1, overflowY: 'auto', padding: 20, maxWidth: 640, margin: '0 auto', width: '100%' }}>
          {enviado ? (
            <div style={{ background: C.greenBg, border: '1px solid #86efac', borderRadius: 12, padding: '24px', textAlign: 'center' }}>
              <p style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 18, color: C.green, margin: 0 }}>
                Pedido enviado a cocina ✓
              </p>
            </div>
          ) : carrito.length === 0 ? (
            <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 14, color: C.textMuted, textAlign: 'center', padding: '40px 0' }}>
              El carrito está vacío.
            </p>
          ) : (
            <>
              {carrito.map((ci) => (
                <CartItemCard
                  key={ci.cartId}
                  ci={ci}
                  onEditar={() => handleEditarItem(ci)}
                  onQuitar={() => quitarDelCarrito(ci.cartId)}
                />
              ))}
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <span style={{ fontFamily: 'Inter,sans-serif', fontWeight: 600, fontSize: 15, color: '#374151' }}>Total</span>
                <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 22, color: C.navy }}>
                  ${totalCarrito.toFixed(2)}
                </span>
              </div>
              {submitError && (
                <p style={{ color: C.red, fontFamily: 'Inter,sans-serif', fontSize: 13, margin: '0 0 12px' }}>{submitError}</p>
              )}
              <button
                onClick={() => setVista('menu')}
                style={{ width: '100%', padding: '13px 0', borderRadius: 10, border: `1px solid ${C.border}`, background: 'white', color: '#374151', fontFamily: 'Montserrat,sans-serif', fontWeight: 600, fontSize: 14, cursor: 'pointer', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                <Plus size={15} /> Seguir pidiendo
              </button>
              <button
                onClick={() => { void handleEnviar() }}
                disabled={enviando}
                style={{ width: '100%', padding: '14px 0', borderRadius: 10, border: 'none', background: enviando ? '#d1d5db' : C.orange, color: 'white', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 15, cursor: enviando ? 'wait' : 'pointer' }}
              >
                {enviando ? 'Enviando...' : 'Enviar a cocina'}
              </button>
            </>
          )}
        </main>
      </div>
    )
  }

  // ── Vista B — Menú ────────────────────────────────────────────────────────────
  if (vista === 'menu') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <PageHeader
          title={`Mesa ${sesionActual?.numeroMesa ?? ''} · Nueva comanda`}
          icon={<ClipboardList size={18} />}
          onBack={() => { setVista('mesas'); setCarrito([]) }}
          userName={nombreMozo}
          userRole="Mozo"
          userInitials={getInitials(user?.nombre ?? user?.email)}
        />

        <main style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 100px' }}>
          {/* Buscador */}
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <input
              type="text"
              placeholder="Buscar plato..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              style={{ width: '100%', padding: '10px 16px 10px 42px', borderRadius: 12, border: `1px solid ${C.border}`, fontFamily: 'Inter,sans-serif', fontSize: 14, color: '#374151', outline: 'none', boxSizing: 'border-box', background: 'white' }}
            />
            <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: C.textMuted, fontSize: 16 }}>🔍</span>
          </div>

          {/* Pills */}
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 14 }}>
            <button onClick={() => setCatSel(null)} style={{ padding: '6px 14px', borderRadius: 999, flexShrink: 0, background: catSel === null ? C.navy : 'white', color: catSel === null ? 'white' : '#374151', border: catSel === null ? 'none' : `1px solid ${C.border}`, fontFamily: 'Inter,sans-serif', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              Todos
            </button>
            <button onClick={() => setCatSel(catSel === 'recomendados' ? null : 'recomendados')} style={{ padding: '6px 14px', borderRadius: 999, flexShrink: 0, background: catSel === 'recomendados' ? C.orange : 'white', color: catSel === 'recomendados' ? 'white' : '#374151', border: catSel === 'recomendados' ? 'none' : `1px solid ${C.border}`, fontFamily: 'Inter,sans-serif', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              RECOMENDADOS
            </button>
            {menuCats.map((cat) => (
              <button key={cat.id} onClick={() => setCatSel(cat.id === catSel ? null : cat.id)} style={{ padding: '6px 14px', borderRadius: 999, flexShrink: 0, background: cat.id === catSel ? C.orange : 'white', color: cat.id === catSel ? 'white' : '#374151', border: cat.id === catSel ? 'none' : `1px solid ${C.border}`, fontFamily: 'Inter,sans-serif', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                {cat.nombre}
              </button>
            ))}
          </div>

          {/* Ítems */}
          {menuLoading ? (
            <p style={{ textAlign: 'center', fontFamily: 'Inter,sans-serif', fontSize: 14, color: C.textMuted, padding: '40px 0' }}>Cargando menú...</p>
          ) : catSel === 'recomendados' ? (
            recomendadosFiltrados.length === 0 ? (
              <p style={{ textAlign: 'center', fontFamily: 'Inter,sans-serif', fontSize: 14, color: C.textMuted, padding: '40px 0' }}>Sin ítems encontrados.</p>
            ) : (
              <div>
                <p style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13, color: C.textSub, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px', paddingBottom: 6, borderBottom: `1px solid ${C.border}` }}>
                  {restauranteMenu?.nombreSeccionRecomendados}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {recomendadosFiltrados.map((item) => (
                    <div key={item.id} style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 16 }}>
                      <MenuItemImage src={item.imagenUrl} alt={item.nombre} width={56} height={56} borderRadius={8} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontFamily: 'Inter,sans-serif', fontWeight: 600, fontSize: 15, color: '#374151', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.nombre}
                        </p>
                        <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.textSub, margin: '2px 0 0' }}>
                          ${item.precioBase.toFixed(2)}
                        </p>
                      </div>
                      <button
                        onClick={() => setItemModal(item)}
                        style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: C.orange, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, fontSize: 22, fontWeight: 700, lineHeight: 1 }}
                      >
                        +
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
          ) : (
            <>
              {catSel === null && recomendadosFiltrados.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <p style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13, color: C.textSub, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px', paddingBottom: 6, borderBottom: `1px solid ${C.border}` }}>
                    {restauranteMenu?.nombreSeccionRecomendados}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {recomendadosFiltrados.map((item) => (
                      <div key={item.id} style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 16 }}>
                        <MenuItemImage src={item.imagenUrl} alt={item.nombre} width={56} height={56} borderRadius={8} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontFamily: 'Inter,sans-serif', fontWeight: 600, fontSize: 15, color: '#374151', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.nombre}
                          </p>
                          <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.textSub, margin: '2px 0 0' }}>
                            ${item.precioBase.toFixed(2)}
                          </p>
                        </div>
                        <button
                          onClick={() => setItemModal(item)}
                          style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: C.orange, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, fontSize: 22, fontWeight: 700, lineHeight: 1 }}
                        >
                          +
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {categoriasFiltradas.length === 0 ? (
                <p style={{ textAlign: 'center', fontFamily: 'Inter,sans-serif', fontSize: 14, color: C.textMuted, padding: '40px 0' }}>Sin ítems encontrados.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  {categoriasFiltradas.map((cat) => (
                    <div key={cat.id}>
                      <p style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13, color: C.textSub, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px', paddingBottom: 6, borderBottom: `1px solid ${C.border}` }}>
                        {cat.nombre}
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {cat.items.map((item) => (
                          <div key={item.id} style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 16 }}>
                            <MenuItemImage src={item.imagenUrl} alt={item.nombre} width={56} height={56} borderRadius={8} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontFamily: 'Inter,sans-serif', fontWeight: 600, fontSize: 15, color: '#374151', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {item.nombre}
                              </p>
                              <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.textSub, margin: '2px 0 0' }}>
                                ${item.precioBase.toFixed(2)}
                              </p>
                            </div>
                            <button
                              onClick={() => setItemModal(item)}
                              style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: C.orange, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, fontSize: 22, fontWeight: 700, lineHeight: 1 }}
                            >
                              +
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </main>

        {/* FAB carrito */}
        {carrito.length > 0 && (
          <button
            onClick={() => setVista('carrito')}
            style={{ position: 'fixed', bottom: 28, right: 28, width: 56, height: 56, borderRadius: '50%', background: C.navy, color: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,0.2)', zIndex: 100 }}
          >
            <ShoppingBag size={22} />
            <span style={{ position: 'absolute', top: -4, right: -4, width: 20, height: 20, borderRadius: '50%', background: C.orange, color: 'white', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {cantidadCarrito}
            </span>
          </button>
        )}

        {/* Modal ítem */}
        {itemModal && (
          <ItemModal
            item={itemModal}
            initialCantidad={modalInitial?.cantidad}
            initialRemovidos={modalInitial?.removidos}
            initialAgregados={modalInitial?.agregados}
            initialNota={modalInitial?.nota}
            isEditing={editingCartId !== null}
            onAgregar={(newItem) => {
              if (editingCartId) {
                reemplazarEnCarrito(editingCartId, newItem)
                setEditingCartId(null); setModalInitial(null); setItemModal(null)
                setVista('carrito')
              } else {
                agregarAlCarrito(newItem)
                setItemModal(null)
              }
            }}
            onCerrar={() => {
              const wasEditing = editingCartId !== null
              setItemModal(null); setEditingCartId(null); setModalInitial(null)
              if (wasEditing) setVista('carrito')
            }}
          />
        )}
      </div>
    )
  }

  // ── Vista A — Mesas ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader
        title="Tomar pedido"
        icon={<ClipboardList size={18} />}
        onBack={() => navigate('/mozo')}
        userName={nombreMozo}
        userRole="Mozo"
        userInitials={getInitials(user?.nombre ?? user?.email)}
      />

      <main style={{ padding: 20 }}>
        {error && (
          <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.red, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>{error}</p>
        )}
        {abriendo && (
          <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.textMuted, textAlign: 'center', padding: '24px 0' }}>Abriendo mesa...</p>
        )}
        {loading ? (
          <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.textMuted, textAlign: 'center', paddingTop: 48 }}>Cargando mesas...</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
            {mesas.map((mesa) => (
              <MesaTile
                key={mesa.id}
                mesa={mesa}
                sesion={sesiones.get(mesa.id)}
                onClick={() => { void abrirMesa(mesa.id) }}
              />
            ))}
            {mesas.length === 0 && (
              <div style={{ gridColumn: '1/-1', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160 }}>
                <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 14, color: C.textMuted }}>Sin mesas asignadas.</span>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
