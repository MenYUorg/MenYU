import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@menyu/auth'
import { Bell, CreditCard, RefreshCw } from 'lucide-react'
import { api } from '../../services/api'
import type { SesionActivaItem } from '../../services/api'
import { useMozoStore } from '../../store/mozoStore'
import * as socketService from '../../services/socket'
import { PageHeader } from '../../components/PageHeader'
import { CobroModal } from '../../components/CobroModal'

function getInitials(name?: string): string {
  if (!name) return '?'
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

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
          cobradoPor={{ modo: 'mozo-actual', mozoId: user?.sub ?? '' }}
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
