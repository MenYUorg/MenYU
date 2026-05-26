import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, Clock, DollarSign, QrCode, Settings, Users, X } from 'lucide-react'
import type { Restaurante } from '@menyu/types'
import { useContextStore } from '../../../store/contextStore'
import { api } from '../../../services/api'
import type { MesaConQr, SesionActiva } from '../../../services/api'

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  orange:          '#E8563A',
  navy:            '#2D3561',
  green:           '#16a34a',
  greenBg:         '#f0fdf4',
  greenBadgeBg:    '#dcfce7',
  orangeBg:        '#fff8f6',
  orangeBadgeBg:   '#FDE5DF',
  textSub:         '#6b7280',
  textMuted:       '#9ca3af',
  red:             '#dc2626',
  border:          '#e5e7eb',
  bgLight:         '#f9fafb',
} as const

// ── Helpers ───────────────────────────────────────────────────────────────────
function tiempoTranscurrido(creadaEn: string): string {
  const diff = Date.now() - new Date(creadaEn).getTime()
  const horas = Math.floor(diff / 3600000)
  const mins  = Math.floor((diff % 3600000) / 60000)
  return horas > 0 ? `${horas}h ${mins}m` : `${mins}m`
}

// ── Tile ──────────────────────────────────────────────────────────────────────
function MesaTile({
  mesa,
  sesion,
  onClick,
  onCerrar,
}: {
  mesa:     MesaConQr
  sesion:   SesionActiva | undefined
  onClick:  () => void
  onCerrar: () => Promise<void>
}) {
  const ocupada = mesa.estado === 'ocupada'
  const [confirmCerrar, setConfirmCerrar] = useState(false)
  const [cerrando,      setCerrando]      = useState(false)
  const [cerrBtnHov,    setCerrBtnHov]    = useState(false)

  const handleConfirmCerrar = async () => {
    setCerrando(true)
    try {
      await onCerrar()
      setConfirmCerrar(false)
    } finally {
      setCerrando(false)
    }
  }

  return (
    <>
      <div
        onClick={onClick}
        style={{
          background:    ocupada ? C.orangeBg : C.greenBg,
          borderRadius:  16,
          border:        `2px solid ${ocupada ? C.orange : C.green}`,
          padding:       20,
          cursor:        'pointer',
          transition:    'border-color 0.2s',
          minHeight:     160,
          display:       'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <span style={{
            fontFamily: 'Montserrat,sans-serif',
            fontWeight: 800,
            fontSize:   32,
            color:      C.navy,
            lineHeight: 1,
          }}>
            {mesa.numero}
          </span>
          <span style={{
            background:    ocupada ? C.orangeBadgeBg : C.greenBadgeBg,
            color:         ocupada ? C.orange : C.green,
            fontSize:      11,
            fontWeight:    700,
            textTransform: 'uppercase',
            padding:       '3px 8px',
            borderRadius:  999,
            fontFamily:    'Inter,sans-serif',
            flexShrink:    0,
          }}>
            {ocupada ? 'Ocupada' : 'Libre'}
          </span>
        </div>

        {/* Content */}
        {!ocupada && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 13, color: C.textMuted, fontFamily: 'Inter,sans-serif' }}>
              Mesa disponible
            </span>
          </div>
        )}

        {ocupada && !sesion && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 13, color: C.textMuted, fontFamily: 'Inter,sans-serif' }}>
              Cargando...
            </span>
          </div>
        )}

        {ocupada && sesion && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Users size={14} color={C.textSub} />
              <span style={{ fontSize: 13, color: C.textSub, fontFamily: 'Inter,sans-serif' }}>
                {sesion.cantidadClientes} {sesion.cantidadClientes === 1 ? 'cliente' : 'clientes'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clock size={14} color={C.textSub} />
              <span style={{ fontSize: 13, color: C.textSub, fontFamily: 'Inter,sans-serif' }}>
                {tiempoTranscurrido(sesion.creadaEn)}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <DollarSign size={14} color={C.navy} />
              <span style={{
                fontSize:   14,
                fontWeight: 700,
                color:      C.navy,
                fontFamily: 'Montserrat,sans-serif',
              }}>
                ${sesion.totalAcumulado.toLocaleString('es-AR')}
              </span>
            </div>
          </div>
        )}

        {/* Cerrar mesa */}
        {ocupada && (
          <button
            onClick={(e) => { e.stopPropagation(); setConfirmCerrar(true) }}
            onMouseEnter={() => setCerrBtnHov(true)}
            onMouseLeave={() => setCerrBtnHov(false)}
            style={{
              width: '100%', marginTop: 'auto', padding: 8, borderRadius: 8,
              border: `1px solid ${C.orange}`,
              background: cerrBtnHov ? C.orangeBg : 'white',
              color: C.orange, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'Inter,sans-serif',
              transition: 'background 0.15s',
            }}
          >
            Cerrar mesa
          </button>
        )}
      </div>

      {confirmCerrar && (
        <ModalConfirmar
          title={`¿Cerrar mesa ${mesa.numero}?`}
          text="Se cerrará la sesión activa y la mesa quedará disponible."
          confirmLabel="Sí, cerrar mesa"
          confirmColor={C.orange}
          loading={cerrando}
          onConfirm={() => { void handleConfirmCerrar() }}
          onCancel={() => setConfirmCerrar(false)}
        />
      )}
    </>
  )
}

// ── Modal confirmar ───────────────────────────────────────────────────────────
function ModalConfirmar({
  title, text, confirmLabel, confirmColor, loading, onConfirm, onCancel,
}: {
  title: string
  text: string
  confirmLabel: string
  confirmColor: string
  loading: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 300,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'white', width: 360, maxWidth: '95vw', borderRadius: 16, padding: 28 }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <AlertTriangle size={32} color={C.orange} />
          <h3 style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 18, color: C.navy, margin: 0, textAlign: 'center' }}>
            {title}
          </h3>
          <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.textSub, margin: 0, textAlign: 'center' }}>
            {text}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onCancel}
            style={{ flex: 1, padding: '10px 16px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'white', color: '#374151', fontFamily: 'Montserrat,sans-serif', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{ flex: 1, padding: '10px 16px', borderRadius: 10, border: 'none', background: confirmColor, color: 'white', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Procesando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal detalle ─────────────────────────────────────────────────────────────
function ModalDetalle({
  mesa,
  onClose,
  onUpdated,
  onDeleted,
}: {
  mesa:      MesaConQr
  onClose:   () => void
  onUpdated: (mesa: MesaConQr) => void
  onDeleted: (id: string) => void
}) {
  const [loading,         setLoading]         = useState(false)
  const [error,           setError]           = useState<string | null>(null)
  const [confirmEliminar, setConfirmEliminar] = useState(false)
  const ocupada = mesa.estado === 'ocupada'

  const handleRegenerarQr = async () => {
    setLoading(true); setError(null)
    try {
      const updated = await api.mesas.regenerarQr(mesa.id)
      onUpdated(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al regenerar QR')
    } finally {
      setLoading(false)
    }
  }

  const handleEliminar = async () => {
    setLoading(true); setError(null)
    try {
      await api.mesas.delete(mesa.id)
      onDeleted(mesa.id)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al eliminar mesa')
      setLoading(false)
    }
  }

  const btnSecondary: React.CSSProperties = {
    width:        '100%',
    padding:      '10px 16px',
    borderRadius: 10,
    border:       `1px solid ${C.border}`,
    background:   'white',
    fontFamily:   'Montserrat,sans-serif',
    fontWeight:   600,
    fontSize:     13,
    cursor:       'pointer',
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position:       'fixed',
          inset:          0,
          background:     'rgba(0,0,0,0.4)',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          zIndex:         200,
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background:    'white',
            width:         420,
            maxWidth:      '95vw',
            borderRadius:  16,
            display:       'flex',
            flexDirection: 'column',
            maxHeight:     '90vh',
          }}
        >
          {/* Header fijo */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            <h3 style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 18, color: C.navy, margin: 0 }}>
              Mesa {mesa.numero}
            </h3>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, display: 'flex', padding: 4 }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Cuerpo scrolleable */}
          <div style={{ overflowY: 'auto', maxHeight: 'calc(90vh - 140px)', padding: '20px 24px' }}>
            <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px' }}>
              PIN de acceso
            </p>
            <div style={{ background: C.bgLight, borderRadius: 12, padding: 16, textAlign: 'center', marginBottom: 20 }}>
              <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 32, color: C.navy, letterSpacing: '0.2em' }}>
                {mesa.pin}
              </span>
            </div>

            <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 4px' }}>
              Código QR
            </p>
            <img
              src={mesa.qrImage}
              alt={`QR mesa ${mesa.numero}`}
              width={200}
              height={200}
              style={{ margin: '12px auto', display: 'block' }}
            />

            {error && (
              <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.red, textAlign: 'center', margin: '8px 0' }}>
                {error}
              </p>
            )}
          </div>

          {/* Footer fijo */}
          <div style={{ padding: '16px 24px', borderTop: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
            <button
              onClick={() => window.open(mesa.qrImage, '_blank')}
              style={{ ...btnSecondary, color: C.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <QrCode size={14} />
              Imprimir QR
            </button>

            <button
              onClick={() => { if (!loading && !ocupada) void handleRegenerarQr() }}
              disabled={ocupada || loading}
              style={{
                ...btnSecondary,
                color:   ocupada ? C.textMuted : C.navy,
                cursor:  ocupada || loading ? 'not-allowed' : 'pointer',
                opacity: ocupada || loading ? 0.6 : 1,
              }}
            >
              {loading ? 'Procesando...' : 'Regenerar QR'}
            </button>

            {ocupada && (
              <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: C.textMuted, textAlign: 'center', margin: 0 }}>
                No se puede regenerar ni eliminar con mesa ocupada
              </p>
            )}

            <button
              onClick={() => { if (!loading && !ocupada) setConfirmEliminar(true) }}
              disabled={ocupada || loading}
              style={{
                ...btnSecondary,
                border:  `1px solid ${ocupada ? C.border : C.red}`,
                color:   ocupada ? C.textMuted : C.red,
                cursor:  ocupada || loading ? 'not-allowed' : 'pointer',
                opacity: ocupada || loading ? 0.4 : 1,
              }}
            >
              Eliminar mesa
            </button>
          </div>
        </div>
      </div>

      {confirmEliminar && (
        <ModalConfirmar
          title={`¿Eliminar mesa ${mesa.numero}?`}
          text="Esta acción no se puede deshacer. Se eliminará la mesa y su QR."
          confirmLabel="Sí, eliminar"
          confirmColor={C.red}
          loading={loading}
          onConfirm={() => { void handleEliminar() }}
          onCancel={() => setConfirmEliminar(false)}
        />
      )}
    </>
  )
}

// ── Modal crear ───────────────────────────────────────────────────────────────
function ModalCrear({
  restauranteId,
  onClose,
  onCreated,
}: {
  restauranteId: string
  onClose:       () => void
  onCreated:     (mesa: MesaConQr) => void
}) {
  const [numero,   setNumero]   = useState('')
  const [creating, setCreating] = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!numero.trim()) return
    setCreating(true); setError(null)
    try {
      const mesa = await api.mesas.create({ restauranteId, numero: numero.trim() })
      onCreated(mesa)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear mesa')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position:       'fixed',
        inset:          0,
        background:     'rgba(0,0,0,0.4)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        zIndex:         200,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'white', width: 360, maxWidth: '95vw', borderRadius: 16, padding: 28 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h3 style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 18, color: C.navy, margin: 0 }}>
            Nueva mesa
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, display: 'flex', padding: 4 }}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={(e) => void handleCreate(e)}>
          <label style={{ display: 'block', fontFamily: 'Inter,sans-serif', fontWeight: 500, fontSize: 13, color: '#374151', marginBottom: 6 }}>
            Número de mesa
          </label>
          <input
            type="number"
            min="1"
            step="1"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            placeholder="Ej: 1"
            autoFocus
            style={{
              width:        '100%',
              boxSizing:    'border-box',
              border:       `1px solid ${C.border}`,
              borderRadius: 8,
              padding:      '8px 12px',
              fontFamily:   'Inter,sans-serif',
              fontSize:     13,
              color:        '#111827',
              outline:      'none',
              marginBottom: 6,
            }}
          />
          <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: C.textMuted, margin: '0 0 20px' }}>
            Solo números. El PIN y QR se generan automáticamente.
          </p>

          {error && (
            <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.red, marginBottom: 12 }}>{error}</p>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{ flex: 1, padding: '10px 16px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'white', color: '#374151', fontFamily: 'Montserrat,sans-serif', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={creating || !numero.trim()}
              style={{ flex: 1, padding: '10px 16px', borderRadius: 10, border: 'none', background: C.orange, color: 'white', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13, cursor: creating || !numero.trim() ? 'not-allowed' : 'pointer', opacity: creating || !numero.trim() ? 0.7 : 1 }}
            >
              {creating ? 'Creando...' : 'Crear mesa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Modal configuración ───────────────────────────────────────────────────────
function ModalConfig({
  restaurante,
  onClose,
}: {
  restaurante: Restaurante
  onClose: () => void
}) {
  const [modo,    setModo]    = useState<'abierto' | 'seguro'>(
    restaurante.modoSesion === 'seguro' ? 'seguro' : 'abierto',
  )
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [hovered, setHovered] = useState<'abierto' | 'seguro' | null>(null)

  const handleSelect = async (val: 'abierto' | 'seguro') => {
    if (val === modo || saving) return
    const prev = modo
    setModo(val)
    setSaving(true)
    try {
      await api.restaurantes.update(restaurante.id, { modoSesion: val })
      useContextStore.setState((s) => ({
        restaurantes: s.restaurantes.map((r) =>
          r.id === restaurante.id ? { ...r, modoSesion: val } : r,
        ),
      }))
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      setModo(prev)
    } finally {
      setSaving(false)
    }
  }

  const cardStyle = (val: 'abierto' | 'seguro'): React.CSSProperties => {
    const sel = modo === val
    const hov = !sel && hovered === val
    return {
      border:       `2px solid ${sel ? C.navy : hov ? C.textMuted : C.border}`,
      borderRadius: 12,
      padding:      '14px 16px',
      cursor:       saving ? 'not-allowed' : 'pointer',
      transition:   'border-color 0.2s',
      background:   sel ? '#E5E7F0' : 'white',
    }
  }

  const CARDS: Array<{ val: 'abierto' | 'seguro'; titulo: string; desc: string }> = [
    {
      val:    'abierto',
      titulo: 'Abierto',
      desc:   'Cualquiera puede unirse escaneando el QR sin necesidad de código.',
    },
    {
      val:    'seguro',
      titulo: 'Seguro',
      desc:   'El cliente necesita el código de sesión del anfitrión para unirse.',
    },
  ]

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 200,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'white', width: 400, maxWidth: '95vw', borderRadius: 16, padding: 28 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h3 style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 18, color: C.navy, margin: 0 }}>
              Configuración del restaurante
            </h3>
            {saved && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: C.green, fontFamily: 'Inter,sans-serif', fontWeight: 600 }}>
                <Check size={13} /> Guardado
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, display: 'flex', padding: 4 }}
          >
            <X size={20} />
          </button>
        </div>

        <p style={{ fontFamily: 'Inter,sans-serif', fontWeight: 600, fontSize: 14, color: C.navy, margin: '0 0 4px' }}>
          Modo de acceso a mesas
        </p>
        <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.textSub, margin: '0 0 16px' }}>
          Controlá cómo los clientes se unen a una mesa.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {CARDS.map(({ val, titulo, desc }) => (
            <div
              key={val}
              style={cardStyle(val)}
              onClick={() => { void handleSelect(val) }}
              onMouseEnter={() => setHovered(val)}
              onMouseLeave={() => setHovered(null)}
            >
              <p style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 600, fontSize: 14, color: C.navy, margin: '0 0 4px' }}>
                {titulo}
              </p>
              <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: C.textSub, margin: 0 }}>
                {desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function TablesPage() {
  const { restaurantes, selectedRestauranteId } = useContextStore()

  const [showConfig,  setShowConfig]  = useState(false)
  const [cfgBtnHov,   setCfgBtnHov]  = useState(false)

  const [mesas,            setMesas]            = useState<MesaConQr[]>([])
  const [sesiones,         setSesiones]         = useState<Map<string, SesionActiva>>(new Map())
  const [loading,          setLoading]          = useState(false)
  const [error,            setError]            = useState<string | null>(null)
  const [mesaSeleccionada, setMesaSeleccionada] = useState<MesaConQr | null>(null)
  const [showCrear,        setShowCrear]        = useState(false)

  const mesasRef = useRef<MesaConQr[]>([])
  useEffect(() => { mesasRef.current = mesas }, [mesas])

  const cargarSesiones = async (mesasOcupadas: MesaConQr[]) => {
    if (mesasOcupadas.length === 0) return
    const results = await Promise.allSettled(
      mesasOcupadas.map((m) => api.sessions.mesaActiva(m.id)),
    )
    setSesiones((prev) => {
      const next = new Map(prev)
      mesasOcupadas.forEach((m, i) => {
        const r = results[i]
        if (r.status === 'fulfilled' && r.value) next.set(m.id, r.value)
      })
      return next
    })
  }

  const cargarMesas = useCallback(async () => {
    if (!selectedRestauranteId) return
    setLoading(true); setError(null)
    try {
      const data = await api.mesas.list(selectedRestauranteId)
      setMesas(data)
      mesasRef.current = data
      await cargarSesiones(data.filter((m) => m.estado === 'ocupada'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar mesas')
    } finally {
      setLoading(false)
    }
  }, [selectedRestauranteId])

  const handleCerrarMesa = async (mesa: MesaConQr) => {
    await api.sessions.cerrarMesa(mesa.id)
    setMesas((prev) => prev.map((m) => m.id === mesa.id ? { ...m, estado: 'libre' } : m))
    setSesiones((prev) => {
      const next = new Map(prev)
      next.delete(mesa.id)
      return next
    })
  }

  useEffect(() => {
    setSesiones(new Map())
    void cargarMesas()
  }, [cargarMesas])

  useEffect(() => {
    if (!selectedRestauranteId) return
    const interval = setInterval(() => {
      const ocupadas = mesasRef.current.filter((m) => m.estado === 'ocupada')
      if (ocupadas.length > 0) void cargarSesiones(ocupadas)
    }, 30000)
    return () => clearInterval(interval)
  }, [selectedRestauranteId])

  if (!selectedRestauranteId) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        Seleccioná un restaurante para ver las mesas
      </div>
    )
  }

  const mesasOcupadas     = mesas.filter((m) => m.estado === 'ocupada').length
  const configRestaurante = showConfig
    ? (restaurantes.find((r) => r.id === selectedRestauranteId) ?? null)
    : null

  return (
    <div className="px-6 py-6">

      {/* Topbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 22, color: C.navy, margin: 0, lineHeight: 1.2 }}>
            Mesas
          </h2>
          <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.textMuted, margin: '4px 0 0' }}>
            {mesas.length} mesas · {mesasOcupadas} ocupadas
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowConfig(true)}
            onMouseEnter={() => setCfgBtnHov(true)}
            onMouseLeave={() => setCfgBtnHov(false)}
            style={{
              width: 38, height: 38,
              border: `1px solid ${cfgBtnHov ? C.navy : C.border}`,
              borderRadius: 8, background: 'white',
              color: cfgBtnHov ? C.navy : C.textSub,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'border-color 0.2s, color 0.2s',
              padding: 0,
            }}
          >
            <Settings size={16} />
          </button>
          <button
            onClick={() => setShowCrear(true)}
            style={{ background: C.orange, color: 'white', border: 'none', borderRadius: 10, padding: '10px 18px', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            + Nueva mesa
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.red, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
          {error}
        </p>
      )}

      {/* Loading */}
      {loading && (
        <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.textMuted, textAlign: 'center', marginTop: 48 }}>
          Cargando mesas...
        </p>
      )}

      {/* Grid */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {mesas.map((mesa) => (
            <MesaTile
              key={mesa.id}
              mesa={mesa}
              sesion={sesiones.get(mesa.id)}
              onClick={() => setMesaSeleccionada(mesa)}
              onCerrar={() => handleCerrarMesa(mesa)}
            />
          ))}
          {mesas.length === 0 && (
            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 192 }}>
              <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 14, color: C.textMuted }}>
                No hay mesas. Creá la primera.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Modal detalle */}
      {mesaSeleccionada && (
        <ModalDetalle
          mesa={mesaSeleccionada}
          onClose={() => setMesaSeleccionada(null)}
          onUpdated={(updated) => {
            setMesas((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
            setMesaSeleccionada(updated)
          }}
          onDeleted={(id) => setMesas((prev) => prev.filter((m) => m.id !== id))}
        />
      )}

      {/* Modal configuración */}
      {configRestaurante && (
        <ModalConfig restaurante={configRestaurante} onClose={() => setShowConfig(false)} />
      )}

      {/* Modal crear */}
      {showCrear && (
        <ModalCrear
          restauranteId={selectedRestauranteId}
          onClose={() => setShowCrear(false)}
          onCreated={(mesa) => setMesas((prev) => [...prev, mesa])}
        />
      )}
    </div>
  )
}
