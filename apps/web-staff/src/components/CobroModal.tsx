import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { api, ApiError } from '../services/api'
import type {
  EstadoComensalDto,
  EstadoComensalesResult,
  EstadoPagoComensal,
  SesionActivaItem,
} from '../services/api'

type MetodoPago = 'efectivo' | 'debito' | 'credito' | 'transferencia' | 'mercadopago'
type CobradoPorTipo = 'mozo' | 'gerente'

export type CobradoPor =
  | { modo: 'mozo-actual'; mozoId: string }
  | { modo: 'elegir'; gerenteNombre: string }

const C = {
  orange:   '#E8563A',
  navy:     '#2D3561',
  white:    '#FFFFFF',
  border:   '#E6E8EF',
  chipBg:   '#EEF0F8',
  green:    '#1F9D57',
  greenBg:  '#E4F6EC',
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

// El backend nombra los slots virtuales "Invitado N"; ese N es el indiceSlot que espera al cobrar.
function indiceDeSlot(nombre: string): number | null {
  const m = /^Invitado (\d+)$/.exec(nombre)
  return m ? Number(m[1]) : null
}

interface PresentacionPago {
  etiqueta: string
  color: string
  fondo: string
  cobrable: boolean
}

// Switch exhaustivo: si EstadoPagoComensal suma un estado, el `never` del default rompe el typecheck.
function presentarEstadoPago(estadoPago: EstadoPagoComensal | null): PresentacionPago {
  switch (estadoPago) {
    case 'aprobado':
      return { etiqueta: 'Pagado', color: C.green, fondo: C.greenBg, cobrable: false }
    case 'pendiente':
      return { etiqueta: 'Pidió la cuenta', color: C.orange, fondo: C.white, cobrable: true }
    case 'cancelado':
      return { etiqueta: 'Pago cancelado', color: C.red, fondo: C.white, cobrable: true }
    case 'rechazado':
      return { etiqueta: 'Pago rechazado', color: C.red, fondo: C.white, cobrable: true }
    case null:
      return { etiqueta: 'Sin cobrar', color: C.textMut, fondo: C.white, cobrable: true }
    default: {
      // En runtime, un estado desconocido nunca se ofrece como cobrable.
      const _exhaustivo: never = estadoPago
      void _exhaustivo
      return { etiqueta: 'Estado desconocido', color: C.red, fondo: C.white, cobrable: false }
    }
  }
}

interface ErrorEstado {
  mensaje: string
  reintentable: boolean
}

interface CobroModalProps {
  sesion: SesionActivaItem
  cobradoPor: CobradoPor
  onClose: () => void
  onDone: (mesaNumero: string) => void
}

export function CobroModal({ sesion, cobradoPor, onClose, onDone }: CobroModalProps) {
  const [metodo,            setMetodo]            = useState<MetodoPago | null>(null)
  const [cobradoPorTipo,    setCobradoPorTipo]    = useState<CobradoPorTipo | null>(null)
  const [mozoId,            setMozoId]            = useState('')
  const [referenciaExterna, setReferenciaExterna] = useState('')
  const [loading,           setLoading]           = useState(false)
  const [error,             setError]             = useState<string | null>(null)
  const [advertencia,       setAdvertencia]       = useState<string | null>(null)
  const [estado,            setEstado]            = useState<EstadoComensalesResult | null>(null)
  const [errorEstado,       setErrorEstado]       = useState<ErrorEstado | null>(null)
  const [cargandoLista,     setCargandoLista]     = useState(true)

  const canConfirm = !!metodo && (
    cobradoPor.modo === 'mozo-actual' ||
    metodo === 'mercadopago' ||
    cobradoPorTipo === 'gerente' ||
    (cobradoPorTipo === 'mozo' && !!mozoId)
  )

  const mostrarLista =
    estado !== null &&
    estado.divisionPagosHabilitada &&
    estado.modoDivision !== null &&
    estado.cantidadComensales !== null

  const cargarEstado = useCallback(async (): Promise<EstadoComensalesResult | null> => {
    try {
      const r = await api.pagos.getEstadoComensales(sesion.id)
      setEstado(r)
      setErrorEstado(null)
      return r
    } catch (e) {
      // No se vacía `estado`: si falla una recarga la lista previa sigue visible y el
      // aviso indica que puede estar desactualizada.
      const noEncontrada = e instanceof ApiError && e.status === 404
      setErrorEstado({
        mensaje: e instanceof Error ? e.message : 'Error de conexión',
        reintentable: !noEncontrada,
      })
      return null
    }
  }, [sesion.id])

  useEffect(() => {
    void cargarEstado().finally(() => setCargandoLista(false))
  }, [cargarEstado])

  function reintentarEstado() {
    setCargandoLista(true)
    void cargarEstado().finally(() => setCargandoLista(false))
  }

  // Quién responde por el cobro, según el rol y las opciones elegidas.
  function datosCobrador(): { mozoId?: string; cobradoPorNombre?: string } {
    if (cobradoPor.modo === 'mozo-actual') return cobradoPor.mozoId ? { mozoId: cobradoPor.mozoId } : {}
    if (metodo === 'mercadopago') return { cobradoPorNombre: 'Mercado Pago' }
    if (cobradoPorTipo === 'mozo' && mozoId) return { mozoId }
    if (cobradoPorTipo === 'gerente') return { cobradoPorNombre: cobradoPor.gerenteNombre }
    return {}
  }

  // Tras un cobro exitoso: si el saldo quedó en 0 la sesión se cerró → cerrar el modal;
  // si no, queda abierto con la lista actualizada.
  async function finalizarCobro() {
    if (!mostrarLista) { onDone(sesion.mesaNumero); return }
    const r = await cargarEstado()
    if (r === null || r.saldoPendiente <= 0) { onDone(sesion.mesaNumero); return }
    setLoading(false)
  }

  async function cobrarMesa(confirmarCancelacion = false) {
    if (!canConfirm || !metodo) return
    setLoading(true)
    setError(null)
    setAdvertencia(null)
    try {
      await api.sesiones.registrarCobro(sesion.id, {
        metodoPago: metodo,
        ...datosCobrador(),
        ...(metodo === 'mercadopago' && referenciaExterna.trim() ? { referenciaExterna: referenciaExterna.trim() } : {}),
        ...(confirmarCancelacion ? { confirmarCancelacionPagosPendientes: true } : {}),
      })
      await finalizarCobro()
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setAdvertencia(e.message)
      else setError(e instanceof Error ? e.message : 'Error al registrar pago')
      setLoading(false)
    }
  }

  async function cobrarComensal(c: EstadoComensalDto) {
    if (!canConfirm || !metodo) return
    let indiceSlot: number | undefined
    if (c.comensalId === null) {
      const n = indiceDeSlot(c.nombre)
      if (n === null) { setError(`No se pudo determinar el número de "${c.nombre}"`); return }
      indiceSlot = n
    }
    setLoading(true)
    setError(null)
    setAdvertencia(null)
    try {
      await api.pagos.cobrarComensal(sesion.id, {
        comensalId: c.comensalId,
        ...(indiceSlot !== undefined ? { indiceSlot } : {}),
        metodoPago: metodo,
        ...datosCobrador(),
      })
      await finalizarCobro()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al registrar pago')
      // 409: el slot ya no está disponible o el pago ya estaba aprobado → la lista quedó vieja.
      if (e instanceof ApiError && e.status === 409) await cargarEstado()
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
        background: C.white, borderRadius: 14, width: '100%', maxWidth: mostrarLista ? 500 : 440,
        maxHeight: '90vh', overflowY: 'auto',
        padding: '28px 28px 24px', boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 }}>
          <div>
            <h3 style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 17, color: C.navy, margin: 0 }}>
              Registrar pago · Mesa {sesion.mesaNumero}
            </h3>
            {mostrarLista && estado ? (
              <div style={{ display: 'flex', gap: 18, marginTop: 8, fontFamily: 'Inter,sans-serif', fontSize: 12, color: C.textMut }}>
                {([
                  ['Total', estado.totalSesion],
                  ['Cobrado', estado.totalCobrado],
                  ['Saldo', estado.saldoPendiente],
                ] as const).map(([label, valor]) => (
                  <span key={label}>
                    {label}:{' '}
                    <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, color: C.navy }}>
                      {fmtMoney(valor)}
                    </span>
                  </span>
                ))}
              </div>
            ) : (
              <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.textMut, margin: '5px 0 0' }}>
                Total a cobrar:{' '}
                <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, color: C.navy }}>
                  {fmtMoney(sesion.totalAcumulado)}
                </span>
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMut, padding: 4, display: 'flex' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Aviso: no se pudo cargar el estado por comensal */}
        {errorEstado && (
          <div style={{
            padding: '12px 14px', borderRadius: 8, marginBottom: 18,
            background: C.orangeBg, border: `1px solid ${C.orange}`,
            fontFamily: 'Inter,sans-serif', fontSize: 13, color: '#374151',
          }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              {estado !== null
                ? 'No se pudo actualizar la lista de comensales.'
                : 'No se pudo cargar el estado por comensal.'}
            </div>
            <div style={{ fontSize: 12, color: C.textMut }}>
              {errorEstado.mensaje}.{' '}
              {estado !== null
                ? 'Los montos y estados que ves pueden estar desactualizados.'
                : 'Puede haber pagos de comensales que no se están viendo.'}
            </div>
            {errorEstado.reintentable && (
              <button
                onClick={reintentarEstado}
                disabled={cargandoLista || loading}
                style={{
                  marginTop: 10, padding: '6px 14px', borderRadius: 6,
                  border: `1px solid ${C.orange}`, background: C.white, color: C.orange,
                  fontFamily: 'Inter,sans-serif', fontSize: 12, fontWeight: 600,
                  cursor: cargandoLista || loading ? 'default' : 'pointer',
                }}
              >
                {cargandoLista ? 'Reintentando…' : 'Reintentar'}
              </button>
            )}
          </div>
        )}

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
                onClick={() => { setMetodo(key); setCobradoPorTipo(null); setMozoId(''); setAdvertencia(null) }}
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

        {/* Cobrado por — solo si elige (gerente) y NO es MP */}
        {cobradoPor.modo === 'elegir' && metodo && metodo !== 'mercadopago' && (
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
                    onClick={() => { setCobradoPorTipo(tipo); setMozoId(''); setAdvertencia(null) }}
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
                onChange={(e) => { setMozoId(e.target.value); setAdvertencia(null) }}
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
                {cobradoPor.gerenteNombre}
              </div>
            )}
          </>
        )}

        {/* ID de transacción — solo MP */}
        {metodo === 'mercadopago' && (
          <>
            <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
              ID de transacción (opcional){mostrarLista ? ' · solo para cobro de mesa completa' : ''}
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

        {/* Comensales */}
        {cargandoLista && !errorEstado && (
          <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: C.textMut, marginBottom: 16 }}>
            Cargando comensales…
          </p>
        )}
        {mostrarLista && estado && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
              Cobro por comensal
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {estado.comensales.map((c) => {
                const p = presentarEstadoPago(c.estadoPago)
                return (
                  <div
                    key={c.comensalId ?? c.nombre}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 12px', borderRadius: 8,
                      border: `1px solid ${C.border}`, background: p.fondo,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, fontWeight: 600, color: C.navy }}>
                        {c.nombre}
                      </div>
                      <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 11, color: p.color }}>
                        {p.etiqueta}
                      </div>
                    </div>
                    <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13, color: C.navy }}>
                      {c.monto === null ? '—' : fmtMoney(c.monto)}
                    </span>
                    {p.cobrable && (
                      <button
                        onClick={() => void cobrarComensal(c)}
                        disabled={!canConfirm || loading}
                        style={{
                          padding: '6px 14px', borderRadius: 6, border: 'none',
                          background: !canConfirm || loading ? '#d1d5db' : C.orange,
                          color: !canConfirm || loading ? '#9ca3af' : C.white,
                          fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 12,
                          cursor: !canConfirm || loading ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Cobrar
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
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
              {loading ? 'Registrando…' : mostrarLista ? 'Cobrar mesa completa' : 'Confirmar pago'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
