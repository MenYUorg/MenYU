import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePerfil } from '@menyu/auth-client'
import { ClipboardList, X, Edit, XCircle, History } from 'lucide-react'
import { api } from '../../services/api'
import type { SesionHistorial } from '../../services/api'
import { useNombreDelRol, useRestauranteId } from '../../store/contextoStore'
import { PageHeader } from '../../components/PageHeader'
import { PERIOD_LABELS, SesionCard, SesionDetalleModal, getPeriodBounds, type Period } from '@menyu/ui/historial'

function getInitials(name?: string): string {
  if (!name) return '?'
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}


export function HistorialPage() {
  const navigate            = useNavigate()
  const perfil              = usePerfil()
  const restauranteId       = useRestauranteId()
  const nombreMozo          = perfil.nombre || perfil.email
  const rolMostrado         = useNombreDelRol()

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
        userRole={rolMostrado}
        userInitials={getInitials(nombreMozo)}
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
