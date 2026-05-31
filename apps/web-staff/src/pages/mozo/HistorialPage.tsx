import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronLeft, ChevronUp, Search, X } from 'lucide-react'
import { api } from '../../services/api'
import type { PedidoRico, EditarItemBody } from '../../services/api'
import { useMozoStore } from '../../store/mozoStore'

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  navy:      '#2D3561',
  orange:    '#E8563A',
  green:     '#16a34a',
  border:    '#e5e7eb',
  bgLight:   '#f9fafb',
  textMuted: '#6b7280',
  red:       '#dc2626',
  white:     '#ffffff',
} as const

// ── Period helpers ─────────────────────────────────────────────────────────────
type Period = 'hoy' | 'ayer' | 'semana' | 'mes'

const PERIOD_LABELS: Record<Period, string> = {
  hoy:    'Hoy',
  ayer:   'Ayer',
  semana: 'Última semana',
  mes:    'Último mes',
}

const toLocalDateStr = (date: Date): string => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const getPeriodBounds = (period: Period) => {
  const now = new Date()
  const hoy = toLocalDateStr(now)
  const offset = (days: number) => {
    const d = new Date(now); d.setDate(d.getDate() - days); return toLocalDateStr(d)
  }
  let from: string, to = hoy
  switch (period) {
    case 'ayer':   from = offset(1); to = offset(1); break
    case 'semana': from = offset(6); break
    case 'mes':    from = offset(29); break
    default:       from = hoy
  }
  return { from: new Date(from + 'T00:00:00'), to: new Date(to + 'T23:59:59') }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function cantActual(item: PedidoRico['items'][number]): number {
  return item.cantidadEditada ?? item.cantidad
}

function countWords(text: string): number {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/).length
}

function shortId(id: string): string {
  return '#' + id.slice(0, 8).toUpperCase()
}

function fmt(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

// ── EdicionItem ───────────────────────────────────────────────────────────────
interface EdicionAdmin {
  id: string
  justificacion: string
  creadoEn: string
  editor: { nombre: string; tipo: string }
  itemsEliminados: { id: string; itemNombre: string; cantidadAntes: number; cantidadDespues: number; precioUnitario: number }[]
}

// ── StepBtn ───────────────────────────────────────────────────────────────────
function StepBtn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #D1D5DB', background: disabled ? '#F9FAFB' : 'white', color: disabled ? '#D1D5DB' : '#374151', fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 16, lineHeight: 1, cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
    >
      {label}
    </button>
  )
}

// ── EditModal ─────────────────────────────────────────────────────────────────
function EditModal({ pedido, onClose, onDone }: { pedido: PedidoRico; onClose: () => void; onDone: () => void }) {
  const isPagado = pedido.pago?.estado === 'aprobado'
  const [quantities,    setQuantities]    = useState<Record<string, number>>(() => Object.fromEntries(pedido.items.map((i) => [i.id, cantActual(i)])))
  const [justificacion, setJustificacion] = useState('')
  const [submitting,    setSubmitting]    = useState(false)
  const [error,         setError]         = useState<string | null>(null)

  const words     = countWords(justificacion)
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
      await api.pedidos.editarItem(pedido.id, body)
      onDone()
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
          <h3 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 16, color: '#2D3561', margin: 0 }}>Editar {shortId(pedido.id)}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 4, display: 'flex' }}><X size={18} /></button>
        </div>

        {isPagado ? (
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#DC2626', margin: 0 }}>Este pedido ya fue pagado y no puede editarse.</p>
        ) : (
          <>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#6B7280', margin: '0 0 16px' }}>Ajustá la cantidad de cada ítem.</p>
            <div style={{ marginBottom: 16 }}>
              {pedido.items.map((item) => {
                const actual  = cantActual(item)
                const current = quantities[item.id]
                const changed = current !== actual
                const anulado = current === 0
                return (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 8, background: changed ? (anulado ? '#FEF2F0' : '#FFF7ED') : 'transparent', marginBottom: 4 }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#374151' }}>{item.item.nombre}</span>
                      {anulado && <div><span style={{ fontSize: 11, fontWeight: 600, color: '#DC2626' }}>Ítem anulado</span></div>}
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
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, color: '#374151' }}>Justificación</label>
                <span style={{ fontSize: 11, color: words > 50 ? '#E8563A' : '#9CA3AF' }}>{words}/50 palabras</span>
              </div>
              <textarea
                value={justificacion} onChange={(e) => setJustificacion(e.target.value)} rows={3}
                placeholder="Describí el motivo de la edición…"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${words > 50 ? '#E8563A' : '#D1D5DB'}`, fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#374151', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            {hasChanges && todosAnuladosTrasEdit && (
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#92400E', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 6, padding: '8px 12px', margin: '0 0 12px' }}>
                Esto anulará el pedido completo.
              </p>
            )}
            {error && <p style={{ fontSize: 12, color: '#E8563A', margin: '0 0 12px' }}>{error}</p>}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #D1D5DB', background: 'white', fontSize: 13, color: '#374151', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleSubmit} disabled={!canSubmit} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: canSubmit ? '#E8563A' : '#D1D5DB', fontSize: 13, fontWeight: 600, color: canSubmit ? 'white' : '#9CA3AF', cursor: canSubmit ? 'pointer' : 'not-allowed' }}>
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
function PedidoCard({ pedido, onEdit }: { pedido: PedidoRico; onEdit: (p: PedidoRico) => void }) {
  const [expanded,  setExpanded]  = useState(false)
  const [editions,  setEditions]  = useState<EdicionAdmin[] | null>(null)
  const [loadingEd, setLoadingEd] = useState(false)
  const isPagado = pedido.pago?.estado === 'aprobado'

  async function handleToggle() {
    if (!expanded && editions === null) {
      setLoadingEd(true)
      try {
        // GET /pedidos/:id/ediciones requiere rol admin — mozos pueden recibir 403
        const res = await fetch(`${import.meta.env.VITE_API_URL ?? ''}/pedidos/${pedido.id}/ediciones`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('access_token') ?? ''}` },
        })
        if (res.ok) {
          setEditions((await res.json()) as EdicionAdmin[])
        } else {
          setEditions([])
        }
      } catch {
        setEditions([])
      } finally {
        setLoadingEd(false)
      }
    }
    setExpanded((p) => !p)
  }

  const isAnulado = pedido.estado === 'anulado'
  const hasEdits  = pedido.items.some((i) => i.cantidadEditada !== null)

  return (
    <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e5e7eb', overflow: 'hidden', flexShrink: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #f3f4f6', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13, color: '#2D3561' }}>{pedido.mesa.numero}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13, color: '#2D3561' }}>Mesa {pedido.mesa.numero}</span>
            <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 11, color: '#9CA3AF' }}>{shortId(pedido.id)}</span>
          </div>
          <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 11, color: '#9CA3AF' }}>{fmtDate(pedido.updatedAt)} {fmt(pedido.updatedAt)}</span>
        </div>
        {(() => {
          const label  = isAnulado ? 'Anulado' : hasEdits ? 'Entregado · Editado' : 'Entregado'
          const bg     = isAnulado ? '#fef2f2' : hasEdits ? '#FDE5DF' : '#f3f4f6'
          const color  = isAnulado ? '#dc2626' : hasEdits ? '#E8563A' : '#6b7280'
          const border = isAnulado ? '#fecaca' : hasEdits ? '#fca5a5' : '#e5e7eb'
          return <span style={{ background: bg, color, border: `1px solid ${border}`, fontFamily: 'Inter,sans-serif', fontWeight: 600, fontSize: 11, padding: '3px 8px', borderRadius: 20, flexShrink: 0 }}>{label}</span>
        })()}
      </div>

      {/* Items */}
      <div style={{ padding: '10px 16px' }}>
        {pedido.items.map((item) => {
          const cantOrig  = item.cantidad
          const cantEdit  = item.cantidadEditada ?? cantOrig
          const cantQuita = cantOrig - cantEdit
          return (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '4px 0' }}>
              <div>
                {cantEdit === 0 ? (
                  <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: '#DC2626', textDecoration: 'line-through' }}>{cantOrig}× {item.item.nombre}</span>
                ) : cantQuita > 0 ? (
                  <>
                    <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: '#374151' }}>{cantEdit}× {item.item.nombre}</span>
                    <div><span style={{ fontSize: 12, color: '#DC2626', textDecoration: 'line-through' }}>{cantQuita}× {item.item.nombre}</span></div>
                  </>
                ) : (
                  <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: '#374151' }}>{cantOrig}× {item.item.nombre}</span>
                )}
              </div>
              <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: '#6B7280', marginLeft: 8 }}>
                ${(cantActual(item) * Number(item.precioUnitario)).toFixed(2)}
              </span>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid #f3f4f6', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={handleToggle} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, padding: '5px 10px', fontFamily: 'Inter,sans-serif', fontSize: 12, color: '#6B7280', cursor: 'pointer' }}>
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {loadingEd ? 'Cargando…' : 'Ver ediciones'}
          </button>
          {!isPagado && !isAnulado && (
            <button onClick={() => onEdit(pedido)} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, padding: '5px 10px', fontFamily: 'Inter,sans-serif', fontSize: 12, color: '#E8563A', cursor: 'pointer' }}>
              Editar
            </button>
          )}
          {isPagado && (
            <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 11, fontWeight: 600, color: '#DC2626', padding: '5px 10px', border: '1px solid #FECACA', borderRadius: 6, background: '#FEF2F2' }}>Ya pagado</span>
          )}
        </div>
        <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 14, color: '#2D3561' }}>
          ${pedido.items.reduce((s, i) => s + cantActual(i) * Number(i.precioUnitario), 0).toFixed(2)}
        </div>
      </div>

      {/* Ediciones */}
      {expanded && (
        <div style={{ borderTop: '1px solid #f3f4f6', background: '#F9FAFB', padding: '12px 16px' }}>
          {loadingEd ? (
            <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: '#9CA3AF', margin: 0 }}>Cargando…</p>
          ) : editions === null || editions.length === 0 ? (
            <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: '#9CA3AF', margin: 0 }}>Sin ediciones registradas.</p>
          ) : (
            editions.map((ed, idx) => (
              <div key={ed.id} style={{ marginBottom: idx < editions.length - 1 ? 12 : 0, paddingBottom: idx < editions.length - 1 ? 12 : 0, borderBottom: idx < editions.length - 1 ? '1px solid #e5e7eb' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, fontWeight: 600, color: '#374151' }}>{ed.editor.nombre}</span>
                  <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 11, color: '#9CA3AF' }}>{fmtDate(ed.creadoEn)} {fmt(ed.creadoEn)}</span>
                </div>
                <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: '#6B7280', margin: '0 0 8px', fontStyle: 'italic' }}>"{ed.justificacion}"</p>
                {ed.itemsEliminados.map((ei) => (
                  <div key={ei.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: '#374151' }}>{ei.itemNombre}: {ei.cantidadAntes} → {ei.cantidadDespues}</span>
                    <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 11, color: '#DC2626', marginLeft: 'auto' }}>
                      −${((ei.cantidadAntes - ei.cantidadDespues) * ei.precioUnitario).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function HistorialPage() {
  const navigate = useNavigate()
  const { restauranteId } = useMozoStore()
  const [pedidos,       setPedidos]       = useState<PedidoRico[]>([])
  const [loading,       setLoading]       = useState(false)
  const [period,        setPeriod]        = useState<Period>('hoy')
  const [search,        setSearch]        = useState('')
  const [editingPedido, setEditingPedido] = useState<PedidoRico | null>(null)

  const load = useCallback(async () => {
    if (!restauranteId) return
    setLoading(true)
    try {
      const [entregados, anulados] = await Promise.all([
        api.pedidos.getByRestaurante(restauranteId, { estado: 'entregado' }),
        api.pedidos.getByRestaurante(restauranteId, { estado: 'anulado' }),
      ])
      setPedidos([...entregados, ...anulados].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()))
    } catch {
      // silencioso
    } finally {
      setLoading(false)
    }
  }, [restauranteId])

  useEffect(() => { void load() }, [load])

  const filteredByPeriod = useMemo(() => {
    const { from, to } = getPeriodBounds(period)
    return pedidos.filter((p) => {
      const t = new Date(p.updatedAt)
      return t >= from && t <= to
    })
  }, [pedidos, period])

  const filtered = useMemo(() => {
    return filteredByPeriod.filter((p) => {
      if (!search.trim()) return true
      return p.mesa.numero.toLowerCase().includes(search.trim().toLowerCase())
    })
  }, [filteredByPeriod, search])

  const pedidoCount  = filteredByPeriod.length
  const editadoCount = filteredByPeriod.filter((p) => p.items.some((i) => i.cantidadEditada !== null)).length
  const anuladoCount = filteredByPeriod.filter((p) => p.estado === 'anulado').length

  function handleEditDone() {
    setEditingPedido(null)
    void load()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header */}
      <header style={{ background: C.navy, height: 56, display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12, flexShrink: 0 }}>
        <button onClick={() => navigate('/mozo')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Inter,sans-serif', fontSize: 13 }}>
          <ChevronLeft size={16} /> Panel
        </button>
        <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 18, color: 'white' }}>Historial</span>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {/* Period pills */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <button
              key={p} onClick={() => setPeriod(p)}
              style={{ padding: '6px 14px', borderRadius: 20, border: period === p ? `1px solid ${C.orange}` : '1px solid #D1D5DB', background: period === p ? C.orange : 'white', color: period === p ? 'white' : '#6B7280', fontFamily: 'Inter,sans-serif', fontSize: 12, fontWeight: period === p ? 600 : 400, cursor: 'pointer' }}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {/* KPIs */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          {[
            { label: 'Entregados', value: pedidoCount },
            { label: 'Editados',   value: editadoCount },
            { label: 'Anulados',   value: anuladoCount },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6b7280', fontWeight: 600 }}>{label}</div>
              <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 22, color: '#111827' }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'white', border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 12px', marginBottom: 16 }}>
          <Search size={14} color="#9CA3AF" />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por mesa..."
            style={{ flex: 1, border: 'none', outline: 'none', fontFamily: 'Inter,sans-serif', fontSize: 13, color: '#374151', background: 'transparent' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#9CA3AF', display: 'flex' }}>
              <X size={13} />
            </button>
          )}
        </div>

        {/* List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading ? (
            <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingTop: 32 }}>Cargando pedidos…</p>
          ) : filtered.length === 0 ? (
            <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingTop: 32 }}>No hay pedidos entregados en este período.</p>
          ) : (
            filtered.map((p) => (
              <PedidoCard key={p.id} pedido={p} onEdit={setEditingPedido} />
            ))
          )}
        </div>
      </div>

      {editingPedido && (
        <EditModal pedido={editingPedido} onClose={() => setEditingPedido(null)} onDone={handleEditDone} />
      )}
    </div>
  )
}
