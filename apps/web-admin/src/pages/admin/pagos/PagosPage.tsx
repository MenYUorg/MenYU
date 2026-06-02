import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCircle, RefreshCw, X } from 'lucide-react'
import { TOKEN_KEY } from '@menyu/auth'
import { useAuth } from '@menyu/auth'
import { io, type Socket } from 'socket.io-client'
import { useContextStore } from '../../../store/contextStore'
import { api } from '../../../services/api'

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  orange:    '#E8563A',
  orangeSoft:'#FDF0ED',
  navy:      '#2D3561',
  navySoft:  '#EEF0F8',
  bg:        '#F6F7F9',
  white:     '#FFFFFF',
  border:    '#E6E8EF',
  text:      '#1F2333',
  textSub:   '#6B7280',
  textMuted: '#9CA3AF',
  green:     '#1F9D57',
  greenSoft: '#E4F6EC',
} as const

// ── Config ────────────────────────────────────────────────────────────────────
const BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? ''

const WS_URL: string =
  (import.meta.env.VITE_WS_URL as string | undefined) ??
  (import.meta.env.VITE_API_URL as string | undefined)?.replace('/api', '') ??
  ''

// ── Types ─────────────────────────────────────────────────────────────────────
interface SesionActiva {
  id: string
  mesaId: string
  mesaNumero: string
  tiempoTranscurrido: number
  cantidadItems: number
  cantidadPersonas: number
  totalAcumulado: number
  quierePagar: boolean
}

interface SesionPagada {
  id: string
  mesaNumero: string
  totalCobrado: number
  metodoPago: string
  cobradoPorNombre: string | null
  referenciaExterna: string | null
  fechaCobro: string | null
}

type MetodoPago = 'efectivo' | 'debito' | 'credito' | 'transferencia'
type TabHistorial = 'hoy' | 'ayer' | 'semana'

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtTiempo(min: number): string {
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)}h ${min % 60}m`
}

function fmtMoney(n: number): string {
  return '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function fmtHora(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY)
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (options.body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }
  const res = await fetch(`${BASE}${path}`, { ...options, headers })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>
    throw new Error(typeof err['message'] === 'string' ? err['message'] : `Error ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ── CobroModal (solo GERENTE) ─────────────────────────────────────────────────
const METODOS: { key: MetodoPago; label: string }[] = [
  { key: 'efectivo',      label: 'Efectivo' },
  { key: 'debito',        label: 'Débito' },
  { key: 'credito',       label: 'Crédito' },
  { key: 'transferencia', label: 'Transferencia' },
]

function CobroModal({
  sesion,
  restauranteId,
  onClose,
  onDone,
}: {
  sesion: SesionActiva
  restauranteId: string
  onClose: () => void
  onDone: () => void
}) {
  const [metodo,  setMetodo]  = useState<MetodoPago | null>(null)
  const [mozoId,  setMozoId]  = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [mozos,   setMozos]   = useState<{ id: string; nombre: string }[]>([])

  useEffect(() => {
    api.mozos.list(restauranteId)
      .then((data) => setMozos(data.map((m) => ({ id: m.id, nombre: m.nombre }))))
      .catch(() => { /* silencioso — el select queda vacío */ })
  }, [restauranteId])

  const canConfirm = !!metodo

  async function handleConfirmar() {
    if (!canConfirm) return
    setLoading(true)
    setError(null)
    try {
      const body = { metodoPago: metodo, mozoId: mozoId || null }
      await apiFetch(`/sessions/${sesion.id}/cobro`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al registrar pago')
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(45,53,97,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose() }}
    >
      <div style={{
        background: C.white, borderRadius: 16, width: '100%', maxWidth: 440,
        padding: '28px 28px 24px', boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h3 style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 18, color: C.navy, margin: 0 }}>
              Registrar pago · Mesa {sesion.mesaNumero}
            </h3>
            <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.textSub, margin: '5px 0 0' }}>
              Total a cobrar:{' '}
              <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, color: C.navy }}>
                {fmtMoney(sesion.totalAcumulado)}
              </span>
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4, display: 'flex' }}
          >
            <X size={18} />
          </button>
        </div>

        <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 10 }}>
          Método de pago
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
          {METODOS.map(({ key, label }) => {
            const sel = metodo === key
            return (
              <button
                key={key}
                onClick={() => setMetodo(key)}
                style={{
                  padding: '10px 14px', borderRadius: 8,
                  border: `1.5px solid ${sel ? C.orange : C.border}`,
                  background: sel ? C.orangeSoft : C.white,
                  color: sel ? C.orange : C.text,
                  fontFamily: 'Inter,sans-serif', fontSize: 13, fontWeight: sel ? 600 : 400,
                  cursor: 'pointer', textAlign: 'left', transition: 'all 0.13s',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>

        <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 8 }}>
          Mozo que cobró
        </p>
        <select
          value={mozoId}
          onChange={(e) => setMozoId(e.target.value)}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 8,
            border: `1px solid ${C.border}`, fontFamily: 'Inter,sans-serif', fontSize: 13,
            color: mozoId ? C.text : C.textMuted,
            background: C.white, outline: 'none', boxSizing: 'border-box',
            marginBottom: 22,
          }}
        >
          <option value="">Seleccionar mozo…</option>
          {mozos.map((m) => (
            <option key={m.id} value={m.id}>{m.nombre}</option>
          ))}
        </select>

        {error && (
          <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: '#dc2626', marginBottom: 14 }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              padding: '10px 18px', borderRadius: 8,
              border: `1px solid ${C.border}`, background: C.white,
              fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.text,
              cursor: loading ? 'default' : 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={() => void handleConfirmar()}
            disabled={!canConfirm || loading}
            style={{
              padding: '10px 22px', borderRadius: 8, border: 'none',
              background: !canConfirm || loading ? '#d1d5db' : C.orange,
              fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13,
              color: !canConfirm || loading ? C.textMuted : C.white,
              cursor: !canConfirm || loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {loading && <RefreshCw size={13} style={{ animation: 'spin 0.8s linear infinite' }} />}
            {loading ? 'Registrando…' : 'Confirmar pago'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── SesionActivaCard ──────────────────────────────────────────────────────────
function SesionActivaCard({
  sesion,
  esGerente,
  onRegistrar,
}: {
  sesion: SesionActiva
  esGerente: boolean
  onRegistrar: () => void
}) {
  const navigate = useNavigate()
  const alertaActiva = sesion.quierePagar && esGerente
  return (
    <div style={{
      background: C.white, borderRadius: 14,
      border: `1px solid ${alertaActiva ? C.orange : C.border}`,
      borderLeft: `3px solid ${alertaActiva ? C.orange : C.border}`,
      padding: 16, display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            background: C.navySoft, color: C.navy,
            fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 13,
            padding: '4px 10px', borderRadius: 6, flexShrink: 0,
          }}>
            {sesion.mesaNumero}
          </span>
          <div>
            <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 15, color: C.navy }}>
              Mesa {sesion.mesaNumero}
            </div>
            <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: C.textSub, marginTop: 1 }}>
              {fmtTiempo(sesion.tiempoTranscurrido)} · {sesion.cantidadItems} ítem{sesion.cantidadItems !== 1 ? 's' : ''} · {sesion.cantidadPersonas} pers.
            </div>
          </div>
        </div>
        {alertaActiva && (
          <span style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: C.orangeSoft, color: C.orange,
            fontFamily: 'Inter,sans-serif', fontWeight: 600, fontSize: 11,
            padding: '4px 9px', borderRadius: 20, flexShrink: 0,
          }}>
            <Bell size={11} />
            Quiere pagar
          </span>
        )}
      </div>

      <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 20, color: C.navy, lineHeight: 1 }}>
        {fmtMoney(sesion.totalAcumulado)}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {esGerente && (
          <button
            onClick={onRegistrar}
            style={{
              flex: 1, padding: '9px 0', borderRadius: 8, border: 'none',
              background: C.orange, color: C.white,
              fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Registrar pago
          </button>
        )}
        {esGerente && (
          <button
            onClick={() => navigate(`/admin/tables?mesaId=${sesion.mesaId}`)}
            style={{
              padding: '9px 14px', borderRadius: 8,
              border: `1.5px solid ${C.navy}`, background: 'transparent', color: C.navy,
              fontFamily: 'Inter,sans-serif', fontSize: 13, cursor: 'pointer',
            }}
          >
            Ver pedidos
          </button>
        )}
      </div>
    </div>
  )
}

// ── SesionPagadaCard ──────────────────────────────────────────────────────────
function SesionPagadaCard({ sesion }: { sesion: SesionPagada }) {
  const isMP = sesion.metodoPago === 'mercadopago'
  const badges = [
    { text: isMP ? 'Mercado Pago' : sesion.metodoPago, muted: false },
    ...(sesion.cobradoPorNombre ? [{ text: sesion.cobradoPorNombre, muted: false }] : []),
    ...(isMP && sesion.referenciaExterna ? [{ text: `#${sesion.referenciaExterna}`, muted: true }] : []),
    { text: fmtHora(sesion.fechaCobro), muted: true },
  ]
  return (
    <div style={{
      background: C.white, borderRadius: 10, border: `1px solid ${C.border}`,
      padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%', background: C.greenSoft,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <CheckCircle size={18} color={C.green} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 14, color: C.navy }}>
            Mesa {sesion.mesaNumero}
          </span>
          <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 15, color: C.navy, flexShrink: 0 }}>
            {fmtMoney(sesion.totalCobrado)}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
          {badges.map(({ text, muted }, i) => (
            <span key={i} style={{
              background: muted ? C.bg : C.navySoft,
              color: muted ? C.textMuted : C.navy,
              fontFamily: 'Inter,sans-serif', fontSize: 11, fontWeight: 500,
              padding: '2px 8px', borderRadius: 20, border: `1px solid ${C.border}`,
              whiteSpace: 'nowrap',
            }}>
              {text}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── PagosPage ─────────────────────────────────────────────────────────────────
export function PagosPage() {
  const { user }                   = useAuth()
  const { selectedRestauranteId }  = useContextStore()
  const esGerente                  = user?.rol === 'GERENTE'

  const [activas,        setActivas]        = useState<SesionActiva[]>([])
  const [pagadas,        setPagadas]        = useState<SesionPagada[]>([])
  const [tab,            setTab]            = useState<TabHistorial>('hoy')
  const [loadingActivas, setLoadingActivas] = useState(false)
  const [loadingPagadas, setLoadingPagadas] = useState(false)
  const [error,          setError]          = useState<string | null>(null)
  const [modalSesion,    setModalSesion]    = useState<SesionActiva | null>(null)
  const [toast,          setToast]          = useState<string | null>(null)

  const socketRef   = useRef<Socket | null>(null)
  const toastTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Refs para el handler del socket, evitando reconexiones al cambiar tab
  const tabRef      = useRef<TabHistorial>(tab)
  const esGerenteRef = useRef(esGerente)
  const restauranteRef = useRef(selectedRestauranteId)
  useEffect(() => { tabRef.current = tab },                        [tab])
  useEffect(() => { esGerenteRef.current = esGerente },           [esGerente])
  useEffect(() => { restauranteRef.current = selectedRestauranteId }, [selectedRestauranteId])

  // ── Fetch activas ──────────────────────────────────────────────────────────
  const fetchActivas = useCallback(async () => {
    if (!selectedRestauranteId) return
    setLoadingActivas(true)
    try {
      const data = await apiFetch<SesionActiva[]>(
        `/sessions/activas?restauranteId=${encodeURIComponent(selectedRestauranteId)}`,
      )
      setActivas(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar sesiones activas')
    } finally {
      setLoadingActivas(false)
    }
  }, [selectedRestauranteId])

  // ── Fetch pagadas ──────────────────────────────────────────────────────────
  const fetchPagadas = useCallback(async (fechaTab?: TabHistorial) => {
    if (!selectedRestauranteId) return
    setLoadingPagadas(true)
    try {
      const params = new URLSearchParams({ restauranteId: selectedRestauranteId })
      if (fechaTab && fechaTab !== 'semana') params.set('fecha', fechaTab)
      const data = await apiFetch<SesionPagada[]>(`/sessions/pagadas?${params.toString()}`)
      setPagadas(data)
    } catch { /* silencioso */ }
    finally { setLoadingPagadas(false) }
  }, [selectedRestauranteId, esGerente])

  // ── Carga inicial ──────────────────────────────────────────────────────────
  useEffect(() => {
    void fetchActivas()
    void fetchPagadas(tab)
  }, [fetchActivas, fetchPagadas, tab, esGerente])

  // ── Polling 30s ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedRestauranteId) return
    const id = setInterval(() => { void fetchActivas() }, 30_000)
    return () => clearInterval(id)
  }, [selectedRestauranteId, fetchActivas])

  // ── Mozos para select ──────────────────────────────────────────────────────

  // ── WebSocket ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedRestauranteId) return

    const socket: Socket = io(`${WS_URL}/ws`, {
      auth:       { token: localStorage.getItem(TOKEN_KEY) },
      transports: ['websocket'],
    })
    socketRef.current = socket

    socket.on('connect', () => {
      socket.emit('cocina:join', { restauranteId: selectedRestauranteId })
    })

    socket.on('sesion:quierePagar', ({ sesionId }: { sesionId: string }) => {
      if (!esGerenteRef.current) return
      setActivas((prev) =>
        prev.map((s) => s.id === sesionId ? { ...s, quierePagar: true } : s),
      )
    })

    socket.on('sesion:cobrada', ({ sesionId }: { sesionId: string }) => {
      setActivas((prev) => prev.filter((s) => s.id !== sesionId))
      const rid = restauranteRef.current
      if (!rid) return
      const params = new URLSearchParams({ restauranteId: rid })
      if (tabRef.current !== 'semana') params.set('fecha', tabRef.current)
      apiFetch<SesionPagada[]>(`/sessions/pagadas?${params.toString()}`)
        .then((data) => setPagadas(data))
        .catch(() => { /* silencioso */ })
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [selectedRestauranteId])

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleCobroDone() {
    setModalSesion(null)
    void fetchActivas()
    void fetchPagadas(tab)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast('Pago registrado correctamente')
    toastTimer.current = setTimeout(() => setToast(null), 2500)
  }

  function handleTabChange(t: TabHistorial) {
    setTab(t)
    void fetchPagadas(t)
  }

  // ── Guard ─────────────────────────────────────────────────────────────────
  if (!selectedRestauranteId) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 200, fontFamily: 'Inter,sans-serif', fontSize: 14, color: C.textMuted,
      }}>
        Seleccioná un restaurante para ver la caja
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const pagadasDisplay = (!esGerente && tab === 'semana')
    ? pagadas.filter((s) => s.fechaCobro != null && new Date(s.fechaCobro).getTime() >= Date.now() - 7 * 24 * 60 * 60 * 1000)
    : pagadas

  return (
    <div style={{ padding: '28px 28px 40px' }}>

      {/* Encabezado */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 22, color: C.navy, margin: 0 }}>
          Caja
        </h2>
        <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: C.textMuted, margin: '4px 0 0' }}>
          Actualización automática cada 30s
        </p>
      </div>

      {error && (
        <div style={{
          background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8,
          padding: '10px 14px', marginBottom: 20,
          fontFamily: 'Inter,sans-serif', fontSize: 13, color: '#dc2626',
        }}>
          {error}
        </div>
      )}

      {/* Dos columnas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>

        {/* ── Columna izquierda: pendientes ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 36 }}>
            <h3 style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 15, color: C.navy, margin: 0 }}>
              Pendientes de cobro
            </h3>
            {activas.length > 0 && (
              <span style={{
                background: C.navySoft, color: C.navy,
                fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 12,
                padding: '2px 9px', borderRadius: 20,
              }}>
                {activas.length}
              </span>
            )}
          </div>

          {loadingActivas && activas.length === 0 ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
              <RefreshCw size={18} color={C.textMuted} style={{ animation: 'spin 0.8s linear infinite' }} />
            </div>
          ) : activas.length === 0 ? (
            <div style={{
              background: C.white, borderRadius: 10, border: `1px dashed ${C.border}`,
              padding: '32px 20px', textAlign: 'center',
              fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.textMuted,
            }}>
              Sin mesas activas
            </div>
          ) : (
            activas.map((s) => (
              <SesionActivaCard
                key={s.id}
                sesion={s}
                esGerente={esGerente}
                onRegistrar={() => setModalSesion(s)}
              />
            ))
          )}
        </div>

        {/* ── Columna derecha: historial ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 36 }}>
            <h3 style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 15, color: C.navy, margin: 0 }}>
              Historial
            </h3>
            {esGerente ? (
              <div style={{ display: 'flex', background: C.navySoft, borderRadius: 8, padding: 3, gap: 2 }}>
                {(['hoy', 'ayer'] as const).map((t) => {
                  const active = tab === t
                  return (
                    <button
                      key={t}
                      onClick={() => handleTabChange(t)}
                      style={{
                        padding: '5px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
                        background: active ? C.white : 'transparent',
                        boxShadow: active ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
                        fontFamily: 'Inter,sans-serif', fontSize: 13,
                        fontWeight: active ? 600 : 400,
                        color: active ? C.navy : C.textSub,
                        transition: 'all 0.13s',
                      }}
                    >
                      {t === 'hoy' ? 'Hoy' : 'Ayer'}
                    </button>
                  )
                })}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 4 }}>
                {(['hoy', 'ayer', 'semana'] as const).map((t) => {
                  const active = tab === t
                  return (
                    <button
                      key={t}
                      onClick={() => handleTabChange(t)}
                      style={{
                        padding: '5px 14px', borderRadius: 6, cursor: 'pointer',
                        border: active ? `1px solid ${C.border}` : '1px solid transparent',
                        background: active ? C.navySoft : 'transparent',
                        fontFamily: 'Inter,sans-serif', fontSize: 13,
                        fontWeight: active ? 600 : 400,
                        color: active ? C.navy : C.textMuted,
                        transition: 'all 0.13s',
                      }}
                    >
                      {t === 'hoy' ? 'Hoy' : t === 'ayer' ? 'Ayer' : 'Última semana'}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {loadingPagadas ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
              <RefreshCw size={18} color={C.textMuted} style={{ animation: 'spin 0.8s linear infinite' }} />
            </div>
          ) : pagadasDisplay.length === 0 ? (
            <div style={{
              background: C.white, borderRadius: 10, border: `1px dashed ${C.border}`,
              padding: '32px 20px', textAlign: 'center',
              fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.textMuted,
            }}>
              Sin cobros registrados
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pagadasDisplay.map((s) => (
                <SesionPagadaCard key={s.id} sesion={s} />
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Modal de cobro — solo GERENTE */}
      {modalSesion && esGerente && (
        <CobroModal
          sesion={modalSesion}
          restauranteId={selectedRestauranteId ?? ''}
          onClose={() => setModalSesion(null)}
          onDone={handleCobroDone}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 2000,
          background: C.green, color: C.white,
          fontFamily: 'Inter,sans-serif', fontSize: 13, fontWeight: 600,
          padding: '12px 20px', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          animation: 'fadeIn 0.2s ease-out',
        }}>
          {toast}
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
