import { useState, useEffect, useMemo, useCallback } from 'react'
import { useContextStore, useRolActual } from '../../../store/contextStore'
import { api } from '../../../services/api'
import type { SesionHistorial } from '../../../services/api'
import { ClipboardList, X, Edit, XCircle } from 'lucide-react'
import { PERIOD_LABELS, SesionCard, SesionDetalleModal, getPeriodBounds, shortId, type AccionPedido, type Period, type SesionPedido } from '@menyu/ui/historial'
import { APARIENCIA_HISTORIAL, EditarPedidoModal, type ItemEditable } from '@menyu/ui/editar-pedido'

interface PedidoParaEditar {
  id: string
  items: ItemEditable[]
}

/* ── Editar pedido (acción del gerente en el detalle) ────────────────────── */
function accionEditarPedido(canEdit: boolean, onEdit: (p: PedidoParaEditar) => void): AccionPedido {
  return (pedido: SesionPedido) => {
    if (!canEdit || pedido.estado === 'anulado') return null
    const handleEdit = () => {
      onEdit({
        id:    pedido.id,
        items: pedido.items.map((i) => ({
          id:             i.id,
          nombre:         i.itemNombre,
          cantidadActual: i.cantidadEditada ?? i.cantidad,
          precioUnitario: i.precioUnitario,
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
  const { selectedRestauranteId } = useContextStore()

  const [sesiones, setSesiones]                     = useState<SesionHistorial[]>([])
  const [loading, setLoading]                       = useState(false)
  const [period, setPeriod]                         = useState<Period>('hoy')
  const [search, setSearch]                         = useState('')
  const [searchFocused, setSearchFocused]           = useState(false)
  const [sesionSeleccionada, setSesionSeleccionada] = useState<SesionHistorial | null>(null)
  const [editingPedido, setEditingPedido]           = useState<PedidoParaEditar | null>(null)

  const canEdit = useRolActual() === 'GERENTE'

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
        <EditarPedidoModal
          codigo={shortId(editingPedido.id)}
          items={editingPedido.items}
          apariencia={APARIENCIA_HISTORIAL}
          onGuardar={async (edicion) => { await api.pedidos.editar(editingPedido.id, edicion); handleEditDone() }}
          onClose={() => setEditingPedido(null)}
        />
      )}
    </div>
  )
}
