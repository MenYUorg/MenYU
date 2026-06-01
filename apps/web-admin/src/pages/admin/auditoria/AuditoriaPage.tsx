import { useState, useEffect, useMemo } from 'react'
import { useContextStore } from '../../../store/contextStore'
import { api } from '../../../services/api'
import type { EdicionAuditoria } from '../../../services/api'
import { Edit, XCircle, Users, MinusCircle } from 'lucide-react'

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

const getPeriodDates = (period: Period): { desde: string; hasta: string } => {
  const now = new Date()
  const hoy = toLocalDateStr(now)
  const offset = (days: number) => {
    const d = new Date(now)
    d.setDate(d.getDate() - days)
    return toLocalDateStr(d)
  }
  switch (period) {
    case 'ayer':   return { desde: offset(1), hasta: offset(1) }
    case 'semana': return { desde: offset(6), hasta: hoy }
    case 'mes':    return { desde: offset(29), hasta: hoy }
    default:       return { desde: hoy, hasta: hoy }
  }
}

/* ── utils ──────────────────────────────────────────────────────────────────── */
function getInitials(nombre: string): string {
  const parts = nombre.trim().split(/\s+/)
  if (parts.length === 1) return nombre.slice(0, 2).toUpperCase()
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()
}

function fmtTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr)
  const now = new Date()
  return (
    d.getDate()     === now.getDate()  &&
    d.getMonth()    === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  )
}

/* ── sub-components ─────────────────────────────────────────────────────────── */
function EstadoBadge({ estado }: { estado: string }) {
  let bg = '#FDE5DF', color = '#E8563A'
  if (estado === 'anulado')   { bg = '#fef2f2'; color = '#dc2626' }
  if (estado === 'entregado') { bg = '#f3f4f6'; color = '#6b7280' }
  return (
    <span
      style={{
        background:   bg,
        color,
        fontFamily:   'Inter, sans-serif',
        fontWeight:   600,
        fontSize:     10,
        padding:      '2px 7px',
        borderRadius: 999,
        flexShrink:   0,
      }}
    >
      {estado}
    </span>
  )
}

function EdicionCard({ edicion }: { edicion: EdicionAuditoria }) {
  const shortId     = '#' + edicion.pedidoId.slice(0, 8).toUpperCase()
  const initials    = getInitials(edicion.editor.nombre)
  const esMozo      = edicion.editor.tipo === 'mozo'
  const avatarBg    = esMozo ? '#E5E7F0' : '#2D3561'
  const avatarColor = esMozo ? '#2D3561' : 'white'
  const badgeBg     = esMozo ? '#E5E7F0' : '#2D3561'
  const badgeColor  = esMozo ? '#2D3561' : 'white'
  const badgeLabel  = esMozo ? 'Mozo'    : 'Gerente'
  const borderLeft  = edicion.esAnulacion ? '4px solid #dc2626' : '4px solid #E8563A'

  return (
    <div
      style={{
        background:   'white',
        border:       '1px solid #e5e7eb',
        borderLeft,
        borderRadius: 12,
        padding:      16,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span
            style={{
              fontFamily: 'Montserrat, sans-serif',
              fontWeight: 700,
              fontSize:   15,
              color:      '#2D3561',
            }}
          >
            Mesa {edicion.mesaNumero}
          </span>
          <span
            style={{
              fontFamily: 'Montserrat, sans-serif',
              fontWeight: 700,
              fontSize:   14,
              color:      '#6b7280',
              marginLeft: 8,
            }}
          >
            {shortId}
          </span>
          <EstadoBadge estado={edicion.pedidoEstado} />
        </div>
        <div
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize:   12,
            color:      '#9ca3af',
            flexShrink: 0,
            textAlign:  'right',
          }}
        >
          {fmtTime(edicion.creadoEn)}
          {!isToday(edicion.creadoEn) && (
            <span style={{ marginLeft: 4 }}>{fmtDate(edicion.creadoEn)}</span>
          )}
        </div>
      </div>

      {/* Editor */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <div
          style={{
            width:          28,
            height:         28,
            borderRadius:   '50%',
            background:     avatarBg,
            color:          avatarColor,
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            fontFamily:     'Montserrat, sans-serif',
            fontWeight:     700,
            fontSize:       11,
            flexShrink:     0,
          }}
        >
          {initials}
        </div>
        <span
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize:   13,
            fontWeight: 600,
            color:      '#374151',
          }}
        >
          {edicion.editor.nombre}
        </span>
        <span
          style={{
            background:   badgeBg,
            color:        badgeColor,
            fontFamily:   'Inter, sans-serif',
            fontWeight:   600,
            fontSize:     10,
            padding:      '2px 8px',
            borderRadius: 999,
          }}
        >
          {badgeLabel}
        </span>
      </div>

      {/* Ítems modificados */}
      <div style={{ marginTop: 10 }}>
        <div
          style={{
            fontFamily:    'Inter, sans-serif',
            fontSize:      11,
            fontWeight:    600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color:         '#9ca3af',
            marginBottom:  6,
          }}
        >
          Modificaciones:
        </div>
        {edicion.itemsEliminados.map((item) => {
          const anulado = item.cantidadDespues === 0
          const impacto = (item.cantidadAntes - item.cantidadDespues) * item.precioUnitario
          return (
            <div
              key={item.id}
              style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 4 }}
            >
              {anulado ? (
                <>
                  <XCircle size={14} color="#dc2626" style={{ flexShrink: 0 }} />
                  <span
                    style={{
                      fontFamily:     'Inter, sans-serif',
                      textDecoration: 'line-through',
                      color:          '#dc2626',
                    }}
                  >
                    {item.cantidadAntes}× {item.itemNombre}
                  </span>
                  <span
                    style={{
                      fontFamily: 'Inter, sans-serif',
                      fontSize:   12,
                      color:      '#dc2626',
                      marginLeft: 'auto',
                      flexShrink: 0,
                    }}
                  >
                    -${impacto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </span>
                </>
              ) : (
                <>
                  <MinusCircle size={14} color="#E8563A" style={{ flexShrink: 0 }} />
                  <span style={{ fontFamily: 'Inter, sans-serif', color: '#374151' }}>
                    {item.cantidadAntes}× → {item.cantidadDespues}× {item.itemNombre}
                  </span>
                  <span
                    style={{
                      fontFamily: 'Inter, sans-serif',
                      fontSize:   12,
                      color:      '#dc2626',
                      marginLeft: 'auto',
                      flexShrink: 0,
                    }}
                  >
                    -${impacto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </span>
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Justificación */}
      <div
        style={{
          marginTop:    10,
          fontFamily:   'Inter, sans-serif',
          fontSize:     13,
          color:        '#374151',
          fontStyle:    'italic',
          background:   '#f9fafb',
          borderRadius: 6,
          padding:      '8px 12px',
        }}
      >
        "{edicion.justificacion}"
      </div>
    </div>
  )
}

/* ── KPI card ───────────────────────────────────────────────────────────────── */
function KpiCard({
  icon,
  label,
  value,
  iconBg,
  iconColor,
}: {
  icon: React.ReactNode
  label: string
  value: number
  iconBg: string
  iconColor: string
}) {
  return (
    <div
      style={{
        background:   'white',
        border:       '1px solid #e5e7eb',
        borderRadius: 12,
        padding:      '16px 20px',
        display:      'flex',
        alignItems:   'center',
        gap:          16,
      }}
    >
      <div
        style={{
          width:          36,
          height:         36,
          borderRadius:   8,
          background:     iconBg,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          flexShrink:     0,
          color:          iconColor,
        }}
      >
        {icon}
      </div>
      <div>
        <div
          style={{
            fontFamily:    'Inter, sans-serif',
            fontSize:      11,
            fontWeight:    600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color:         '#6b7280',
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontFamily: 'Montserrat, sans-serif',
            fontWeight: 800,
            fontSize:   26,
            color:      '#111827',
          }}
        >
          {value}
        </div>
      </div>
    </div>
  )
}

/* ── main page ──────────────────────────────────────────────────────────────── */
export function AuditoriaPage() {
  const { selectedRestauranteId } = useContextStore()
  const [ediciones, setEdiciones] = useState<EdicionAuditoria[]>([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [period, setPeriod]       = useState<Period>('hoy')
  const [search, setSearch]       = useState('')

  useEffect(() => {
    if (!selectedRestauranteId) return
    const { desde, hasta } = getPeriodDates(period)
    setLoading(true)
    setError(null)
    api.pedidos
      .auditoria(selectedRestauranteId, desde, hasta)
      .then((data) => { setEdiciones(data); setError(null) })
      .catch((e: unknown) => {
        console.error('[AuditoriaPage] error al cargar ediciones:', e)
        setEdiciones([])
        setError(e instanceof Error ? e.message : 'Error al cargar ediciones')
      })
      .finally(() => setLoading(false))
  }, [selectedRestauranteId, period])

  const filtered = useMemo(() => {
    if (!search.trim()) return ediciones
    const q = search.trim().toLowerCase()
    return ediciones.filter(
      (e) =>
        e.mesaNumero.toLowerCase().includes(q) ||
        e.editor.nombre.toLowerCase().includes(q) ||
        e.itemsEliminados.some((i) => i.itemNombre.toLowerCase().includes(q)),
    )
  }, [ediciones, search])

  const totalEdiciones   = ediciones.length
  const totalAnulaciones = ediciones.filter((e) => e.esAnulacion).length
  const editoresUnicos   = new Set(ediciones.map((e) => e.editor.nombre)).size

  return (
    <div style={{ padding: 24, boxSizing: 'border-box' }}>

      {/* Topbar title */}
      <h1
        style={{
          fontFamily: 'Montserrat, sans-serif',
          fontWeight: 700,
          fontSize:   22,
          color:      '#2D3561',
          margin:     '0 0 16px',
        }}
      >
        Auditoría de ediciones
      </h1>

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

      {/* Error banner */}
      {error && (
        <div
          style={{
            marginTop:    12,
            padding:      '10px 14px',
            background:   '#fef2f2',
            border:       '1px solid #fecaca',
            borderRadius: 8,
            fontFamily:   'Inter, sans-serif',
            fontSize:     13,
            color:        '#dc2626',
          }}
        >
          {error}
        </div>
      )}

      {/* KPI cards */}
      <div
        style={{
          display:             'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap:                 14,
          marginTop:           16,
        }}
      >
        <KpiCard
          icon={<Edit size={18} />}
          label="Total ediciones"
          value={totalEdiciones}
          iconBg="#E5E7F0"
          iconColor="#2D3561"
        />
        <KpiCard
          icon={<XCircle size={18} />}
          label="Anulaciones"
          value={totalAnulaciones}
          iconBg="#fef2f2"
          iconColor="#dc2626"
        />
        <KpiCard
          icon={<Users size={18} />}
          label="Editores únicos"
          value={editoresUnicos}
          iconBg="#FDE5DF"
          iconColor="#E8563A"
        />
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por mesa, editor o ítem..."
        style={{
          display:      'block',
          width:        '100%',
          marginTop:    16,
          marginBottom: 12,
          border:       '1px solid #e5e7eb',
          borderRadius: 8,
          padding:      '10px 14px',
          fontFamily:   'Inter, sans-serif',
          fontSize:     13,
          color:        '#374151',
          outline:      'none',
          boxSizing:    'border-box',
        }}
      />

      {/* List */}
      {loading ? (
        <p
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize:   13,
            color:      '#9ca3af',
            textAlign:  'center',
            padding:    '48px 0',
          }}
        >
          Cargando ediciones…
        </p>
      ) : filtered.length === 0 ? (
        <p
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize:   13,
            color:      '#9ca3af',
            textAlign:  'center',
            padding:    '48px 0',
          }}
        >
          No hay ediciones registradas en este período.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map((e) => (
            <EdicionCard key={e.id} edicion={e} />
          ))}
        </div>
      )}
    </div>
  )
}
