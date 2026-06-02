import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { io, type Socket } from 'socket.io-client'
import { AlertTriangle, ChevronRight, ClipboardList, Clock, RefreshCw, X } from 'lucide-react'
import { useAuth } from '@menyu/auth'
import { getToken, api } from '../../services/api'
import type { PedidoRico, EditarItemBody } from '../../services/api'
import { useMozoStore } from '../../store/mozoStore'
import { PageHeader } from '../../components/PageHeader'

function getInitials(name?: string): string {
  if (!name) return '?'
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

// ── Palette & WS ──────────────────────────────────────────────────────────────
const C = {
  navy:      '#2D3561',
  orange:    '#E8563A',
  green:     '#16a34a',
  greenBg:   '#dcfce7',
  amber:     '#d97706',
  amberBg:   '#fef3c7',
  blue:      '#2563eb',
  blueBg:    '#dbeafe',
  border:    '#e5e7eb',
  bgLight:   '#f9fafb',
  textMuted: '#6b7280',
  white:     '#ffffff',
  red:       '#dc2626',
  redBg:     '#fee2e2',
} as const

const WS_URL: string =
  (import.meta.env.VITE_WS_URL as string | undefined) ??
  (import.meta.env.VITE_API_URL as string | undefined)?.replace('/api', '') ??
  ''

type EstadoPedido = 'pendiente' | 'en_preparacion' | 'listo'

const ESTADOS: EstadoPedido[] = ['pendiente', 'en_preparacion', 'listo']

const ESTADO_LABEL: Record<EstadoPedido, string> = {
  pendiente:      'Pendiente',
  en_preparacion: 'En preparación',
  listo:          'Listo',
}

const ESTADO_NEXT: Record<EstadoPedido, EstadoPedido | null> = {
  pendiente:      'en_preparacion',
  en_preparacion: 'listo',
  listo:          null,
}

const ESTADO_COLORS: Record<EstadoPedido, { bg: string; text: string; border: string }> = {
  pendiente:      { bg: C.amberBg, text: C.amber, border: '#fde68a' },
  en_preparacion: { bg: C.blueBg,  text: C.blue,  border: '#bfdbfe' },
  listo:          { bg: C.greenBg, text: C.green, border: '#bbf7d0' },
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

function minDesde(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
}

function cantActual(item: PedidoRico['items'][number]): number {
  return item.cantidadEditada ?? item.cantidad
}

function countWords(text: string): number {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/).length
}

function shortId(id: string): string {
  return '#' + id.slice(0, 8).toUpperCase()
}

// ── StepBtn ───────────────────────────────────────────────────────────────────
function StepBtn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 28, height: 28, borderRadius: 6, border: '1px solid #D1D5DB',
        background: disabled ? '#F9FAFB' : 'white', color: disabled ? '#D1D5DB' : '#374151',
        fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 16, lineHeight: 1,
        cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}
    >
      {label}
    </button>
  )
}

// ── EditModal ─────────────────────────────────────────────────────────────────
function EditModal({ pedido, onClose, onDone }: { pedido: PedidoRico; onClose: () => void; onDone: (updated: PedidoRico) => void }) {
  const isPagado = pedido.pago?.estado === 'aprobado'
  const [quantities,    setQuantities]    = useState<Record<string, number>>(() => Object.fromEntries(pedido.items.map((i) => [i.id, cantActual(i)])))
  const [justificacion, setJustificacion] = useState('')
  const [submitting,    setSubmitting]    = useState(false)
  const [error,         setError]         = useState<string | null>(null)

  const words    = countWords(justificacion)
  const ediciones = pedido.items.filter((item) => quantities[item.id] !== cantActual(item)).map((item) => ({ pedidoItemId: item.id, cantidadNueva: quantities[item.id] }))
  const hasChanges            = ediciones.length > 0
  const todosAnuladosTrasEdit = pedido.items.every((item) => quantities[item.id] === 0)
  const canSubmit             = hasChanges && justificacion.trim().length > 0 && words <= 50 && !submitting && !isPagado

  function setQty(id: string, val: number) { setQuantities((prev) => ({ ...prev, [id]: val })) }

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true); setError(null)
    try {
      const body: EditarItemBody = { justificacion: justificacion.trim(), ediciones }
      const updated = await api.pedidos.editarItem(pedido.id, body)
      onDone(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al editar pedido')
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 500, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 16, color: '#2D3561', margin: 0 }}>
            Editar pedido {shortId(pedido.id)}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 4, display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        {isPagado ? (
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#DC2626', margin: 0 }}>Este pedido ya fue pagado y no puede editarse.</p>
        ) : (
          <>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#6B7280', margin: '0 0 16px' }}>
              Ajustá la cantidad de cada ítem. Solo se registran los ítems que cambian.
            </p>
            <div style={{ marginBottom: 16 }}>
              {pedido.items.map((item) => {
                const actual  = cantActual(item)
                const current = quantities[item.id]
                const changed = current !== actual
                const anulado = current === 0
                return (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 8, background: changed ? (anulado ? '#FEF2F0' : '#FFF7ED') : 'transparent', marginBottom: 4 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#374151' }}>{item.item.nombre}</span>
                      {anulado && <div><span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600, color: '#DC2626' }}>Ítem anulado</span></div>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <StepBtn label="−" onClick={() => setQty(item.id, Math.max(0, current - 1))} disabled={current === 0} />
                      <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 14, color: anulado ? '#DC2626' : '#2D3561', minWidth: 20, textAlign: 'center' }}>{current}</span>
                      <StepBtn label="+" onClick={() => setQty(item.id, Math.min(actual, current + 1))} disabled={current === actual} />
                    </div>
                    <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#6B7280', minWidth: 56, textAlign: 'right', flexShrink: 0 }}>
                      ${(current * Number(item.precioUnitario)).toFixed(2)}
                    </span>
                  </div>
                )
              })}
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, color: '#374151' }}>Justificación</label>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: words > 50 ? '#E8563A' : '#9CA3AF' }}>{words}/50 palabras</span>
              </div>
              <textarea
                value={justificacion}
                onChange={(e) => setJustificacion(e.target.value)}
                rows={3}
                placeholder="Describí el motivo de la edición…"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${words > 50 ? '#E8563A' : '#D1D5DB'}`, fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#374151', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            {hasChanges && todosAnuladosTrasEdit && (
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#92400E', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 6, padding: '8px 12px', margin: '0 0 12px' }}>
                Esto anulará el pedido completo.
              </p>
            )}
            {error && <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#E8563A', margin: '0 0 12px' }}>{error}</p>}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #D1D5DB', background: 'white', fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#374151', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={handleSubmit} disabled={!canSubmit} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: canSubmit ? '#E8563A' : '#D1D5DB', fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: canSubmit ? 'white' : '#9CA3AF', cursor: canSubmit ? 'pointer' : 'not-allowed' }}>
                {submitting ? 'Guardando…' : 'Guardar edición'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── PedidoCard ────────────────────────────────────────────────────────────────
function PedidoCard({
  pedido, onAvanzar, onEntregar, onEditar, loading,
}: {
  pedido: PedidoRico; onAvanzar: (id: string, estado: EstadoPedido) => void
  onEntregar: (id: string) => void; onEditar: (p: PedidoRico) => void; loading: boolean
}) {
  const estado    = pedido.estado as EstadoPedido
  const siguiente = ESTADO_NEXT[estado]
  const colores   = ESTADO_COLORS[estado] ?? ESTADO_COLORS.pendiente
  const minutos   = minDesde(pedido.createdAt)
  const urgente   = minutos >= 20
  const hasEdits  = pedido.items.some((i) => i.cantidadEditada !== null)
  const isAnulado = pedido.estado === 'anulado'
  const badgeLabel  = isAnulado ? 'Anulado' : hasEdits ? `${ESTADO_LABEL[estado] ?? estado} · Editado` : ESTADO_LABEL[estado] ?? estado
  const badgeBg     = isAnulado ? '#fef2f2' : hasEdits ? '#FDE5DF' : colores.bg
  const badgeColor  = isAnulado ? '#dc2626' : hasEdits ? '#E8563A' : colores.text
  const badgeBorder = isAnulado ? '#fecaca' : hasEdits ? '#fca5a5' : colores.border
  const canEdit     = estado === 'pendiente' || estado === 'en_preparacion'

  return (
    <div style={{ width: '100%', boxSizing: 'border-box', background: C.white, border: `1px solid ${urgente && estado === 'pendiente' ? '#fca5a5' : C.border}`, borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 16, color: C.navy }}>Mesa {pedido.mesa.numero}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <Clock size={12} color={urgente ? C.red : C.textMuted} />
            <span style={{ fontSize: 12, color: urgente ? C.red : C.textMuted, fontWeight: urgente ? 600 : 400 }}>
              {formatHora(pedido.createdAt)} · {minutos}min
            </span>
            {urgente && <AlertTriangle size={12} color={C.red} />}
          </div>
        </div>
        <span style={{ background: badgeBg, color: badgeColor, border: `1px solid ${badgeBorder}`, borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {badgeLabel}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {pedido.items.map((item) => {
          const cantOrig   = item.cantidad
          const cantEdit   = item.cantidadEditada ?? cantOrig
          const cantQuitada = cantOrig - cantEdit
          return (
            <div key={item.id} style={{ fontSize: 13 }}>
              {cantEdit === 0 ? (
                <span style={{ fontWeight: 600, color: C.red, textDecoration: 'line-through' }}>{cantOrig}× {item.item.nombre}</span>
              ) : cantQuitada > 0 ? (
                <>
                  <span style={{ fontWeight: 600, color: '#374151' }}>{cantEdit}× {item.item.nombre}</span>
                  <div><span style={{ fontSize: 12, color: C.red, textDecoration: 'line-through' }}>{cantQuitada}× {item.item.nombre}</span></div>
                </>
              ) : (
                <span style={{ fontWeight: 600, color: '#374151' }}>{cantOrig}× {item.item.nombre}</span>
              )}
              {cantEdit > 0 && item.mods.length > 0 && (
                <div style={{ paddingLeft: 12, marginTop: 2 }}>
                  {item.mods.map((mod, i) => (
                    <div key={i} style={{ fontSize: 11, color: mod.accion.toLowerCase() === 'quitar' ? C.red : '#16a34a', marginTop: 2 }}>
                      {mod.accion.toLowerCase() === 'quitar' ? `sin ${mod.itemIngrediente?.ingrediente?.nombre ?? ''}` : `+${mod.cantidad ?? 1} ${mod.itemIngrediente?.ingrediente?.nombre ?? ''}`}
                    </div>
                  ))}
                </div>
              )}
              {cantEdit > 0 && item.notas && item.notas.trim() !== '' && (
                <div style={{ fontSize: 11, color: '#854d0e', background: '#fef9c3', border: '1px solid #fef08a', borderRadius: 6, padding: '3px 8px', marginTop: 4, fontStyle: 'italic' }}>
                  📝 {item.notas}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {siguiente ? (
        <button
          onClick={() => onAvanzar(pedido.id, siguiente)}
          disabled={loading}
          style={{ marginTop: 4, background: loading ? '#d1d5db' : C.navy, color: C.white, border: 'none', borderRadius: 7, padding: '8px 12px', fontSize: 12, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'Montserrat,sans-serif' }}
        >
          {loading ? <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <ChevronRight size={12} />}
          {ESTADO_LABEL[siguiente]}
        </button>
      ) : estado === 'listo' ? (
        <button
          onClick={() => onEntregar(pedido.id)}
          disabled={loading}
          style={{ marginTop: 4, background: loading ? '#d1d5db' : C.green, color: C.white, border: 'none', borderRadius: 7, padding: '8px 12px', fontSize: 12, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'Montserrat,sans-serif' }}
        >
          {loading && <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} />}
          ✓ Entregar
        </button>
      ) : null}

      {canEdit && (
        <button
          onClick={() => onEditar(pedido)}
          style={{ background: 'none', border: 'none', padding: '2px 0', fontSize: 11, color: '#9CA3AF', cursor: 'pointer', fontFamily: 'Inter, sans-serif', textAlign: 'center', width: '100%' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = C.textMuted }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#9CA3AF' }}
        >
          Editar pedido
        </button>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function PedidosPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { restauranteId } = useMozoStore()
  const nombreMozo = user?.nombre ?? user?.email ?? 'Mozo'
  const [pedidos,       setPedidos]       = useState<PedidoRico[]>([])
  const [loadingIds,    setLoadingIds]    = useState<Set<string>>(new Set())
  const [error,         setError]         = useState<string | null>(null)
  const [editingPedido, setEditingPedido] = useState<PedidoRico | null>(null)
  const socketRef = useRef<Socket | null>(null)

  const fetchAll = useCallback(async () => {
    if (!restauranteId) return
    setError(null)
    try {
      const [pendientes, enPrep, listos] = await Promise.all([
        api.pedidos.getByRestaurante(restauranteId, { estado: 'pendiente' }),
        api.pedidos.getByRestaurante(restauranteId, { estado: 'en_preparacion' }),
        api.pedidos.getByRestaurante(restauranteId, { estado: 'listo' }),
      ])
      setPedidos([...pendientes, ...enPrep, ...listos])
    } catch {
      setError('No se pudieron cargar los pedidos.')
    }
  }, [restauranteId])

  useEffect(() => { void fetchAll() }, [fetchAll])

  useEffect(() => {
    if (!restauranteId) return
    const socket: Socket = io(`${WS_URL}/ws`, { auth: { token: getToken() }, transports: ['websocket'] })
    socketRef.current = socket
    socket.on('connect', () => { socket.emit('cocina:join', { restauranteId }) })
    socket.on('order:new', (pedido: PedidoRico) => {
      setPedidos((prev) => prev.some((p) => p.id === pedido.id) ? prev : [pedido, ...prev])
    })
    socket.on('order:updated', (pedido: PedidoRico) => {
      setPedidos((prev) => {
        const estado = pedido.estado as string
        if (!ESTADOS.includes(estado as EstadoPedido)) return prev.filter((p) => p.id !== pedido.id)
        const idx = prev.findIndex((p) => p.id === pedido.id)
        if (idx === -1) return [pedido, ...prev]
        const next = [...prev]; next[idx] = pedido; return next
      })
    })
    return () => { socket.disconnect(); socketRef.current = null }
  }, [restauranteId])

  const handleAvanzar = useCallback(async (id: string, nuevoEstado: EstadoPedido) => {
    setLoadingIds((prev) => new Set(prev).add(id))
    const prev = pedidos.find((p) => p.id === id)
    setPedidos((all) => all.map((p) => p.id === id ? { ...p, estado: nuevoEstado } : p))
    try {
      const updated = await api.pedidos.cambiarEstado(id, nuevoEstado)
      const estado  = updated.estado as string
      if (!ESTADOS.includes(estado as EstadoPedido)) {
        setPedidos((all) => all.filter((p) => p.id !== id))
      } else {
        setPedidos((all) => all.map((p) => p.id === id ? updated : p))
      }
    } catch {
      if (prev) setPedidos((all) => all.map((p) => p.id === id ? prev : p))
    } finally {
      setLoadingIds((prev) => { const n = new Set(prev); n.delete(id); return n })
    }
  }, [pedidos])

  const handleEntregar = useCallback(async (id: string) => {
    setLoadingIds((prev) => new Set(prev).add(id))
    const prevPedido = pedidos.find((p) => p.id === id)
    setPedidos((all) => all.filter((p) => p.id !== id))
    try {
      await api.pedidos.cambiarEstado(id, 'entregado')
    } catch {
      if (prevPedido) setPedidos((all) => [...all, prevPedido])
    } finally {
      setLoadingIds((prev) => { const n = new Set(prev); n.delete(id); return n })
    }
  }, [pedidos])

  const handleEditDone = useCallback((updated: PedidoRico) => {
    setEditingPedido(null)
    if (updated.estado === 'anulado' || !ESTADOS.includes(updated.estado as EstadoPedido)) {
      setPedidos((prev) => prev.filter((p) => p.id !== updated.id))
    } else {
      setPedidos((prev) => prev.map((p) => p.id === updated.id ? updated : p))
    }
  }, [])

  const byEstado = (estado: EstadoPedido) =>
    pedidos
      .filter((p) => p.estado === estado)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <PageHeader
        title="Pedidos"
        icon={<ClipboardList size={18} />}
        onBack={() => navigate('/mozo')}
        onRefresh={() => void fetchAll()}
        userName={nombreMozo}
        userRole="Mozo"
        userInitials={getInitials(user?.nombre ?? user?.email)}
      />

      {error && (
        <div style={{ background: C.redBg, color: C.red, padding: '10px 20px', fontSize: 13 }}>{error}</div>
      )}

      {/* Kanban */}
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, padding: 16, overflow: 'hidden' }}>
        {ESTADOS.map((estado) => {
          const items   = byEstado(estado)
          const colores = ESTADO_COLORS[estado]
          return (
            <div key={estado} style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bgLight, borderRadius: 12, border: `1px solid ${C.border}` }}>
              <div style={{ flexShrink: 0, padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.white }}>
                <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 14, color: C.navy }}>{ESTADO_LABEL[estado]}</span>
                <span style={{ background: colores.bg, color: colores.text, borderRadius: 20, padding: '2px 8px', fontSize: 12, fontWeight: 700 }}>
                  {items.length}
                </span>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {items.length === 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: C.textMuted, fontSize: 13 }}>Sin pedidos</div>
                ) : (
                  items.map((p) => (
                    <PedidoCard
                      key={p.id} pedido={p}
                      onAvanzar={handleAvanzar} onEntregar={handleEntregar}
                      onEditar={setEditingPedido} loading={loadingIds.has(p.id)}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>

      {editingPedido && (
        <EditModal pedido={editingPedido} onClose={() => setEditingPedido(null)} onDone={handleEditDone} />
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
