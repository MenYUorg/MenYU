import { useEffect, useRef, useState } from 'react'
import { DollarSign, ClipboardList, Grid2x2, TrendingUp } from 'lucide-react'
import { useContextStore } from '../../../store/contextStore'
import { api } from '../../../services/api'
import type { MesaConQr } from '../../../services/api'

/* ── types ─────────────────────────────────────────────────────────────────── */
interface VentasHoy {
  total: number
  cantidadPedidos: number
  ticketPromedio: number
}

interface VentaHora {
  hora: number
  total: number
}

interface TopItem {
  itemId: string
  nombre: string
  cantidad: number
  total: number
}

/* ── helpers ────────────────────────────────────────────────────────────────── */
const CHART_HOURS = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]

function formatARS(value: number): string {
  return `$${value.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

/* ── component ──────────────────────────────────────────────────────────────── */
export function DashboardPage() {
  const selectedRestauranteId = useContextStore((s) => s.selectedRestauranteId)

  const [loading, setLoading]             = useState(true)
  const [ventasHoy, setVentasHoy]         = useState<VentasHoy | null>(null)
  const [ventasPorHora, setVentasPorHora] = useState<VentaHora[]>([])
  const [topItems, setTopItems]           = useState<TopItem[]>([])
  const [mesas, setMesas]                 = useState<MesaConQr[]>([])
  const [loadingMesas, setLoadingMesas]   = useState(true)
  const [hayErrores, setHayErrores]       = useState(false)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function cargarTodo(restauranteId: string, esPolling = false) {
    if (!esPolling) { setLoading(true); setLoadingMesas(true) }

    const [ventasRes, porHoraRes, topRes, mesasRes] = await Promise.allSettled([
      api.reportes.ventasHoy(restauranteId),
      api.reportes.ventasPorHora(restauranteId),
      api.reportes.topItems(restauranteId, 5),
      api.mesas.list(restauranteId),
    ])

    if (ventasRes.status === 'fulfilled') setVentasHoy(ventasRes.value)
    if (porHoraRes.status === 'fulfilled') setVentasPorHora(porHoraRes.value)
    if (topRes.status === 'fulfilled') setTopItems(topRes.value)
    if (mesasRes.status === 'fulfilled') { setMesas(mesasRes.value); setLoadingMesas(false) }
    else if (!esPolling) setLoadingMesas(false)

    const algunoFallo = [ventasRes, porHoraRes, topRes, mesasRes].some(
      (r) => r.status === 'rejected',
    )
    setHayErrores(algunoFallo)
    setLoading(false)
  }

  useEffect(() => {
    if (!selectedRestauranteId) return

    void cargarTodo(selectedRestauranteId)

    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(
      () => void cargarTodo(selectedRestauranteId, true),
      30_000,
    )
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [selectedRestauranteId])

  /* ── derived ── */
  const mesasOcupadas = mesas.filter((m) => m.estado === 'ocupada').length

  const horaMap = new Map(ventasPorHora.map((v) => [v.hora, v.total]))
  const chartData = CHART_HOURS.map((h) => ({ hora: h, total: horaMap.get(h) ?? 0 }))
  const maxVenta = Math.max(...chartData.map((d) => d.total), 1)

  /* ── kpis ── */
  const kpis = [
    {
      label:     'VENTAS DEL DÍA',
      value:     loading ? '–' : formatARS(ventasHoy?.total ?? 0),
      Icon:      DollarSign,
      iconBg:    '#FDE5DF',
      iconColor: '#E8563A',
    },
    {
      label:     'PEDIDOS',
      value:     loading ? '–' : String(ventasHoy?.cantidadPedidos ?? 0),
      Icon:      ClipboardList,
      iconBg:    '#E5E7F0',
      iconColor: '#2D3561',
    },
    {
      label:     'MESAS OCUPADAS',
      value:     loadingMesas ? '–' : `${mesasOcupadas}/${mesas.length}`,
      Icon:      Grid2x2,
      iconBg:    '#dcfce7',
      iconColor: '#16a34a',
    },
    {
      label:     'TICKET PROMEDIO',
      value:     loading ? '–' : formatARS(ventasHoy?.ticketPromedio ?? 0),
      Icon:      TrendingUp,
      iconBg:    '#FDE5DF',
      iconColor: '#E8563A',
    },
  ]

  return (
    <div style={{ padding: 24, overflowY: 'auto' }}>

      {/* ── Banner de error ── */}
      {hayErrores && (
        <div style={{
          display:      'flex',
          alignItems:   'center',
          gap:          10,
          background:   '#fffbeb',
          border:       '1px solid #fde68a',
          borderRadius: 10,
          padding:      '10px 16px',
          marginBottom: 14,
        }}>
          <span style={{ fontSize: 15 }}>⚠️</span>
          <p style={{
            fontFamily: 'Inter, sans-serif',
            fontSize:   13,
            color:      '#92400e',
            margin:     0,
          }}>
            Algunos datos no pudieron cargarse. Reintentando en 30s.
          </p>
        </div>
      )}

      {/* ── KPIs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            style={{
              background:   'white',
              border:       '1px solid #e5e7eb',
              borderRadius: 12,
              padding:      16,
              display:      'flex',
              alignItems:   'center',
              justifyContent: 'space-between',
              gap:          12,
            }}
          >
            <div>
              <p style={{
                fontFamily:    'Inter, sans-serif',
                fontSize:      11,
                fontWeight:    600,
                color:         '#9CA3AF',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                margin:        '0 0 6px',
              }}>
                {kpi.label}
              </p>
              <p style={{
                fontFamily: 'Montserrat, sans-serif',
                fontWeight: 800,
                fontSize:   26,
                color:      '#2D3561',
                margin:     0,
                lineHeight: 1,
              }}>
                {kpi.value}
              </p>
            </div>
            <div style={{
              width:          36,
              height:         36,
              borderRadius:   8,
              background:     kpi.iconBg,
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              flexShrink:     0,
            }}>
              <kpi.Icon size={18} color={kpi.iconColor} />
            </div>
          </div>
        ))}
      </div>

      {/* ── Estado de mesas ── */}
      <div style={{
        background:   'white',
        border:       '1px solid #e5e7eb',
        borderRadius: 12,
        padding:      20,
        marginTop:    14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{
            fontFamily: 'Montserrat, sans-serif',
            fontWeight: 700,
            fontSize:   15,
            color:      '#1A1A2E',
            margin:     0,
          }}>
            Estado de mesas
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'Inter, sans-serif', fontSize: 11, color: '#6B7280' }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: '#16a34a', display: 'inline-block' }} />
              Libre
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'Inter, sans-serif', fontSize: 11, color: '#6B7280' }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: '#dc2626', display: 'inline-block' }} />
              Ocupada
            </span>
          </div>
        </div>

        {loadingMesas ? (
          <p style={{ color: '#9CA3AF', fontFamily: 'Inter, sans-serif', fontSize: 13, marginTop: 14 }}>Cargando mesas…</p>
        ) : mesas.length === 0 ? (
          <p style={{ color: '#9CA3AF', fontFamily: 'Inter, sans-serif', fontSize: 13, marginTop: 14 }}>No hay mesas configuradas</p>
        ) : (
          <div style={{
            display:             'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))',
            gap:                 10,
            marginTop:           14,
          }}>
            {mesas.map((mesa) => {
              const libre = mesa.estado !== 'ocupada'
              return (
                <div
                  key={mesa.id}
                  style={{
                    aspectRatio:    '1',
                    borderRadius:   8,
                    border:         `2px solid ${libre ? '#16a34a' : '#dc2626'}`,
                    background:     libre ? '#f0fdf4' : '#fef2f2',
                    display:        'flex',
                    flexDirection:  'column',
                    alignItems:     'center',
                    justifyContent: 'center',
                  }}
                >
                  <span style={{
                    fontFamily: 'Montserrat, sans-serif',
                    fontWeight: 700,
                    fontSize:   22,
                    color:      libre ? '#16a34a' : '#dc2626',
                    lineHeight: 1,
                  }}>
                    {mesa.numero}
                  </span>
                  <span style={{
                    fontFamily:    'Inter, sans-serif',
                    fontSize:      9,
                    fontWeight:    600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color:         libre ? '#16a34a' : '#dc2626',
                    marginTop:     2,
                  }}>
                    {libre ? 'Libre' : 'Ocupada'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Fila inferior ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginTop: 16 }}>

        {/* Ventas por hora */}
        <div style={{
          background:   'white',
          border:       '1px solid #e5e7eb',
          borderRadius: 12,
          padding:      20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 15, color: '#1A1A2E', margin: 0 }}>
              Ventas por hora
            </h2>
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#9CA3AF' }}>Hoy</span>
          </div>

          {/* Barras */}
          <div style={{
            display:       'flex',
            alignItems:    'flex-end',
            gap:           6,
            height:        160,
            borderBottom:  '1px solid #e5e7eb',
            paddingTop:    20,
          }}>
            {chartData.map(({ hora, total }) => {
              const pct = total === 0 ? 0 : Math.max((total / maxVenta) * 100, 4)
              return (
                <div
                  key={hora}
                  style={{
                    flex:         1,
                    height:       `${pct}%`,
                    minHeight:    4,
                    borderRadius: '4px 4px 0 0',
                    background:   total > 0
                      ? 'linear-gradient(180deg, #E8563A 0%, #ffa085 100%)'
                      : '#f3f4f6',
                  }}
                />
              )
            })}
          </div>

          {/* Labels */}
          <div style={{ display: 'flex', gap: 6, paddingTop: 6 }}>
            {chartData.map(({ hora }) => (
              <div
                key={hora}
                style={{ flex: 1, textAlign: 'center', fontFamily: 'Inter, sans-serif', fontSize: 10, color: '#9CA3AF' }}
              >
                {hora}h
              </div>
            ))}
          </div>
        </div>

        {/* Top 5 del día */}
        <div style={{
          background:   'white',
          border:       '1px solid #e5e7eb',
          borderRadius: 12,
          padding:      20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 15, color: '#1A1A2E', margin: 0 }}>
              Top 5 del día
            </h2>
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#E8563A', cursor: 'pointer' }}>
              Ver todo
            </span>
          </div>

          <div>
            {Array.from({ length: 5 }).map((_, i) => {
              const item = topItems[i]
              const isLast = i === 4
              return (
                <div
                  key={i}
                  style={{
                    display:       'grid',
                    gridTemplateColumns: '24px 1fr auto',
                    alignItems:    'center',
                    gap:           12,
                    padding:       '10px 0',
                    borderBottom:  isLast ? 'none' : '1px solid #e5e7eb',
                  }}
                >
                  <span style={{
                    fontFamily: 'Montserrat, sans-serif',
                    fontWeight: 800,
                    fontSize:   14,
                    color:      '#d1d5db',
                  }}>
                    {i + 1}
                  </span>
                  <span style={{
                    fontFamily:  'Inter, sans-serif',
                    fontWeight:  500,
                    fontSize:    13,
                    color:       '#1A1A2E',
                    overflow:    'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace:  'nowrap',
                  }}>
                    {item?.nombre ?? '—'}
                  </span>
                  {item ? (
                    <span style={{
                      background:   '#FDE5DF',
                      color:        '#E8563A',
                      fontSize:     10,
                      fontWeight:   600,
                      padding:      '2px 8px',
                      borderRadius: 10,
                      fontFamily:   'Inter, sans-serif',
                      whiteSpace:   'nowrap',
                    }}>
                      ×{item.cantidad}
                    </span>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}
