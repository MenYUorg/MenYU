import { useEffect, useMemo, useState } from 'react'
import { DollarSign, ClipboardList, TrendingUp, Grid2x2 } from 'lucide-react'
import { useContextStore } from '../../../store/contextStore'
import { api } from '../../../services/api'

// ── Types ─────────────────────────────────────────────────────────────────────
type Periodo = 'hoy' | 'semana' | 'mes' | 'trimestre' | 'anio'

interface ResumenData {
  total: number
  cantidadPedidos: number
  ticketPromedio: number
  cantidadSesiones: number
}

interface TopItemData {
  itemId: string
  nombre: string
  cantidad: number
  total: number
  categoriaId: string | null
  categoriaNombre: string | null
}

interface VentaDiaData {
  fecha: string
  total: number
  pedidos: number
}

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  navy:     '#2D3561',
  orange:   '#E8563A',
  green:    '#16a34a',
  border:   '#e5e7eb',
  bgLight:  '#f3f4f6',
  textSub:  '#6b7280',
  textMuted:'#9ca3af',
} as const

// ── Períodos ──────────────────────────────────────────────────────────────────
interface PeriodoConfig {
  key:       Periodo
  label:     string
  subtitulo: string
  offset:    number
}

const PERIODOS: PeriodoConfig[] = [
  { key: 'hoy',       label: 'Hoy',            subtitulo: 'Hoy',              offset: 0   },
  { key: 'semana',    label: 'Última semana',   subtitulo: 'Últimos 7 días',   offset: 6   },
  { key: 'mes',       label: 'Último mes',      subtitulo: 'Últimos 30 días',  offset: 29  },
  { key: 'trimestre', label: 'Últimos 3 meses', subtitulo: 'Últimos 90 días',  offset: 89  },
  { key: 'anio',      label: 'Último año',      subtitulo: 'Últimos 365 días', offset: 364 },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
const toLocalDateString = (date: Date): string => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function calcRange(periodo: Periodo): { desde: string; hasta: string } {
  const cfg = PERIODOS.find((p) => p.key === periodo)!
  const hoy = new Date()
  const hasta = toLocalDateString(hoy)
  const inicio = new Date()
  inicio.setDate(inicio.getDate() - cfg.offset)
  const desde = toLocalDateString(inicio)
  return { desde, hasta }
}

function formatARS(n: number): string {
  return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function formatDDMM(iso: string): string {
  const p = iso.split('-')
  return `${p[2]}/${p[1]}`
}

function formatFechaLarga(iso: string): string {
  const p = iso.split('-')
  return `${p[2]}/${p[1]}/${p[0]}`
}

function generarDias(desde: string, hasta: string): string[] {
  const dias: string[] = []
  const [ay, am, ad] = desde.split('-').map(Number)
  const cur = new Date(ay, am - 1, ad)
  const [zy, zm, zd] = hasta.split('-').map(Number)
  const end = new Date(zy, zm - 1, zd)
  while (cur <= end) {
    const y  = cur.getFullYear()
    const m  = String(cur.getMonth() + 1).padStart(2, '0')
    const d  = String(cur.getDate()).padStart(2, '0')
    dias.push(`${y}-${m}-${d}`)
    cur.setDate(cur.getDate() + 1)
  }
  return dias
}

// ── Component ─────────────────────────────────────────────────────────────────
export function ReportesPage() {
  const selectedRestauranteId = useContextStore((s) => s.selectedRestauranteId)

  const [periodo,    setPeriodo]    = useState<Periodo>('mes')
  const [loading,    setLoading]    = useState(false)
  const [resumen,    setResumen]    = useState<ResumenData | null>(null)
  const [topItems,   setTopItems]   = useState<TopItemData[]>([])
  const [ventasDia,  setVentasDia]  = useState<VentaDiaData[]>([])
  const [hoveredBar, setHoveredBar] = useState<number | null>(null)
  const [pillHov,    setPillHov]    = useState<Periodo | null>(null)

  useEffect(() => {
    if (!selectedRestauranteId) return
    const { desde, hasta } = calcRange(periodo)
    setLoading(true)
    setHoveredBar(null)

    void Promise.allSettled([
      api.reportes.ventasHoy(selectedRestauranteId, desde, hasta),
      api.reportes.topItems(selectedRestauranteId, 10, desde, hasta),
      api.reportes.ventasPorDia(selectedRestauranteId, desde, hasta),
    ]).then(([resumenRes, topRes, porDiaRes]) => {
      if (resumenRes.status === 'fulfilled') setResumen(resumenRes.value)
      if (topRes.status === 'fulfilled')     setTopItems(topRes.value)
      if (porDiaRes.status === 'fulfilled')  setVentasDia(porDiaRes.value)
      setLoading(false)
    })
  }, [selectedRestauranteId, periodo])

  // ── Derived chart data ─────────────────────────────────────────────────────
  const { desde, hasta } = useMemo(() => calcRange(periodo), [periodo])
  const allDays = useMemo(() => generarDias(desde, hasta), [desde, hasta])
  const dataMap = useMemo(() => {
    const m = new Map<string, number>()
    ventasDia.forEach((v) => m.set(v.fecha, v.total))
    return m
  }, [ventasDia])
  const maxTotal = useMemo(
    () => Math.max(...allDays.map((d) => dataMap.get(d) ?? 0), 1),
    [allDays, dataMap],
  )
  const maxCantidad = Math.max(...topItems.map((t) => t.cantidad), 1)
  const mostrarLabelCadaN = allDays.length > 14 ? 7 : 1
  const periodoCfg = PERIODOS.find((p) => p.key === periodo)!

  if (!selectedRestauranteId) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 192 }}>
        <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 14, color: C.textMuted }}>
          Seleccioná un restaurante para ver los reportes
        </span>
      </div>
    )
  }

  return (
    <div style={{ padding: 24 }}>

      {/* ── Topbar ── */}
      <div style={{
        display:        'flex',
        justifyContent: 'space-between',
        alignItems:     'center',
        marginBottom:   24,
        flexWrap:       'wrap',
        gap:            12,
      }}>
        <h2 style={{
          fontFamily: 'Montserrat,sans-serif',
          fontWeight: 700,
          fontSize:   22,
          color:      C.navy,
          margin:     0,
        }}>
          Reportes
        </h2>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PERIODOS.map(({ key, label }) => {
            const active = periodo === key
            const hov    = pillHov === key && !active
            return (
              <button
                key={key}
                onClick={() => setPeriodo(key)}
                onMouseEnter={() => setPillHov(key)}
                onMouseLeave={() => setPillHov(null)}
                style={{
                  background:   active ? C.navy : 'white',
                  color:        active ? 'white' : '#374151',
                  border:       `1px solid ${hov ? C.navy : C.border}`,
                  borderRadius: 999,
                  padding:      '7px 16px',
                  fontSize:     13,
                  fontFamily:   'Montserrat,sans-serif',
                  fontWeight:   active ? 700 : 400,
                  cursor:       'pointer',
                  transition:   'all 0.15s',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {(
          [
            { label: 'VENTAS TOTALES',  value: loading ? '–' : formatARS(resumen?.total ?? 0),           Icon: DollarSign,   iconBg: '#FDE5DF', iconColor: C.orange },
            { label: 'PEDIDOS',         value: loading ? '–' : String(resumen?.cantidadPedidos ?? 0),     Icon: ClipboardList, iconBg: '#E5E7F0', iconColor: C.navy  },
            { label: 'TICKET PROMEDIO', value: loading ? '–' : formatARS(resumen?.ticketPromedio ?? 0),   Icon: TrendingUp,    iconBg: '#FDE5DF', iconColor: C.orange },
            { label: 'MESAS ATENDIDAS', value: loading ? '–' : String(resumen?.cantidadSesiones ?? 0),    Icon: Grid2x2,       iconBg: '#dcfce7', iconColor: C.green  },
          ] as const
        ).map(({ label, value, Icon, iconBg, iconColor }) => (
          <div
            key={label}
            style={{
              background:     'white',
              border:         `1px solid ${C.border}`,
              borderRadius:   12,
              padding:        16,
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'space-between',
              gap:            12,
            }}
          >
            <div>
              <p style={{
                fontFamily:    'Inter,sans-serif',
                fontSize:      11,
                fontWeight:    600,
                color:         C.textSub,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                margin:        '0 0 6px',
              }}>
                {label}
              </p>
              <p style={{
                fontFamily: 'Montserrat,sans-serif',
                fontWeight: 800,
                fontSize:   26,
                color:      C.navy,
                margin:     0,
                lineHeight: 1,
              }}>
                {value}
              </p>
            </div>
            <div style={{
              width:          36,
              height:         36,
              borderRadius:   8,
              background:     iconBg,
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              flexShrink:     0,
            }}>
              <Icon size={18} color={iconColor} />
            </div>
          </div>
        ))}
      </div>

      {/* ── Gráfico ventas por día ── */}
      <div style={{
        background:   'white',
        border:       `1px solid ${C.border}`,
        borderRadius: 12,
        padding:      20,
        marginTop:    16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{
            fontFamily: 'Montserrat,sans-serif',
            fontWeight: 700,
            fontSize:   15,
            color:      C.navy,
            margin:     0,
          }}>
            Ventas por día
          </h3>
          <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.textSub }}>
            {periodoCfg.subtitulo}
          </span>
        </div>

        {/* Barras */}
        <div style={{
          position:     'relative',
          display:      'flex',
          alignItems:   'flex-end',
          gap:          4,
          height:       200,
          borderBottom: `1px solid ${C.border}`,
          paddingTop:   20,
          overflow:     'visible',
        }}>
          {allDays.map((fecha, i) => {
            const total = dataMap.get(fecha) ?? 0
            const pct   = total > 0 ? Math.max((total / maxTotal) * 100, 2) : 0
            return (
              <div
                key={fecha}
                style={{
                  position:  'relative',
                  flex:      1,
                  height:    total > 0 ? `${pct}%` : 4,
                  minHeight: 4,
                }}
                onMouseEnter={() => setHoveredBar(i)}
                onMouseLeave={() => setHoveredBar(null)}
              >
                {hoveredBar === i && total > 0 && (
                  <div style={{
                    position:      'absolute',
                    bottom:        'calc(100% + 6px)',
                    left:          '50%',
                    transform:     'translateX(-50%)',
                    background:    C.navy,
                    color:         'white',
                    borderRadius:  6,
                    padding:       '6px 10px',
                    fontSize:      12,
                    fontFamily:    'Inter,sans-serif',
                    pointerEvents: 'none',
                    zIndex:        10,
                    whiteSpace:    'nowrap',
                    lineHeight:    1.5,
                  }}>
                    {formatFechaLarga(fecha)}<br />{formatARS(total)}
                  </div>
                )}
                <div style={{
                  width:        '100%',
                  height:       '100%',
                  borderRadius: '4px 4px 0 0',
                  background:   total > 0
                    ? 'linear-gradient(180deg, #E8563A 0%, #ffa085 100%)'
                    : C.bgLight,
                }} />
              </div>
            )
          })}
        </div>

        {/* Labels de fecha */}
        <div style={{ display: 'flex', gap: 4, paddingTop: 6 }}>
          {allDays.map((fecha, i) => (
            <div
              key={fecha}
              style={{
                flex:       1,
                textAlign:  'center',
                fontSize:   10,
                fontFamily: 'Inter,sans-serif',
                color:      C.textMuted,
                overflow:   'hidden',
                visibility: i % mostrarLabelCadaN === 0 ? 'visible' : 'hidden',
              }}
            >
              {formatDDMM(fecha)}
            </div>
          ))}
        </div>
      </div>

      {/* ── Top 10 items ── */}
      <div style={{
        background:   'white',
        border:       `1px solid ${C.border}`,
        borderRadius: 12,
        padding:      20,
        marginTop:    16,
        marginBottom: 24,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{
            fontFamily: 'Montserrat,sans-serif',
            fontWeight: 700,
            fontSize:   15,
            color:      C.navy,
            margin:     0,
          }}>
            Top items del período
          </h3>
          <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.textMuted }}>
            por unidades vendidas
          </span>
        </div>

        {topItems.length === 0 ? (
          <p style={{
            fontFamily: 'Inter,sans-serif',
            fontSize:   14,
            color:      C.textMuted,
            textAlign:  'center',
            padding:    '32px 0',
            margin:     0,
          }}>
            Sin datos para el período
          </p>
        ) : (
          <div>
            {topItems.map((item, i) => {
              const isLast  = i === topItems.length - 1
              const fillPct = (item.cantidad / maxCantidad) * 100
              return (
                <div
                  key={item.itemId}
                  style={{
                    padding:      '10px 0',
                    borderBottom: isLast ? 'none' : '1px solid #f3f4f6',
                  }}
                >
                  {/* Fila superior */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden', minWidth: 0 }}>
                      <span style={{
                        fontFamily:   'Inter,sans-serif',
                        fontSize:     14,
                        fontWeight:   500,
                        color:        '#111827',
                        overflow:     'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace:   'nowrap',
                      }}>
                        {item.nombre}
                      </span>
                      {item.categoriaNombre && (
                        <span style={{
                          background:   '#E5E7F0',
                          color:        C.navy,
                          fontSize:     11,
                          fontFamily:   'Inter,sans-serif',
                          fontWeight:   500,
                          padding:      '2px 8px',
                          borderRadius: 999,
                          marginLeft:   8,
                          flexShrink:   0,
                        }}>
                          {item.categoriaNombre}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, marginLeft: 16 }}>
                      <span style={{
                        fontFamily: 'Montserrat,sans-serif',
                        fontSize:   13,
                        fontWeight: 700,
                        color:      C.navy,
                      }}>
                        {item.cantidad}
                      </span>
                      <span style={{
                        fontFamily: 'Inter,sans-serif',
                        fontSize:   12,
                        color:      C.textSub,
                        marginLeft: 12,
                      }}>
                        {formatARS(item.total)}
                      </span>
                    </div>
                  </div>

                  {/* Barra horizontal */}
                  <div style={{
                    height:       6,
                    borderRadius: 3,
                    background:   '#f3f4f6',
                    width:        '100%',
                    marginTop:    6,
                  }}>
                    <div style={{
                      height:       '100%',
                      borderRadius: 3,
                      background:   'linear-gradient(90deg, #E8563A 0%, #ffa085 100%)',
                      width:        `${fillPct}%`,
                      transition:   'width 0.4s ease',
                    }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}
