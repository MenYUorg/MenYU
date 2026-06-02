import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@menyu/auth'
import { Clock, ClipboardList, DollarSign, ChevronRight, X, ChevronDown, ChevronUp, Edit, XCircle, History } from 'lucide-react'
import { api } from '../../services/api'
import type { SesionHistorial } from '../../services/api'
import { useMozoStore } from '../../store/mozoStore'
import { PageHeader } from '../../components/PageHeader'

/* ── types ───────────────────────────────────────────────────────────────── */
type Period = 'hoy' | 'ayer' | 'semana' | 'mes'
type SesionPedido = SesionHistorial['pedidos'][number]

const PERIOD_LABELS: Record<Period, string> = {
  hoy:    'Hoy',
  ayer:   'Ayer',
  semana: 'Última semana',
  mes:    'Último mes',
}

/* ── helpers ─────────────────────────────────────────────────────────────── */
const toLocalDateStr = (date: Date): string => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const getPeriodBounds = (period: Period): { desde: string; hasta: string } => {
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

function calcDuracion(iniciadaEn: string, cerradaEn: string): string {
  const totalMin = Math.floor(
    (new Date(cerradaEn).getTime() - new Date(iniciadaEn).getTime()) / 60000,
  )
  if (totalMin < 60) return `${totalMin} min`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

function isToday(iso: string): boolean {
  return new Date(iso).toDateString() === new Date().toDateString()
}

function shortId(id: string): string {
  return '#' + id.slice(0, 4).toUpperCase()
}

function getInitials(name?: string): string {
  if (!name) return '?'
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

/* ── BadgeEstado ─────────────────────────────────────────────────────────── */
function BadgeEstado({ estado }: { estado: string }) {
  const MAP: Record<string, { bg: string; color: string; label: string }> = {
    entregado:      { bg: '#f3f4f6', color: '#6b7280', label: 'Entregado' },
    anulado:        { bg: '#fef2f2', color: '#dc2626', label: 'Anulado' },
    pendiente:      { bg: '#FFF7ED', color: '#D97706', label: 'Pendiente' },
    en_preparacion: { bg: '#EFF6FF', color: '#2563EB', label: 'En preparación' },
    listo:          { bg: '#ECFDF5', color: '#059669', label: 'Listo' },
  }
  const s = MAP[estado] ?? { bg: '#f3f4f6', color: '#6b7280', label: estado }
  return (
    <span
      style={{
        background:   s.bg,
        color:        s.color,
        fontFamily:   'Inter, sans-serif',
        fontWeight:   600,
        fontSize:     11,
        padding:      '3px 8px',
        borderRadius: 20,
        flexShrink:   0,
      }}
    >
      {s.label}
    </span>
  )
}

/* ── PedidoEnSesion ──────────────────────────────────────────────────────── */
function PedidoEnSesion({ pedido }: { pedido: SesionPedido }) {
  const [showEdiciones, setShowEdiciones] = useState(false)
  const isAnulado = pedido.estado === 'anulado'

  const borderLeft = pedido.tieneEdiciones
    ? '3px solid #E8563A'
    : isAnulado
      ? '3px solid #dc2626'
      : '3px solid transparent'

  return (
    <div style={{ background: '#f9fafb', borderRadius: 10, padding: 14, borderLeft }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 13, color: '#2D3561', flex: 1 }}>
          {shortId(pedido.id)}
        </span>
        <BadgeEstado estado={pedido.estado} />
        {pedido.tieneEdiciones && !isAnulado && (
          <span style={{ background: '#FDE5DF', color: '#E8563A', fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: 11, padding: '3px 8px', borderRadius: 20 }}>
            Editado
          </span>
        )}
        {isAnulado && (
          <span style={{ background: '#fef2f2', color: '#dc2626', fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: 11, padding: '3px 8px', borderRadius: 20 }}>
            Anulado
          </span>
        )}
      </div>

      {/* Items */}
      <div style={{ marginTop: 8 }}>
        {pedido.items.map((item) => {
          const cantidadOriginal = item.cantidad
          const cantidadEditada  = item.cantidadEditada ?? cantidadOriginal
          const cantidadQuitada  = cantidadOriginal - cantidadEditada

          return (
            <div key={item.id} style={{ padding: '3px 0' }}>
              {cantidadEditada === 0 ? (
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#DC2626', textDecoration: 'line-through' }}>
                  {cantidadOriginal}× {item.itemNombre}
                </span>
              ) : cantidadQuitada > 0 ? (
                <>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#374151' }}>
                    {cantidadEditada}× {item.itemNombre}
                  </span>
                  <div>
                    <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#DC2626', textDecoration: 'line-through' }}>
                      {cantidadQuitada}× {item.itemNombre}
                    </span>
                  </div>
                </>
              ) : (
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#374151' }}>
                  {cantidadOriginal}× {item.itemNombre}
                </span>
              )}

              {cantidadEditada > 0 && item.mods.length > 0 && (
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
                        ? `sin ${mod.ingredienteNombre}`
                        : `+ ${mod.ingredienteNombre}`}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
        <div>
          {pedido.tieneEdiciones && (
            <button
              onClick={() => setShowEdiciones((v) => !v)}
              style={{
                display:      'flex',
                alignItems:   'center',
                gap:          4,
                background:   'none',
                border:       '1px solid #FECACA',
                borderRadius: 6,
                padding:      '5px 10px',
                fontFamily:   'Inter, sans-serif',
                fontSize:     12,
                color:        '#E8563A',
                cursor:       'pointer',
              }}
            >
              {showEdiciones ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              Ver ediciones ({pedido.ediciones.length})
            </button>
          )}
        </div>
        <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 14, color: '#2D3561' }}>
          ${pedido.totalPedido.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
        </div>
      </div>

      {/* Ediciones panel (solo lectura) */}
      {showEdiciones && pedido.ediciones.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {pedido.ediciones.map((ed) => (
            <div
              key={ed.id}
              style={{ borderLeft: '3px solid #E8563A', background: 'white', borderRadius: 6, padding: 10, marginTop: 8 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, color: '#374151' }}>
                  {ed.editor.nombre} · {ed.editor.tipo}
                </span>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: '#9CA3AF' }}>
                  {fmtDate(ed.creadoEn)} {fmtTime(ed.creadoEn)}
                </span>
              </div>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#6B7280', margin: '0 0 8px', fontStyle: 'italic' }}>
                "{ed.justificacion}"
              </p>
              <div>
                {ed.itemsEliminados.map((ei, idx) => {
                  const diferencia = (ei.cantidadAntes - ei.cantidadDespues) * ei.precioUnitario
                  return (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#374151' }}>
                        {ei.itemNombre}: {ei.cantidadAntes} → {ei.cantidadDespues}
                      </span>
                      {ei.esAnulacion && (
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
          ))}
        </div>
      )}
    </div>
  )
}

/* ── SesionDetalleModal ──────────────────────────────────────────────────── */
function SesionDetalleModal({
  sesion,
  onClose,
}: {
  sesion: SesionHistorial
  onClose: () => void
}) {
  const duracion = calcDuracion(sesion.iniciadaEn, sesion.cerradaEn)

  return (
    <div
      style={{
        position:       'fixed',
        inset:          0,
        zIndex:         200,
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
          background:    'white',
          borderRadius:  16,
          width:         '100%',
          maxWidth:      600,
          maxHeight:     '85vh',
          display:       'flex',
          flexDirection: 'column',
          overflow:      'hidden',
          boxShadow:     '0 24px 60px rgba(31,35,51,0.30)',
        }}
      >
        {/* Fixed header */}
        <div
          style={{
            padding:        '20px 24px',
            borderBottom:   '1px solid #e5e7eb',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            flexShrink:     0,
          }}
        >
          <div>
            <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 18, color: '#2D3561' }}>
              Mesa {sesion.mesaNumero}
            </div>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#6b7280', marginTop: 2 }}>
              {fmtTime(sesion.iniciadaEn)} → {fmtTime(sesion.cerradaEn)} · {duracion} · ${sesion.totalSesion.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 4, display: 'flex', flexShrink: 0 }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable body */}
        <div
          style={{
            overflowY:     'auto',
            padding:       '20px 24px',
            display:       'flex',
            flexDirection: 'column',
            gap:           16,
          }}
        >
          {sesion.pedidos.length === 0 ? (
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#9CA3AF', textAlign: 'center', padding: '16px 0' }}>
              Sin pedidos registrados.
            </p>
          ) : (
            sesion.pedidos.map((p) => (
              <PedidoEnSesion key={p.id} pedido={p} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

/* ── SesionCard ──────────────────────────────────────────────────────────── */
function SesionCard({
  sesion,
  onClick,
}: {
  sesion: SesionHistorial
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const [pressed, setPressed] = useState(false)

  const duracion      = calcDuracion(sesion.iniciadaEn, sesion.cerradaEn)
  const mostrarFecha  = !isToday(sesion.cerradaEn)
  const tieneAnulados = sesion.pedidos.some((p) => p.estado === 'anulado')
  const tieneEditados = sesion.pedidos.some((p) => p.tieneEdiciones)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false) }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        background:    'white',
        border:        `1px solid ${hovered ? '#F6C4B8' : '#e5e7eb'}`,
        borderRadius:  12,
        padding:       16,
        cursor:        'pointer',
        display:       'flex',
        alignItems:    'center',
        gap:           14,
        boxShadow:     hovered ? '0 2px 12px rgba(0,0,0,0.06)' : 'none',
        transform:     pressed ? 'translateY(1px)' : 'none',
        transition:    'border-color 0.2s, box-shadow 0.2s, transform 0.08s',
      }}
    >
      {/* Table chip */}
      <div
        style={{
          width:          50,
          height:         50,
          borderRadius:   12,
          background:     '#EEF0F8',
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          justifyContent: 'center',
          flexShrink:     0,
          gap:            1,
        }}
      >
        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 8, fontWeight: 600, color: '#2D3561', letterSpacing: '0.1em', textTransform: 'uppercase', lineHeight: 1 }}>
          MESA
        </span>
        <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 21, color: '#2D3561', lineHeight: 1 }}>
          {sesion.mesaNumero}
        </span>
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Metrics */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#6b7280' }}>
            <Clock size={13} color="#9ca3af" />
            {duracion}
          </span>
          <span style={{ color: '#d1d5db', fontSize: 12 }}>·</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#6b7280' }}>
            <ClipboardList size={13} color="#9ca3af" />
            {sesion.cantidadPedidos} {sesion.cantidadPedidos === 1 ? 'pedido' : 'pedidos'}
          </span>
          <span style={{ color: '#d1d5db', fontSize: 12 }}>·</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#6b7280' }}>
            <DollarSign size={13} color="#9ca3af" />
            ${sesion.totalSesion.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </span>
        </div>

        {/* Badges */}
        {(tieneAnulados || tieneEditados) && (
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            {tieneAnulados && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#fef2f2', color: '#dc2626', fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>
                <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#dc2626', flexShrink: 0 }} />
                con anulaciones
              </span>
            )}
            {tieneEditados && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#FDE5DF', color: '#E8563A', fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>
                <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#E8563A', flexShrink: 0 }} />
                con ediciones
              </span>
            )}
          </div>
        )}
      </div>

      {/* Right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{ textAlign: 'right' }}>
          {mostrarFecha && (
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#9ca3af' }}>
              {fmtDate(sesion.cerradaEn)}
            </div>
          )}
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#9ca3af' }}>
            {fmtTime(sesion.cerradaEn)}
          </div>
        </div>
        <ChevronRight size={16} color={hovered ? '#F6C4B8' : '#d1d5db'} />
      </div>
    </div>
  )
}

/* ── main page ───────────────────────────────────────────────────────────── */
export function HistorialPage() {
  const navigate            = useNavigate()
  const { user }            = useAuth()
  const { restauranteId }   = useMozoStore()
  const nombreMozo          = user?.nombre ?? user?.email ?? 'Mozo'

  const [sesiones, setSesiones]                     = useState<SesionHistorial[]>([])
  const [loading, setLoading]                       = useState(false)
  const [period, setPeriod]                         = useState<Period>('hoy')
  const [search, setSearch]                         = useState('')
  const [searchFocused, setSearchFocused]           = useState(false)
  const [sesionSeleccionada, setSesionSeleccionada] = useState<SesionHistorial | null>(null)

  const { desde, hasta } = useMemo(() => getPeriodBounds(period), [period])

  const load = useCallback(async () => {
    if (!restauranteId) return
    setLoading(true)
    try {
      const data = await api.sesiones.historial(restauranteId, desde, hasta)
      setSesiones(data)
    } catch {
      setSesiones([])
    } finally {
      setLoading(false)
    }
  }, [restauranteId, desde, hasta])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    if (!search.trim()) return sesiones
    const q = search.trim().toLowerCase()
    return sesiones.filter((s) => s.mesaNumero.toLowerCase().includes(q))
  }, [sesiones, search])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#F6F7F9' }}>
      <PageHeader
        title="Historial de sesiones"
        icon={<History size={18} />}
        onBack={() => navigate('/mozo')}
        userName={nombreMozo}
        userRole="Mozo"
        userInitials={getInitials(user?.nombre ?? user?.email)}
      />

      <div
        style={{
          flex:          1,
          overflowY:     'auto',
          padding:       20,
          display:       'flex',
          flexDirection: 'column',
          gap:           16,
        }}
      >
        {/* Toolbar: segmented pills + search */}
        <div
          style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            gap:            12,
            flexWrap:       'wrap',
          }}
        >
          <div style={{ display: 'flex', gap: 2, background: '#EEF0F8', borderRadius: 999, padding: 4 }}>
            {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  padding:      '6px 14px',
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

          <div
            style={{
              display:      'flex',
              alignItems:   'center',
              gap:          8,
              background:   'white',
              border:       `1px solid ${searchFocused ? '#E8563A' : '#D1D5DB'}`,
              borderRadius: 10,
              padding:      '9px 14px',
              width:        260,
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
              style={{ flex: 1, border: 'none', outline: 'none', fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#374151', background: 'transparent', minWidth: 0 }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#9CA3AF', display: 'flex', flexShrink: 0 }}>
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* KPI cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: '#E5E7F0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <ClipboardList size={18} color="#2D3561" />
            </div>
            <div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6B7280', fontWeight: 600 }}>Sesiones</div>
              <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 24, color: '#2D3561', letterSpacing: '-0.01em', lineHeight: 1.1 }}>{sesiones.length}</div>
            </div>
          </div>

          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: '#FDE5DF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Edit size={18} color="#E8563A" />
            </div>
            <div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6B7280', fontWeight: 600 }}>Editadas</div>
              <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 24, color: '#2D3561', letterSpacing: '-0.01em', lineHeight: 1.1 }}>
                {sesiones.filter((s) => s.pedidos.some((p) => p.tieneEdiciones)).length}
              </div>
            </div>
          </div>

          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <XCircle size={18} color="#dc2626" />
            </div>
            <div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6B7280', fontWeight: 600 }}>Anulados</div>
              <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 24, color: '#2D3561', letterSpacing: '-0.01em', lineHeight: 1.1 }}>
                {sesiones.reduce((acc, s) => acc + s.pedidos.filter((p) => p.estado === 'anulado').length, 0)}
              </div>
            </div>
          </div>
        </div>

        {/* List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
      </div>

      {/* Session detail modal */}
      {sesionSeleccionada && (
        <SesionDetalleModal
          sesion={sesionSeleccionada}
          onClose={() => setSesionSeleccionada(null)}
        />
      )}
    </div>
  )
}
