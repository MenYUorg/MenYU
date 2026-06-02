import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@menyu/auth'
import { Bell, CheckCircle, CreditCard, RefreshCw, X } from 'lucide-react'
import { api } from '../../services/api'
import type { SesionActivaItem, SesionPagadaItem } from '../../services/api'
import { useMozoStore } from '../../store/mozoStore'
import * as socketService from '../../services/socket'
import { PageHeader } from '../../components/PageHeader'

function getInitials(name?: string): string {
  if (!name) return '?'
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

// ── Types ─────────────────────────────────────────────────────────────────────
type MetodoPago = 'efectivo' | 'debito' | 'credito' | 'transferencia' | 'mercadopago'
type CobradoPorTipo = 'mozo' | 'gerente'

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  orange:   '#E8563A',
  navy:     '#2D3561',
  bg:       '#F6F7F9',
  white:    '#FFFFFF',
  border:   '#E6E8EF',
  chipBg:   '#EEF0F8',
  greenBg:  '#E4F6EC',
  green:    '#1F9D57',
  orangeBg: '#FDF0ED',
  textMut:  '#6B7280',
  red:      '#dc2626',
} as const

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

// ── CobroModal ────────────────────────────────────────────────────────────────
const METODOS: { key: MetodoPago; label: string }[] = [
  { key: 'efectivo',      label: 'Efectivo' },
  { key: 'debito',        label: 'Débito' },
  { key: 'credito',       label: 'Crédito' },
  { key: 'transferencia', label: 'Transferencia' },
  { key: 'mercadopago',   label: 'Mercado Pago' },
]

function CobroModal({
  sesion,
  gerenteNombre,
  onClose,
  onDone,
}: {
  sesion: SesionActivaItem
  gerenteNombre: string
  onClose: () => void
  onDone: (mesaNumero: string) => void
}) {
  const [metodo,            setMetodo]            = useState<MetodoPago | null>(null)
  const [cobradoPorTipo,    setCobradoPorTipo]    = useState<CobradoPorTipo | null>(null)
  const [mozoId,            setMozoId]            = useState('')
  const [referenciaExterna, setReferenciaExterna] = useState('')
  const [loading,           setLoading]           = useState(false)
  const [error,             setError]             = useState<string | null>(null)

  const canConfirm = !!metodo && (
    metodo === 'mercadopago' ||
    cobradoPorTipo === 'gerente' ||
    (cobradoPorTipo === 'mozo' && !!mozoId)
  )

  async function handleConfirmar() {
    if (!canConfirm) return
    setLoading(true)
    setError(null)
    try {
      const body: { metodoPago: string; mozoId?: string; cobradoPorNombre?: string; referenciaExterna?: string } = { metodoPago: metodo! }
      if (metodo === 'mercadopago') {
        body.cobradoPorNombre = 'Mercado Pago'
        if (referenciaExterna.trim()) body.referenciaExterna = referenciaExterna.trim()
      } else if (cobradoPorTipo === 'mozo' && mozoId) {
        body.mozoId = mozoId
      } else if (cobradoPorTipo === 'gerente') {
        body.cobradoPorNombre = gerenteNombre
      }
      await api.sesiones.registrarCobro(sesion.id, body)
      onDone(sesion.mesaNumero)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al registrar pago')
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose() }}
    >
      <div style={{
        background: C.white, borderRadius: 14, width: '100%', maxWidth: 440,
        padding: '28px 28px 24px', boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 }}>
          <div>
            <h3 style={{
              fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 17,
              color: C.navy, margin: 0,
            }}>
              Registrar pago · Mesa {sesion.mesaNumero}
            </h3>
            <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.textMut, margin: '5px 0 0' }}>
              Total a cobrar:{' '}
              <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, color: C.navy }}>
                {fmtMoney(sesion.totalAcumulado)}
              </span>
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMut, padding: 4, display: 'flex' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Método de pago */}
        <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 10 }}>
          Método de pago
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 20 }}>
          {METODOS.map(({ key, label }) => {
            const sel = metodo === key
            return (
              <button
                key={key}
                onClick={() => { setMetodo(key); setCobradoPorTipo(null); setMozoId('') }}
                style={{
                  padding: '10px 14px', borderRadius: 8,
                  border: `1.5px solid ${sel ? C.orange : C.border}`,
                  background: sel ? C.orangeBg : C.white,
                  color: sel ? C.orange : '#374151',
                  fontFamily: 'Inter,sans-serif', fontSize: 13, fontWeight: sel ? 600 : 400,
                  cursor: 'pointer', textAlign: 'left', transition: 'all 0.13s',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* Cobrado por — solo si NO es MP */}
        {metodo && metodo !== 'mercadopago' && (
          <>
            <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
              Cobrado por
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: cobradoPorTipo ? 12 : 22 }}>
              {(['mozo', 'gerente'] as const).map((tipo) => {
                const sel = cobradoPorTipo === tipo
                return (
                  <button
                    key={tipo}
                    onClick={() => { setCobradoPorTipo(tipo); setMozoId('') }}
                    style={{
                      flex: 1, padding: '9px 0', borderRadius: 8,
                      border: `1.5px solid ${sel ? C.orange : C.border}`,
                      background: sel ? C.orangeBg : C.white,
                      color: sel ? C.orange : '#374151',
                      fontFamily: 'Inter,sans-serif', fontSize: 13, fontWeight: sel ? 600 : 400,
                      cursor: 'pointer', transition: 'all 0.13s',
                    }}
                  >
                    {tipo === 'mozo' ? 'Mozo' : 'Gerente (yo)'}
                  </button>
                )
              })}
            </div>
            {cobradoPorTipo === 'mozo' && (
              <select
                value={mozoId}
                onChange={(e) => setMozoId(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  border: `1px solid ${C.border}`, fontFamily: 'Inter,sans-serif', fontSize: 13,
                  color: mozoId ? '#374151' : C.textMut,
                  background: C.white, outline: 'none', boxSizing: 'border-box',
                  marginBottom: 22,
                }}
              >
                <option value="">Seleccionar mozo…</option>
              </select>
            )}
            {cobradoPorTipo === 'gerente' && (
              <div style={{
                padding: '10px 12px', borderRadius: 8, marginBottom: 22,
                background: C.chipBg, border: `1px solid ${C.border}`,
                fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.navy,
              }}>
                {gerenteNombre}
              </div>
            )}
          </>
        )}

        {/* ID de transacción — solo MP */}
        {metodo === 'mercadopago' && (
          <>
            <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
              ID de transacción (opcional)
            </p>
            <input
              type="text"
              value={referenciaExterna}
              onChange={(e) => setReferenciaExterna(e.target.value)}
              placeholder="Ej. 12345678901"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                border: `1px solid ${C.border}`, fontFamily: 'Inter,sans-serif', fontSize: 13,
                color: '#374151', background: C.white, outline: 'none',
                boxSizing: 'border-box', marginBottom: 22,
              }}
            />
          </>
        )}

        {error && (
          <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: C.red, marginBottom: 14 }}>
            {error}
          </p>
        )}

        {/* Acciones */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              padding: '10px 18px', borderRadius: 8,
              border: `1px solid ${C.border}`, background: C.white,
              fontFamily: 'Inter,sans-serif', fontSize: 13, color: '#374151',
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
              color: !canConfirm || loading ? '#9ca3af' : C.white,
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

// ── Pill ──────────────────────────────────────────────────────────────────────
function Pill({ text, muted = false }: { text: string; muted?: boolean }) {
  return (
    <span style={{
      background: muted ? C.bg : C.chipBg,
      color: muted ? C.textMut : C.navy,
      fontFamily: 'Inter,sans-serif', fontSize: 11, fontWeight: 500,
      padding: '2px 8px', borderRadius: 20,
      border: `1px solid ${C.border}`,
      whiteSpace: 'nowrap',
    }}>
      {text}
    </span>
  )
}

// ── SesionActivaCard ──────────────────────────────────────────────────────────
function SesionActivaCard({
  sesion,
  onRegistrar,
}: {
  sesion: SesionActivaItem
  onRegistrar: () => void
}) {
  const { quierePagar } = sesion
  return (
    <div style={{
      background: C.white, borderRadius: 10,
      border: `1px solid ${quierePagar ? C.orange : C.border}`,
      borderLeft: `3px solid ${quierePagar ? C.orange : C.border}`,
      padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {/* Fila superior */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            background: C.chipBg, color: C.navy,
            fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 13,
            padding: '4px 10px', borderRadius: 6, flexShrink: 0,
          }}>
            {sesion.mesaNumero}
          </span>
          <div>
            <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 15, color: C.navy }}>
              Mesa {sesion.mesaNumero}
            </div>
            <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: C.textMut, marginTop: 1 }}>
              {fmtTiempo(sesion.tiempoTranscurrido)} · {sesion.cantidadItems} ítem{sesion.cantidadItems !== 1 ? 's' : ''} · {sesion.cantidadPersonas} pers.
            </div>
          </div>
        </div>
        {quierePagar && (
          <span style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: C.orangeBg, color: C.orange,
            fontFamily: 'Inter,sans-serif', fontWeight: 600, fontSize: 11,
            padding: '4px 9px', borderRadius: 20, flexShrink: 0,
          }}>
            <Bell size={12} style={{ animation: 'ring 1.2s ease-in-out infinite' }} />
            Quiere pagar
          </span>
        )}
      </div>

      {/* Total */}
      <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 22, color: C.navy, lineHeight: 1 }}>
        {fmtMoney(sesion.totalAcumulado)}
      </div>

      {/* Botones */}
      <div style={{ display: 'flex', gap: 8 }}>
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
        <button
          style={{
            padding: '9px 14px', borderRadius: 8,
            border: `1.5px solid ${C.navy}`, background: 'transparent', color: C.navy,
            fontFamily: 'Inter,sans-serif', fontSize: 13, cursor: 'pointer',
          }}
        >
          Ver pedidos
        </button>
      </div>
    </div>
  )
}

// ── SesionPagadaCard ──────────────────────────────────────────────────────────
function SesionPagadaCard({ sesion }: { sesion: SesionPagadaItem }) {
  const isMP = sesion.metodoPago === 'mercadopago'
  return (
    <div style={{
      background: C.white, borderRadius: 10, border: `1px solid ${C.border}`,
      padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%', background: C.greenBg,
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
          <Pill text={isMP ? 'Mercado Pago' : sesion.metodoPago} />
          {sesion.cobradoPorNombre && <Pill text={sesion.cobradoPorNombre} />}
          {isMP && sesion.referenciaExterna && <Pill text={`#${sesion.referenciaExterna}`} muted />}
          <Pill text={fmtHora(sesion.fechaCobro)} muted />
        </div>
      </div>
    </div>
  )
}

// ── PagosGerente ──────────────────────────────────────────────────────────────
export function PagosGerente() {
  const navigate = useNavigate()
  const { user }           = useAuth()
  const restauranteIdStore = useMozoStore((s) => s.restauranteId)
  const restauranteId      = user?.restauranteId ?? restauranteIdStore

  const [sesionesActivas, setSesionesActivas] = useState<SesionActivaItem[]>([])
  const [sesionesPagadas, setSesionesPagadas] = useState<SesionPagadaItem[]>([])
  const [tabHistorial, setTabHistorial]       = useState<'hoy' | 'ayer'>('hoy')
  const [_loadingActivas, setLoadingActivas]  = useState(false)
  const [loadingPagadas, setLoadingPagadas]   = useState(false)
  const [modalSesion, setModalSesion]         = useState<SesionActivaItem | null>(null)
  const [toast, setToast]                     = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Fetches ──────────────────────────────────────────────────────────────
  const fetchActivas = useCallback(async () => {
    if (!restauranteId) return
    setLoadingActivas(true)
    try {
      const data = await api.sesiones.getActivas(restauranteId)
      setSesionesActivas(data)
    } catch { /* silencioso */ }
    finally { setLoadingActivas(false) }
  }, [restauranteId])

  const fetchPagadas = useCallback(async (fecha: 'hoy' | 'ayer') => {
    if (!restauranteId) return
    setLoadingPagadas(true)
    try {
      const data = await api.sesiones.getPagadas(restauranteId, fecha)
      setSesionesPagadas(data)
    } catch { /* silencioso */ }
    finally { setLoadingPagadas(false) }
  }, [restauranteId])

  // Carga inicial
  useEffect(() => {
    void fetchActivas()
    void fetchPagadas('hoy')
  }, [fetchActivas, fetchPagadas])

  // Re-fetch pagadas al cambiar tab
  useEffect(() => { void fetchPagadas(tabHistorial) }, [tabHistorial, fetchPagadas])

  // Intervalo 30s para activas
  useEffect(() => {
    if (!restauranteId) return
    const id = setInterval(() => { void fetchActivas() }, 30000)
    return () => clearInterval(id)
  }, [restauranteId, fetchActivas])

  // ── Socket ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!restauranteId) return
    socketService.joinRestauranteComoMozo(restauranteId)

    const unsubQuiere = socketService.onSesionQuierePagar(({ sesionId }) => {
      setSesionesActivas((prev) =>
        prev.map((s) => s.id === sesionId ? { ...s, quierePagar: true } : s),
      )
    })

    const unsubCobrada = socketService.onSesionCobrada(({ sesionId }) => {
      setSesionesActivas((prev) => prev.filter((s) => s.id !== sesionId))
    })

    return () => {
      unsubQuiere()
      unsubCobrada()
    }
  }, [restauranteId])

  // ── Post-cobro ───────────────────────────────────────────────────────────
  function handleCobroDone(mesaNumero: string) {
    setModalSesion(null)
    void fetchActivas()
    void fetchPagadas(tabHistorial)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(`Pago registrado · Mesa ${mesaNumero}`)
    toastTimer.current = setTimeout(() => setToast(null), 2500)
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        title="Caja"
        breadcrumb="PANEL › GERENTE"
        icon={<CreditCard size={18} />}
        onBack={() => navigate('/mozo')}
        onRefresh={() => { void fetchActivas(); void fetchPagadas(tabHistorial) }}
        userName={user?.nombre ?? user?.email ?? 'Gerente'}
        userRole="Gerente"
        userInitials={getInitials(user?.nombre ?? user?.email)}
      />

      {/* Cuerpo — 2 columnas */}
      <div style={{
        flex: 1, display: 'grid', gridTemplateColumns: '55fr 45fr',
        gap: 16, padding: 16, alignItems: 'start',
      }}>

        {/* ── Columna izquierda: pendientes ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 40 }}>
            <h2 style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 15, color: C.navy, margin: 0 }}>
              Pendientes de cobro
            </h2>
            {sesionesActivas.length > 0 && (
              <span style={{
                background: C.chipBg, color: C.navy,
                fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 12,
                padding: '2px 9px', borderRadius: 20,
              }}>
                {sesionesActivas.length}
              </span>
            )}
          </div>

          {sesionesActivas.length === 0 ? (
            <div style={{
              background: C.white, borderRadius: 10, border: `1px solid ${C.border}`,
              padding: '32px 20px', textAlign: 'center',
              fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.textMut,
            }}>
              Sin mesas activas
            </div>
          ) : (
            sesionesActivas.map((s) => (
              <SesionActivaCard key={s.id} sesion={s} onRegistrar={() => setModalSesion(s)} />
            ))
          )}
        </div>

        {/* ── Columna derecha: historial ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Título + tabs */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 40 }}>
            <h2 style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 15, color: C.navy, margin: 0 }}>
              Historial
            </h2>
            <div style={{ display: 'flex', background: C.chipBg, borderRadius: 8, padding: 3, gap: 2 }}>
              {(['hoy', 'ayer'] as const).map((tab) => {
                const active = tabHistorial === tab
                return (
                  <button
                    key={tab}
                    onClick={() => setTabHistorial(tab)}
                    style={{
                      padding: '5px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
                      background: active ? C.white : 'transparent',
                      boxShadow: active ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
                      fontFamily: 'Inter,sans-serif', fontSize: 13,
                      fontWeight: active ? 600 : 400,
                      color: active ? C.navy : C.textMut,
                      transition: 'all 0.13s',
                    }}
                  >
                    {tab === 'hoy' ? 'Hoy' : 'Ayer'}
                  </button>
                )
              })}
            </div>
          </div>

          {loadingPagadas ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 28 }}>
              <RefreshCw size={18} color={C.textMut} style={{ animation: 'spin 0.8s linear infinite' }} />
            </div>
          ) : sesionesPagadas.length === 0 ? (
            <div style={{
              background: C.white, borderRadius: 10, border: `1px solid ${C.border}`,
              padding: '32px 20px', textAlign: 'center',
              fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.textMut,
            }}>
              Sin cobros registrados
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sesionesPagadas.map((s) => (
                <SesionPagadaCard key={s.id} sesion={s} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal de cobro */}
      {modalSesion && (
        <CobroModal
          sesion={modalSesion}
          gerenteNombre={user?.nombre ?? user?.email ?? 'Gerente'}
          onClose={() => setModalSesion(null)}
          onDone={handleCobroDone}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 2000,
          background: C.green, color: 'white',
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
        @keyframes ring {
          0%,100% { transform: rotate(0deg); }
          10%     { transform: rotate(18deg); }
          20%     { transform: rotate(-14deg); }
          30%     { transform: rotate(12deg); }
          40%     { transform: rotate(-8deg); }
          50%     { transform: rotate(5deg); }
          65%     { transform: rotate(-3deg); }
          80%     { transform: rotate(2deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
