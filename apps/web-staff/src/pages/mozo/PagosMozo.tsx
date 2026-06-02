import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@menyu/auth'
import { Bell, CreditCard, RefreshCw, X } from 'lucide-react'
import { api } from '../../services/api'
import type { SesionActivaItem } from '../../services/api'
import { useMozoStore } from '../../store/mozoStore'
import * as socketService from '../../services/socket'
import { PageHeader } from '../../components/PageHeader'

function getInitials(name?: string): string {
  if (!name) return '?'
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

type MetodoPago = 'efectivo' | 'debito' | 'credito' | 'transferencia' | 'mercadopago'

const C = {
  orange:   '#E8563A',
  navy:     '#2D3561',
  bg:       '#F6F7F9',
  white:    '#FFFFFF',
  border:   '#E6E8EF',
  chipBg:   '#EEF0F8',
  green:    '#1F9D57',
  orangeBg: '#FDF0ED',
  textMut:  '#6B7280',
  red:      '#dc2626',
} as const

function fmtTiempo(min: number): string {
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)}h ${min % 60}m`
}

function fmtMoney(n: number): string {
  return '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

const METODOS: { key: MetodoPago; label: string }[] = [
  { key: 'efectivo',      label: 'Efectivo' },
  { key: 'debito',        label: 'Débito' },
  { key: 'credito',       label: 'Crédito' },
  { key: 'transferencia', label: 'Transferencia' },
  { key: 'mercadopago',   label: 'Mercado Pago' },
]

function CobroModal({
  sesion,
  mozoId,
  onClose,
  onDone,
}: {
  sesion: SesionActivaItem
  mozoId: string
  onClose: () => void
  onDone: (mesaNumero: string) => void
}) {
  const [metodo,            setMetodo]            = useState<MetodoPago | null>(null)
  const [referenciaExterna, setReferenciaExterna] = useState('')
  const [loading,           setLoading]           = useState(false)
  const [error,             setError]             = useState<string | null>(null)

  async function handleConfirmar() {
    if (!metodo) return
    setLoading(true)
    setError(null)
    try {
      await api.sesiones.registrarCobro(sesion.id, {
        metodoPago: metodo,
        ...(mozoId ? { mozoId } : {}),
        ...(metodo === 'mercadopago' && referenciaExterna.trim() ? { referenciaExterna: referenciaExterna.trim() } : {}),
      })
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
                onClick={() => setMetodo(key)}
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
            disabled={!metodo || loading}
            style={{
              padding: '10px 22px', borderRadius: 8, border: 'none',
              background: !metodo || loading ? '#d1d5db' : C.orange,
              fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13,
              color: !metodo || loading ? '#9ca3af' : C.white,
              cursor: !metodo || loading ? 'not-allowed' : 'pointer',
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

function SesionActivaCard({
  sesion,
  onRegistrar,
  onVerPedidos,
}: {
  sesion: SesionActivaItem
  onRegistrar: () => void
  onVerPedidos: () => void
}) {
  const { quierePagar } = sesion
  return (
    <div style={{
      background: C.white, borderRadius: 10,
      border: `1px solid ${quierePagar ? C.orange : C.border}`,
      borderLeft: `3px solid ${quierePagar ? C.orange : C.border}`,
      padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10,
    }}>
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

      <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 22, color: C.navy, lineHeight: 1 }}>
        {fmtMoney(sesion.totalAcumulado)}
      </div>

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
          onClick={onVerPedidos}
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

// ── PagosMozo ─────────────────────────────────────────────────────────────────
export function PagosMozo() {
  const navigate = useNavigate()
  const { user }           = useAuth()
  const restauranteIdStore = useMozoStore((s) => s.restauranteId)
  const restauranteId      = user?.restauranteId ?? restauranteIdStore
  const nombreUsuario      = user?.nombre ?? user?.email ?? 'Mozo'

  const [sesionesActivas, setSesionesActivas] = useState<SesionActivaItem[]>([])
  const [loadingActivas, setLoadingActivas]   = useState(false)
  const [modalSesion, setModalSesion]         = useState<SesionActivaItem | null>(null)
  const [toast, setToast]                     = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchActivas = useCallback(async () => {
    if (!restauranteId) return
    setLoadingActivas(true)
    try {
      const data = await api.sesiones.getActivas(restauranteId)
      setSesionesActivas(data)
    } catch { /* silencioso */ }
    finally { setLoadingActivas(false) }
  }, [restauranteId])

  useEffect(() => { void fetchActivas() }, [fetchActivas])

  useEffect(() => {
    if (!restauranteId) return
    const id = setInterval(() => { void fetchActivas() }, 30000)
    return () => clearInterval(id)
  }, [restauranteId, fetchActivas])

  useEffect(() => {
    if (!restauranteId) return
    socketService.joinRestauranteComoMozo(restauranteId)

    const unsubQuiere = socketService.onSesionQuierePagar((data: { sesionId: string }) => {
      setSesionesActivas((prev) =>
        prev.map((s) =>
          s.id === data.sesionId ? { ...s, quierePagar: true } : s
        )
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

  function handleCobroDone(mesaNumero: string) {
    setModalSesion(null)
    void fetchActivas()
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(`Pago registrado · Mesa ${mesaNumero}`)
    toastTimer.current = setTimeout(() => setToast(null), 2500)
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        title="Pagos"
        breadcrumb="PANEL › MOZO"
        icon={<CreditCard size={18} />}
        onBack={() => navigate('/mozo')}
        userName={nombreUsuario}
        userRole="Mozo"
        userInitials={getInitials(nombreUsuario)}
      />

      <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
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

        {loadingActivas && sesionesActivas.length === 0 ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 28 }}>
            <RefreshCw size={18} color={C.textMut} style={{ animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : sesionesActivas.length === 0 ? (
          <div style={{
            background: C.white, borderRadius: 10, border: `1px solid ${C.border}`,
            padding: '32px 20px', textAlign: 'center',
            fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.textMut,
          }}>
            Sin mesas activas
          </div>
        ) : (
          sesionesActivas.map((s) => (
            <SesionActivaCard
              key={s.id}
              sesion={s}
              onRegistrar={() => setModalSesion(s)}
              onVerPedidos={() => navigate(`/mozo/mesas?mesaId=${s.mesaId}`)}
            />
          ))
        )}
      </div>

      {modalSesion && (
        <CobroModal
          sesion={modalSesion}
          mozoId={user?.sub ?? ''}
          onClose={() => setModalSesion(null)}
          onDone={handleCobroDone}
        />
      )}

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
