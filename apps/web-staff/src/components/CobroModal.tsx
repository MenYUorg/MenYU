import { useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { api, ApiError } from '../services/api'
import type { SesionActivaItem } from '../services/api'

type MetodoPago = 'efectivo' | 'debito' | 'credito' | 'transferencia' | 'mercadopago'

const C = {
  orange:   '#E8563A',
  navy:     '#2D3561',
  white:    '#FFFFFF',
  border:   '#E6E8EF',
  chipBg:   '#EEF0F8',
  orangeBg: '#FDF0ED',
  textMut:  '#6B7280',
  red:      '#dc2626',
} as const

const METODOS: { key: MetodoPago; label: string }[] = [
  { key: 'efectivo',      label: 'Efectivo' },
  { key: 'debito',        label: 'Débito' },
  { key: 'credito',       label: 'Crédito' },
  { key: 'transferencia', label: 'Transferencia' },
  { key: 'mercadopago',   label: 'Mercado Pago' },
]

function fmtMoney(n: number): string {
  return '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

interface CobroModalProps {
  sesion: SesionActivaItem
  onClose: () => void
  onDone: (mesaNumero: string) => void
}

/**
 * Registra el cobro de una mesa. Quién cobró lo deduce el backend de la cuenta que manda el pedido
 * (`common/atribucion-del-cobro.ts`, entrega 4.3): un MOZO o JEFE_SALON cobra con su propio `Mozo` y un OWNER o
 * GERENTE queda con su `usuarioId`. Por eso acá no se elige cobrador ni se manda `mozoId` o `cobradoPorNombre`.
 */
export function CobroModal({ sesion, onClose, onDone }: CobroModalProps) {
  const [metodo,            setMetodo]            = useState<MetodoPago | null>(null)
  const [referenciaExterna, setReferenciaExterna] = useState('')
  const [loading,           setLoading]           = useState(false)
  const [error,             setError]             = useState<string | null>(null)
  const [advertencia,       setAdvertencia]       = useState<string | null>(null)

  const canConfirm = !!metodo

  async function cobrarMesa(confirmarCancelacion = false) {
    if (!canConfirm || !metodo) return
    setLoading(true)
    setError(null)
    setAdvertencia(null)
    try {
      await api.sesiones.registrarCobro(sesion.id, {
        metodoPago: metodo,
        ...(metodo === 'mercadopago' && referenciaExterna.trim() ? { referenciaExterna: referenciaExterna.trim() } : {}),
        ...(confirmarCancelacion ? { confirmarCancelacionPagosPendientes: true } : {}),
      })
      onDone(sesion.mesaNumero)
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setAdvertencia(e.message)
      else setError(e instanceof Error ? e.message : 'Error al registrar pago')
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
        maxHeight: '90vh', overflowY: 'auto',
        padding: '28px 28px 24px', boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 }}>
          <div>
            <h3 style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 17, color: C.navy, margin: 0 }}>
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
                onClick={() => { setMetodo(key); setAdvertencia(null) }}
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

        {/* ID de transacción — solo MP */}
        {metodo === 'mercadopago' && (
          <>
            <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
              ID de transacción (opcional)
            </p>
            <input
              type="text"
              value={referenciaExterna}
              onChange={(e) => { setReferenciaExterna(e.target.value); setAdvertencia(null) }}
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

        {advertencia ? (
          /* Advertencia 409 al cobrar la mesa completa: confirmar repite la misma llamada */
          <div style={{
            padding: '12px 14px', borderRadius: 8,
            background: C.orangeBg, border: `1px solid ${C.orange}`,
            fontFamily: 'Inter,sans-serif', fontSize: 13, color: '#374151',
          }}>
            <div style={{ marginBottom: 14 }}>{advertencia}</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setAdvertencia(null)}
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
                onClick={() => void cobrarMesa(true)}
                disabled={loading}
                style={{
                  padding: '10px 22px', borderRadius: 8, border: 'none',
                  background: loading ? '#d1d5db' : C.orange,
                  fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13,
                  color: loading ? '#9ca3af' : C.white,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {loading && <RefreshCw size={13} style={{ animation: 'spin 0.8s linear infinite' }} />}
                {loading ? 'Registrando…' : 'Confirmar y cobrar mesa completa'}
              </button>
            </div>
          </div>
        ) : (
          /* Acciones */
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
              onClick={() => void cobrarMesa()}
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
        )}
      </div>
    </div>
  )
}
