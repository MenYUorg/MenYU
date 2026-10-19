import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '@menyu/auth'
import { useContextStore } from '../../../store/contextStore'
import { api } from '../../../services/api'
import type { PedidoAdmin, EdicionAdmin } from '../../../services/api'
import { Search, ChevronDown, ChevronUp, X, ClipboardList } from 'lucide-react'
import { APARIENCIA_PEDIDOS, EditarPedidoModal, type ItemEditable } from '@menyu/ui/editar-pedido'

/* ── period helpers ─────────────────────────────────────────────────────────── */
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

const getPeriodBounds = (period: string) => {
  const now = new Date()
  const hoy = toLocalDateStr(now)

  const offsetStr = (days: number) => {
    const d = new Date(now)
    d.setDate(d.getDate() - days)
    return toLocalDateStr(d)
  }

  let fromStr: string
  let toStr: string = hoy

  switch (period) {
    case 'ayer':   fromStr = offsetStr(1); toStr = offsetStr(1); break
    case 'semana': fromStr = offsetStr(6); break
    case 'mes':    fromStr = offsetStr(29); break
    default:       fromStr = hoy
  }

  return {
    from: new Date(fromStr + 'T00:00:00'),
    to:   new Date(toStr + 'T23:59:59'),
  }
}

/* ── utils ──────────────────────────────────────────────────────────────────── */
function cantActual(item: PedidoAdmin['items'][number]): number {
  return item.cantidadEditada ?? item.cantidad
}

function calcTotal(pedido: PedidoAdmin): number {
  return pedido.items.reduce((s, i) => s + cantActual(i) * Number(i.precioUnitario), 0)
}

function itemsEditables(pedido: PedidoAdmin): ItemEditable[] {
  return pedido.items.map((i) => ({ id: i.id, nombre: i.item.nombre, cantidadActual: cantActual(i), precioUnitario: Number(i.precioUnitario) }))
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

/* ── pedido card ─────────────────────────────────────────────────────────────── */
function PedidoCard({
  pedido,
  canEdit,
  onEdit,
}: {
  pedido: PedidoAdmin
  canEdit: boolean
  onEdit: (p: PedidoAdmin) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [editions, setEditions] = useState<EdicionAdmin[] | null>(null)
  const [loadingEd, setLoadingEd] = useState(false)
  const total = calcTotal(pedido)
  const isPagado = pedido.pago?.estado === 'aprobado'

  async function handleToggle() {
    if (!expanded && editions === null) {
      setLoadingEd(true)
      try {
        const data = await api.pedidos.ediciones(pedido.id)
        setEditions(data)
      } catch {
        setEditions([])
      } finally {
        setLoadingEd(false)
      }
    }
    setExpanded((p) => !p)
  }

  return (
    <div
      style={{
        background:   'white',
        borderRadius: 10,
        border:       '1px solid #e5e7eb',
        overflow:     'hidden',
        flexShrink:   0,
      }}
    >
      {/* Card header */}
      <div
        style={{
          display:      'flex',
          alignItems:   'center',
          padding:      '12px 16px',
          borderBottom: '1px solid #f3f4f6',
          gap:          12,
        }}
      >
        <div
          style={{
            width:          36,
            height:         36,
            borderRadius:   8,
            background:     '#F3F4F6',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            flexShrink:     0,
          }}
        >
          <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 13, color: '#2D3561' }}>
            {pedido.mesa.numero}
          </span>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 13, color: '#2D3561' }}>
              Mesa {pedido.mesa.numero}
            </span>
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: '#9CA3AF' }}>
              {shortId(pedido.id)}
            </span>
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: '#9CA3AF' }}>
              · sesión {shortId(pedido.sesionId)}
            </span>
          </div>
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: '#9CA3AF' }}>
            {fmtDate(pedido.updatedAt)} {fmt(pedido.updatedAt)}
          </span>
        </div>

        {(() => {
          const isAnulado  = pedido.estado === 'anulado'
          const hasEdits   = !isAnulado && pedido.items.some((i) => i.cantidadEditada !== null)
          const label      = isAnulado ? 'Anulado'   : hasEdits ? 'Entregado · Editado'  : 'Entregado'
          const bg         = isAnulado ? '#fef2f2'   : hasEdits ? '#FDE5DF'  : '#f3f4f6'
          const color      = isAnulado ? '#dc2626'   : hasEdits ? '#E8563A'  : '#6b7280'
          const border     = isAnulado ? '#fecaca'   : hasEdits ? '#fca5a5'  : '#e5e7eb'
          return (
            <span
              style={{
                background:   bg,
                color,
                border:       `1px solid ${border}`,
                fontFamily:   'Inter, sans-serif',
                fontWeight:   600,
                fontSize:     11,
                padding:      '3px 8px',
                borderRadius: 20,
                flexShrink:   0,
              }}
            >
              {label}
            </span>
          )
        })()}
      </div>

      {/* Items */}
      <div style={{ padding: '10px 16px' }}>
        {pedido.items.map((item) => {
          const cantidadOriginal = item.cantidad
          const cantidadEditada = item.cantidadEditada ?? cantidadOriginal
          const cantidadQuitada = cantidadOriginal - cantidadEditada
          const precio = (c: number) => `$${(c * Number(item.precioUnitario)).toFixed(2)}`

          return (
            <div
              key={item.id}
              style={{
                display:        'flex',
                justifyContent: 'space-between',
                alignItems:     'flex-start',
                padding:        '4px 0',
              }}
            >
              <div>
                {cantidadEditada === 0 ? (
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#DC2626', textDecoration: 'line-through' }}>
                    {cantidadOriginal}× {item.item.nombre}
                  </span>
                ) : cantidadQuitada > 0 ? (
                  <>
                    <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#374151' }}>
                      {cantidadEditada}× {item.item.nombre}
                    </span>
                    <div>
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#DC2626', textDecoration: 'line-through' }}>
                        {cantidadQuitada}× {item.item.nombre}
                      </span>
                    </div>
                  </>
                ) : (
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#374151' }}>
                    {cantidadOriginal}× {item.item.nombre}
                  </span>
                )}
                {cantidadEditada > 0 && item.mods && item.mods.length > 0 && (
                  <div style={{ marginTop: 2 }}>
                    {item.mods.map((mod, i) => (
                      <div
                        key={i}
                        style={{
                          fontFamily: 'Inter, sans-serif',
                          fontSize:   11,
                          color:      mod.accion.toLowerCase() === 'quitar' ? '#DC2626' : '#059669',
                          marginTop:  2,
                        }}
                      >
                        {mod.accion.toLowerCase() === 'quitar'
                          ? `sin ${mod.itemIngrediente.ingrediente.nombre}`
                          : `+${mod.cantidad ?? 1} ${mod.itemIngrediente.ingrediente.nombre}`
                        }
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <span
                style={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize:   12,
                  color:      '#6B7280',
                  flexShrink: 0,
                  marginLeft: 8,
                }}
              >
                {precio(cantidadEditada)}
              </span>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '10px 16px',
          borderTop:      '1px solid #f3f4f6',
          gap:            8,
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={handleToggle}
            style={{
              display:    'flex',
              alignItems: 'center',
              gap:        4,
              background: 'none',
              border:     '1px solid #e5e7eb',
              borderRadius: 6,
              padding:    '5px 10px',
              fontFamily: 'Inter, sans-serif',
              fontSize:   12,
              color:      '#6B7280',
              cursor:     'pointer',
            }}
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {loadingEd ? 'Cargando…' : 'Ver ediciones'}
          </button>

          {canEdit && (
            isPagado ? (
              <span
                style={{
                  fontFamily:   'Inter, sans-serif',
                  fontSize:     11,
                  fontWeight:   600,
                  color:        '#DC2626',
                  padding:      '5px 10px',
                  border:       '1px solid #FECACA',
                  borderRadius: 6,
                  background:   '#FEF2F2',
                }}
              >
                Ya pagado
              </span>
            ) : (
              <button
                onClick={() => onEdit(pedido)}
                style={{
                  background:   'none',
                  border:       '1px solid #e5e7eb',
                  borderRadius: 6,
                  padding:      '5px 10px',
                  fontFamily:   'Inter, sans-serif',
                  fontSize:     12,
                  color:        '#E8563A',
                  cursor:       'pointer',
                }}
              >
                Editar pedido
              </button>
            )
          )}
        </div>

        <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 14, color: '#2D3561' }}>
          ${total.toFixed(2)}
        </div>
      </div>

      {/* Editions panel */}
      {expanded && (
        <div style={{ borderTop: '1px solid #f3f4f6', background: '#F9FAFB', padding: '12px 16px' }}>
          {loadingEd ? (
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#9CA3AF', margin: 0 }}>
              Cargando…
            </p>
          ) : editions === null || editions.length === 0 ? (
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#9CA3AF', margin: 0 }}>
              Sin ediciones registradas.
            </p>
          ) : (
            editions.map((ed, idx) => (
              <div
                key={ed.id}
                style={{
                  marginBottom:  idx < editions.length - 1 ? 12 : 0,
                  paddingBottom: idx < editions.length - 1 ? 12 : 0,
                  borderBottom:  idx < editions.length - 1 ? '1px solid #e5e7eb' : 'none',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, color: '#374151' }}>
                    {ed.editor.nombre}
                  </span>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: '#9CA3AF' }}>
                    {fmtDate(ed.creadoEn)} {fmt(ed.creadoEn)}
                  </span>
                </div>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#6B7280', margin: '0 0 8px', fontStyle: 'italic' }}>
                  "{ed.justificacion}"
                </p>
                <div>
                  {ed.itemsEliminados.map((ei) => {
                    const diferencia = (ei.cantidadAntes - ei.cantidadDespues) * ei.precioUnitario
                    return (
                      <div key={ei.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#374151' }}>
                          {ei.itemNombre}: {ei.cantidadAntes} → {ei.cantidadDespues}
                        </span>
                        {ei.cantidadDespues === 0 && (
                          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600, color: '#DC2626' }}>
                            anulado
                          </span>
                        )}
                        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: '#DC2626', marginLeft: 'auto' }}>
                          −${diferencia.toFixed(2)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

/* ── main page ──────────────────────────────────────────────────────────────── */
export function HistorialPage() {
  const { user } = useAuth()
  const { selectedRestauranteId } = useContextStore()
  const [pedidos, setPedidos] = useState<PedidoAdmin[]>([])
  const [loading, setLoading] = useState(false)
  const [period, setPeriod] = useState<Period>('hoy')
  const [search, setSearch] = useState('')
  const [busquedaId, setBusquedaId] = useState('')
  const [editingPedido, setEditingPedido] = useState<PedidoAdmin | null>(null)

  const canEdit = user?.rol === 'GERENTE' || user?.rol === 'ROOT'

  const load = useCallback(async () => {
    if (!selectedRestauranteId) return
    setLoading(true)
    try {
      const [entregados, anulados] = await Promise.all([
        api.pedidos.list(selectedRestauranteId, 'entregado'),
        api.pedidos.list(selectedRestauranteId, 'anulado'),
      ])
      setPedidos([...entregados, ...anulados].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ))
    } catch {
      // silent — user sees empty list
    } finally {
      setLoading(false)
    }
  }, [selectedRestauranteId])

  useEffect(() => {
    void load()
  }, [load])

  const filteredByPeriod = useMemo(() => {
    const { from, to } = getPeriodBounds(period)
    return pedidos.filter((p) => {
      const t = new Date(p.updatedAt)
      return t >= from && t <= to
    })
  }, [pedidos, period])

  const filtered = useMemo(() => {
    return filteredByPeriod
      .filter((p) => {
        if (!search.trim()) return true
        return p.mesa.numero.toLowerCase().includes(search.trim().toLowerCase())
      })
      .filter((p) => {
        if (!busquedaId.trim()) return true
        return p.id.toLowerCase().includes(busquedaId.trim().toLowerCase())
      })
  }, [filteredByPeriod, search, busquedaId])

  const pedidoCount   = filteredByPeriod.length
  const editadoCount  = filteredByPeriod.filter((p) => p.items.some((i) => i.cantidadEditada !== null)).length
  const anuladoCount  = filteredByPeriod.filter((p) => p.estado === 'anulado').length

  function handleEditDone() {
    setEditingPedido(null)
    void load()
  }

  return (
    <div
      style={{
        display:       'flex',
        flexDirection: 'column',
        height:        'calc(100vh - 56px)',
        padding:       24,
        gap:           16,
        boxSizing:     'border-box',
      }}
    >
      {/* Controls row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flexShrink: 0 }}>
        {/* Period pills */}
        <div style={{ display: 'flex', gap: 6 }}>
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                padding:      '6px 14px',
                borderRadius: 20,
                border:       period === p ? '1px solid #E8563A' : '1px solid #D1D5DB',
                background:   period === p ? '#E8563A' : 'white',
                color:        period === p ? 'white' : '#6B7280',
                fontFamily:   'Inter, sans-serif',
                fontSize:     12,
                fontWeight:   period === p ? 600 : 400,
                cursor:       'pointer',
                transition:   'all 0.15s',
              }}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

      </div>

      {/* Search row */}
      <div style={{ display: 'flex', gap: 12, marginTop: 16, marginBottom: 12, flexShrink: 0 }}>
        {/* Input 1: Mesa */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'white', border: '1px solid #D1D5DB', borderRadius: 8, padding: '6px 12px', flex: 1 }}>
          <Search size={14} color="#9CA3AF" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por mesa..."
            style={{ flex: 1, border: 'none', outline: 'none', fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#374151', background: 'transparent' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#9CA3AF', display: 'flex' }}>
              <X size={13} />
            </button>
          )}
        </div>
        {/* Input 2: ID de pedido */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'white', border: '1px solid #D1D5DB', borderRadius: 8, padding: '6px 12px', flex: 1 }}>
          <Search size={14} color="#9CA3AF" />
          <input
            type="text"
            value={busquedaId}
            onChange={(e) => setBusquedaId(e.target.value)}
            placeholder="Buscar por ID de pedido..."
            style={{ flex: 1, border: 'none', outline: 'none', fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#374151', background: 'transparent' }}
          />
          {busquedaId && (
            <button onClick={() => setBusquedaId('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#9CA3AF', display: 'flex' }}>
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'flex', gap: 12, flexShrink: 0, flexWrap: 'wrap' }}>
        {/* Entregados */}
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: '#E5E7F0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ClipboardList size={18} color="#2D3561" />
          </div>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6b7280', fontWeight: 600 }}>
              Entregados
            </div>
            <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 26, color: '#111827' }}>
              {pedidoCount}
            </div>
          </div>
        </div>

        {/* Editados */}
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: '#E5E7F0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ClipboardList size={18} color="#2D3561" />
          </div>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6b7280', fontWeight: 600 }}>
              Editados
            </div>
            <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 26, color: '#111827' }}>
              {editadoCount}
            </div>
          </div>
        </div>

        {/* Anulados */}
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: '#E5E7F0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ClipboardList size={18} color="#2D3561" />
          </div>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6b7280', fontWeight: 600 }}>
              Anulados
            </div>
            <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 26, color: '#111827' }}>
              {anuladoCount}
            </div>
          </div>
        </div>
      </div>

      {/* List */}
      <div
        style={{
          flex:          1,
          minHeight:     0,
          overflowY:     'auto',
          display:       'flex',
          flexDirection: 'column',
          gap:           10,
        }}
      >
        {loading ? (
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingTop: 32 }}>
            Cargando pedidos…
          </p>
        ) : filtered.length === 0 ? (
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingTop: 32 }}>
            No hay pedidos entregados en este período.
          </p>
        ) : (
          filtered.map((p) => (
            <PedidoCard
              key={p.id}
              pedido={p}
              canEdit={canEdit}
              onEdit={setEditingPedido}
            />
          ))
        )}
      </div>

      {/* Edit modal */}
      {editingPedido && (
        <EditarPedidoModal
          codigo={shortId(editingPedido.id)}
          items={itemsEditables(editingPedido)}
          pagado={editingPedido.pago?.estado === 'aprobado'}
          apariencia={APARIENCIA_PEDIDOS}
          onGuardar={async (edicion) => { await api.pedidos.editar(editingPedido.id, edicion); handleEditDone() }}
          onClose={() => setEditingPedido(null)}
        />
      )}
    </div>
  )
}
