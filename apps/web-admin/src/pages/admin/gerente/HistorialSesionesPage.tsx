import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '@menyu/auth'
import { useContextStore } from '../../../store/contextStore'
import { api } from '../../../services/api'
import type { SesionHistorial } from '../../../services/api'
import { ClipboardList, X, Edit, XCircle } from 'lucide-react'
import { PERIOD_LABELS, SesionCard, SesionDetalleModal, getPeriodBounds, shortId, type AccionPedido, type Period, type SesionPedido } from '@menyu/ui/historial'

interface PedidoParaEditar {
  id: string
  items: { id: string; nombre: string; cantidad: number; cantidadEditada: number | null; precioUnitario: number }[]
}

function countWords(text: string): number {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/).length
}

/* ── StepBtn ─────────────────────────────────────────────────────────────── */
function StepBtn({
  label,
  onClick,
  disabled,
}: {
  label: string
  onClick: () => void
  disabled: boolean
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => !disabled && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width:          28,
        height:         28,
        borderRadius:   '50%',
        border:         `1px solid ${disabled ? '#E5E7EB' : '#D1D5DB'}`,
        background:     disabled ? '#F9FAFB' : hovered ? '#EEF0F8' : 'white',
        color:          disabled ? '#D1D5DB' : '#374151',
        fontFamily:     'Montserrat, sans-serif',
        fontWeight:     700,
        fontSize:       16,
        lineHeight:     1,
        cursor:         disabled ? 'not-allowed' : 'pointer',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        flexShrink:     0,
        transition:     'background 0.12s',
      }}
    >
      {label}
    </button>
  )
}

/* ── EditModal ───────────────────────────────────────────────────────────── */
function EditModal({
  pedido,
  onClose,
  onDone,
}: {
  pedido: PedidoParaEditar
  onClose: () => void
  onDone: () => void
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(pedido.items.map((i) => [i.id, i.cantidadEditada ?? i.cantidad])),
  )
  const [justificacion, setJustificacion] = useState('')
  const [submitting, setSubmitting]       = useState(false)
  const [error, setError]                 = useState<string | null>(null)

  const words = countWords(justificacion)

  const ediciones = pedido.items
    .filter((item) => quantities[item.id] !== (item.cantidadEditada ?? item.cantidad))
    .map((item) => ({ pedidoItemId: item.id, cantidadNueva: quantities[item.id] }))

  const hasChanges    = ediciones.length > 0
  const todosAnulados = pedido.items.every((item) => quantities[item.id] === 0)
  const canSubmit     = hasChanges && justificacion.trim().length > 0 && words <= 50 && !submitting

  function setQty(id: string, val: number) {
    setQuantities((prev) => ({ ...prev, [id]: val }))
  }

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      await api.pedidos.editar(pedido.id, { justificacion: justificacion.trim(), ediciones })
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al editar pedido')
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{
        position:       'fixed',
        inset:          0,
        zIndex:         1000,
        background:     'rgba(45,53,97,0.55)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        20,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background:   'white',
          borderRadius: 16,
          width:        '100%',
          maxWidth:     500,
          padding:      24,
          boxShadow:    '0 24px 60px rgba(31,35,51,0.30)',
          maxHeight:    '90vh',
          overflowY:    'auto',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 16, color: '#2D3561', margin: 0 }}>
            Editar pedido {shortId(pedido.id)}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 4, display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#6B7280', margin: '0 0 16px' }}>
          Ajustá la cantidad de cada ítem. Solo se registran los ítems que cambian.
        </p>

        {/* Item rows */}
        <div style={{ marginBottom: 16 }}>
          {pedido.items.map((item) => {
            const max     = item.cantidadEditada ?? item.cantidad
            const current = quantities[item.id]
            const changed = current !== max
            const anulado = current === 0

            let rowBg     = 'transparent'
            let rowBorder = '1px solid transparent'
            if (changed && anulado) { rowBg = '#FEE2E2'; rowBorder = '1px solid #FECACA' }
            else if (changed)       { rowBg = '#FDF0ED'; rowBorder = '1px solid #F6C4B8' }

            return (
              <div
                key={item.id}
                style={{
                  display:      'flex',
                  alignItems:   'center',
                  gap:          12,
                  padding:      '8px 10px',
                  borderRadius: 8,
                  background:   rowBg,
                  border:       rowBorder,
                  marginBottom: 4,
                  transition:   'background 0.15s, border-color 0.15s',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      fontFamily:     'Inter, sans-serif',
                      fontSize:       13,
                      color:          anulado ? '#DC2626' : '#374151',
                      textDecoration: anulado ? 'line-through' : 'none',
                    }}
                  >
                    {item.nombre}
                  </span>
                  {anulado && (
                    <div>
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600, color: '#DC2626' }}>
                        Ítem anulado
                      </span>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <StepBtn
                    label="−"
                    onClick={() => setQty(item.id, Math.max(0, current - 1))}
                    disabled={current === 0}
                  />
                  <span
                    style={{
                      fontFamily: 'Montserrat, sans-serif',
                      fontWeight: 700,
                      fontSize:   14,
                      color:      anulado ? '#E8563A' : '#2D3561',
                      minWidth:   20,
                      textAlign:  'center',
                    }}
                  >
                    {current}
                  </span>
                  <StepBtn
                    label="+"
                    onClick={() => setQty(item.id, Math.min(max, current + 1))}
                    disabled={current === max}
                  />
                </div>
                <span
                  style={{
                    fontFamily: 'Inter, sans-serif',
                    fontSize:   12,
                    color:      '#6B7280',
                    minWidth:   56,
                    textAlign:  'right',
                    flexShrink: 0,
                  }}
                >
                  ${(current * item.precioUnitario).toFixed(2)}
                </span>
              </div>
            )
          })}
        </div>

        {/* Justificación */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, color: '#374151' }}>
              Justificación
            </label>
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: words > 50 ? '#E8563A' : '#9CA3AF' }}>
              {words}/50 palabras
            </span>
          </div>
          <textarea
            value={justificacion}
            onChange={(e) => setJustificacion(e.target.value)}
            rows={3}
            placeholder="Describí el motivo de la edición…"
            style={{
              width:        '100%',
              padding:      '10px 12px',
              borderRadius: 8,
              border:       `1px solid ${words > 50 ? '#E8563A' : '#D1D5DB'}`,
              fontFamily:   'Inter, sans-serif',
              fontSize:     13,
              color:        '#374151',
              resize:       'vertical',
              outline:      'none',
              boxSizing:    'border-box',
            }}
          />
        </div>

        {hasChanges && todosAnulados && (
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#92400E', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 6, padding: '8px 12px', margin: '0 0 12px' }}>
            Esto anulará el pedido completo.
          </p>
        )}

        {error && (
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#E8563A', margin: '0 0 12px' }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #D1D5DB', background: 'white', fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#374151', cursor: 'pointer' }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              padding:      '8px 16px',
              borderRadius: 8,
              border:       'none',
              background:   canSubmit ? '#E8563A' : '#D1D5DB',
              fontFamily:   'Inter, sans-serif',
              fontSize:     13,
              fontWeight:   600,
              color:        canSubmit ? 'white' : '#9CA3AF',
              cursor:       canSubmit ? 'pointer' : 'not-allowed',
              transition:   'background 0.15s',
            }}
          >
            {submitting ? 'Guardando…' : 'Guardar edición'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── BadgeEstado ─────────────────────────────────────────────────────────── */
/* ── Editar pedido (acción del gerente en el detalle) ────────────────────── */
function accionEditarPedido(canEdit: boolean, onEdit: (p: PedidoParaEditar) => void): AccionPedido {
  return (pedido: SesionPedido) => {
    if (!canEdit || pedido.estado === 'anulado') return null
    const handleEdit = () => {
      onEdit({
        id:    pedido.id,
        items: pedido.items.map((i) => ({
          id:              i.id,
          nombre:          i.itemNombre,
          cantidad:        i.cantidad,
          cantidadEditada: i.cantidadEditada,
          precioUnitario:  i.precioUnitario,
        })),
      })
    }
    return (
      <button
        onClick={handleEdit}
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
  }
}

export function HistorialSesionesPage() {
  const { user }                  = useAuth()
  const { selectedRestauranteId } = useContextStore()

  const [sesiones, setSesiones]                     = useState<SesionHistorial[]>([])
  const [loading, setLoading]                       = useState(false)
  const [period, setPeriod]                         = useState<Period>('hoy')
  const [search, setSearch]                         = useState('')
  const [searchFocused, setSearchFocused]           = useState(false)
  const [sesionSeleccionada, setSesionSeleccionada] = useState<SesionHistorial | null>(null)
  const [editingPedido, setEditingPedido]           = useState<PedidoParaEditar | null>(null)

  const canEdit = user?.rol === 'GERENTE' || user?.rol === 'ROOT'

  const { desde, hasta } = useMemo(() => getPeriodBounds(period), [period])

  const load = useCallback(async () => {
    if (!selectedRestauranteId) return
    setLoading(true)
    try {
      const data = await api.sessions.historial(selectedRestauranteId, desde, hasta)
      setSesiones(data)
    } catch {
      setSesiones([])
    } finally {
      setLoading(false)
    }
  }, [selectedRestauranteId, desde, hasta])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    if (!search.trim()) return sesiones
    const q = search.trim().toLowerCase()
    return sesiones.filter((s) => s.mesaNumero.toLowerCase().includes(q))
  }, [sesiones, search])

  function handleEditDone() {
    setEditingPedido(null)
    setSesionSeleccionada(null)
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
        background:    '#F6F7F9',
      }}
    >
      {/* Topbar */}
      <h1
        style={{
          fontFamily: 'Montserrat, sans-serif',
          fontWeight: 700,
          fontSize:   22,
          color:      '#2D3561',
          margin:     0,
          flexShrink: 0,
        }}
      >
        Historial de sesiones
      </h1>

      {/* Toolbar: segmented pills + search */}
      <div
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          flexShrink:     0,
          gap:            12,
        }}
      >
        {/* Segmented control */}
        <div
          style={{
            display:      'flex',
            gap:          2,
            background:   '#EEF0F8',
            borderRadius: 999,
            padding:      4,
          }}
        >
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                padding:      '6px 16px',
                borderRadius: 999,
                border:       'none',
                background:   period === p ? '#E8563A' : 'transparent',
                color:        period === p ? 'white' : '#6B7280',
                fontFamily:   'Montserrat, sans-serif',
                fontWeight:   700,
                fontSize:     13,
                cursor:       'pointer',
                boxShadow:    period === p ? '0 1px 4px rgba(232,86,58,0.35)' : 'none',
                transition:   'all 0.15s',
                whiteSpace:   'nowrap',
              }}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {/* Search */}
        <div
          style={{
            display:      'flex',
            alignItems:   'center',
            gap:          8,
            background:   'white',
            border:       `1px solid ${searchFocused ? '#E8563A' : '#D1D5DB'}`,
            borderRadius: 10,
            padding:      '9px 14px',
            width:        280,
            boxSizing:    'border-box',
            transition:   'border-color 0.15s',
            flexShrink:   0,
          }}
        >
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Buscar por mesa..."
            style={{
              flex:       1,
              border:     'none',
              outline:    'none',
              fontFamily: 'Inter, sans-serif',
              fontSize:   13,
              color:      '#374151',
              background: 'transparent',
              minWidth:   0,
            }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#9CA3AF', display: 'flex', flexShrink: 0 }}
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* KPI cards */}
      <div
        style={{
          flexShrink:          0,
          display:             'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap:                 14,
        }}
      >
        {/* 1 — Sesiones cerradas */}
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 42, height: 42, borderRadius: 11, background: '#E5E7F0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ClipboardList size={20} color="#2D3561" />
          </div>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6B7280', fontWeight: 600 }}>
              Sesiones cerradas
            </div>
            <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 28, color: '#2D3561', letterSpacing: '-0.01em', lineHeight: 1.1 }}>
              {sesiones.length}
            </div>
          </div>
        </div>

        {/* 2 — Con ediciones */}
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 42, height: 42, borderRadius: 11, background: '#FDE5DF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Edit size={20} color="#E8563A" />
          </div>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6B7280', fontWeight: 600 }}>
              Con ediciones
            </div>
            <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 28, color: '#2D3561', letterSpacing: '-0.01em', lineHeight: 1.1 }}>
              {sesiones.filter((s) => s.pedidos.some((p) => p.tieneEdiciones)).length}
            </div>
          </div>
        </div>

        {/* 3 — Pedidos anulados */}
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 42, height: 42, borderRadius: 11, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <XCircle size={20} color="#dc2626" />
          </div>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6B7280', fontWeight: 600 }}>
              Pedidos anulados
            </div>
            <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 28, color: '#2D3561', letterSpacing: '-0.01em', lineHeight: 1.1 }}>
              {sesiones.reduce((acc, s) => acc + s.pedidos.filter((p) => p.estado === 'anulado').length, 0)}
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
            Cargando sesiones…
          </p>
        ) : filtered.length === 0 ? (
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingTop: 32 }}>
            No hay sesiones cerradas en este período.
          </p>
        ) : (
          filtered.map((s) => (
            <SesionCard
              key={s.sesionId}
              sesion={s}
              onClick={() => setSesionSeleccionada(s)}
            />
          ))
        )}
      </div>

      {/* Session detail modal — z-index 200 */}
      {sesionSeleccionada && !editingPedido && (
        <SesionDetalleModal
          sesion={sesionSeleccionada}
          onClose={() => setSesionSeleccionada(null)}
          accionPedido={accionEditarPedido(canEdit, setEditingPedido)}
        />
      )}

      {/* Edit modal — z-index 1000, sibling of detail modal */}
      {editingPedido && (
        <EditModal
          pedido={editingPedido}
          onClose={() => setEditingPedido(null)}
          onDone={handleEditDone}
        />
      )}
    </div>
  )
}
