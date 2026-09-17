import { useNavigate, useSearchParams } from 'react-router-dom'
import { useState } from 'react'
import { Spinner } from '@menyu/ui'
import { useEtiquetado } from '../../hooks/useEtiquetado'
import type { Comensal, ItemEtiquetado } from '../../hooks/useEtiquetado'
import { useSessionStore } from '../../store/sessionStore'
import { useComensalStore } from '../../store/comensalStore'
import { C } from '../../theme'

function chipKey(pedidoItemId: string, comensalId: string) {
  return `${pedidoItemId}:${comensalId}`
}

function ItemCard({
  item,
  comensales,
  enProceso,
  onToggle,
}: {
  item: ItemEtiquetado
  comensales: Comensal[]
  enProceso: Set<string>
  onToggle: (comensal: Comensal) => void
}) {
  const etiquetadosIds = new Set(item.etiquetas.map((c) => c.id))

  return (
    <div style={{
      background:   'white',
      border:       `1px solid ${C.border}`,
      borderRadius: 12,
      padding:      16,
    }}>
      {/* Fila superior: nombre × cantidad + precio */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{
          fontFamily: 'Montserrat, sans-serif',
          fontWeight: 700,
          fontSize:   13,
          color:      C.text,
        }}>
          {item.nombre} ×{item.cantidad}
        </span>
        <span style={{
          fontFamily: 'Montserrat, sans-serif',
          fontWeight: 700,
          fontSize:   13,
          color:      C.text,
        }}>
          ${(item.precioUnitario * item.cantidad).toFixed(2)}
        </span>
      </div>

      {/* Chips de comensales */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {comensales.map((comensal) => {
          const activo   = etiquetadosIds.has(comensal.id)
          const cargando = enProceso.has(chipKey(item.pedidoItemId, comensal.id))
          return (
            <button
              key={comensal.id}
              onClick={() => onToggle(comensal)}
              disabled={cargando}
              style={{
                display:      'inline-flex',
                alignItems:   'center',
                padding:      '6px 12px',
                borderRadius: 999,
                border:       `1.5px solid ${activo ? C.orange : C.border}`,
                background:   activo ? C.orangeSoft : 'white',
                color:        activo ? C.orange : C.text,
                fontFamily:   'Inter, sans-serif',
                fontWeight:   600,
                fontSize:     12,
                cursor:       cargando ? 'default' : 'pointer',
                opacity:      cargando ? 0.5 : 1,
                transition:   'all .12s',
              }}
            >
              {cargando ? '…' : comensal.nombre}
            </button>
          )
        })}
      </div>

      {/* Notita de estado */}
      {item.etiquetas.length === 0 ? (
        <p style={{
          fontFamily: 'Inter, sans-serif',
          fontSize:   11,
          color:      C.gray,
          margin:     '8px 0 0',
        }}>
          Sin etiquetar todavía
        </p>
      ) : item.etiquetas.length >= 2 ? (
        <p style={{
          fontFamily: 'Inter, sans-serif',
          fontSize:   11,
          color:      C.gray,
          margin:     '8px 0 0',
        }}>
          Se divide en partes iguales entre los {item.etiquetas.length} etiquetados
        </p>
      ) : null}
    </div>
  )
}

function ComensalChip({
  comensal,
  puedoBorrar,
  confirmando,
  borrando,
  onPedirBorrar,
  onConfirmarBorrar,
  onCancelarBorrar,
}: {
  comensal: Comensal
  puedoBorrar: boolean
  confirmando: boolean
  borrando: boolean
  onPedirBorrar: () => void
  onConfirmarBorrar: () => void
  onCancelarBorrar: () => void
}) {
  if (confirmando) {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '4px 4px 4px 12px', borderRadius: 999,
        border: '1.5px solid #DC2626', background: '#FEF2F2',
      }}>
        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#DC2626' }}>
          ¿Borrar {comensal.nombre}?
        </span>
        <button
          onClick={onConfirmarBorrar}
          disabled={borrando}
          aria-label={`Confirmar borrado de ${comensal.nombre}`}
          style={{ background: 'none', border: 'none', cursor: borrando ? 'default' : 'pointer', color: '#DC2626', fontSize: 14, padding: '0 4px' }}
        >
          {borrando ? '…' : '✓'}
        </button>
        <button
          onClick={onCancelarBorrar}
          disabled={borrando}
          aria-label="Cancelar"
          style={{ background: 'none', border: 'none', cursor: borrando ? 'default' : 'pointer', color: C.gray, fontSize: 14, padding: '0 4px' }}
        >
          ✕
        </button>
      </div>
    )
  }

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: puedoBorrar ? '6px 6px 6px 12px' : '6px 12px',
      borderRadius: 999, border: `1.5px solid ${puedoBorrar ? C.orange : C.border}`,
      background: 'white',
    }}>
      <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: 12, color: puedoBorrar ? C.orange : C.text }}>
        {comensal.nombre}
      </span>
      {puedoBorrar && (
        <button
          onClick={onPedirBorrar}
          aria-label={`Borrar a ${comensal.nombre}`}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.orange, fontSize: 14, lineHeight: 1, padding: '0 2px' }}
        >
          ×
        </button>
      )}
    </div>
  )
}

export function EtiquetarPedidosPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const destino = searchParams.get('destino') === 'pagar' || searchParams.get('destino') === 'mensaje'
    ? (searchParams.get('destino') as 'pagar' | 'mensaje')
    : null

  const sesionId = useSessionStore((s) => s.sesionId)
  const comensalIdActual = useComensalStore((s) => s.comensalId)

  const {
    items, comensales, loading, error,
    etiquetar, desetiquetar, agregarComensal, borrarComensal,
  } = useEtiquetado(sesionId ?? '')
  const [enProceso, setEnProceso] = useState<Set<string>>(new Set())

  const [agregando, setAgregando] = useState(false)
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [creandoComensal, setCreandoComensal] = useState(false)
  const [errorComensales, setErrorComensales] = useState<string | null>(null)

  const [confirmandoBorrado, setConfirmandoBorrado] = useState<string | null>(null)
  const [borrandoId, setBorrandoId] = useState<string | null>(null)

  async function handleToggle(item: ItemEtiquetado, comensal: Comensal) {
    const key = chipKey(item.pedidoItemId, comensal.id)
    if (enProceso.has(key)) return

    setEnProceso((prev) => new Set(prev).add(key))
    try {
      const yaEtiquetado = item.etiquetas.some((c) => c.id === comensal.id)
      if (yaEtiquetado) {
        await desetiquetar(item.pedidoItemId, comensal.id)
      } else {
        await etiquetar(item.pedidoItemId, comensal.id)
      }
    } finally {
      setEnProceso((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }

  async function handleAgregarComensal() {
    const nombre = nombreNuevo.trim()
    if (!nombre || creandoComensal) return
    setCreandoComensal(true)
    setErrorComensales(null)
    try {
      await agregarComensal(nombre)
      setNombreNuevo('')
      setAgregando(false)
    } catch (e) {
      setErrorComensales(e instanceof Error ? e.message : 'Error al agregar el comensal')
    } finally {
      setCreandoComensal(false)
    }
  }

  async function handleConfirmarBorrar(comensalId: string) {
    if (borrandoId) return
    setBorrandoId(comensalId)
    setErrorComensales(null)
    try {
      await borrarComensal(comensalId)
      setConfirmandoBorrado(null)
    } catch (e) {
      setErrorComensales(e instanceof Error ? e.message : 'Error al borrar el comensal')
    } finally {
      setBorrandoId(null)
    }
  }

  const huerfanos = items.filter((i) => i.etiquetas.length === 0)
  const nombresHuerfanos = Array.from(new Set(huerfanos.map((i) => i.nombre)))

  function handleContinuar() {
    if (destino === 'pagar') {
      if (huerfanos.length > 0) return
      navigate('/pagar?modo=por_consumo')
    } else if (destino === 'mensaje') {
      navigate('/dividir/mensaje?modo=por_consumo')
    }
  }

  const header = (
    <header style={{
      background:  C.navy,
      display:     'flex',
      alignItems:  'center',
      padding:     '14px 16px',
      gap:         12,
      flexShrink:  0,
    }}>
      <button
        onClick={() => navigate('/menu')}
        style={{
          background: 'none',
          border:     'none',
          cursor:     'pointer',
          color:      'white',
          fontSize:   22,
          lineHeight: 1,
          padding:    '2px 8px 2px 0',
          display:    'flex',
          alignItems: 'center',
        }}
        aria-label="Volver al menú"
      >
        ←
      </button>
      <span style={{
        flex:       1,
        fontFamily: 'Montserrat, sans-serif',
        fontWeight: 700,
        fontSize:   17,
        color:      'white',
        textAlign:  'center',
      }}>
        Etiquetar pedidos
      </span>
      {/* spacer para centrar el título */}
      <div style={{ width: 38 }} />
    </header>
  )

  /* ── loading ── */
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: C.bg }}>
        <div style={{ maxWidth: 480, width: '100%', margin: '0 auto', background: 'white', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
          {header}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spinner size="md" />
          </div>
        </div>
      </div>
    )
  }

  /* ── error ── */
  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: C.bg }}>
        <div style={{ maxWidth: 480, width: '100%', margin: '0 auto', background: 'white', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
          {header}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center' }}>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, color: '#DC2626', margin: 0 }}>{error}</p>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: C.orange, color: 'white', border: 'none',
                borderRadius: 10, padding: '10px 20px',
                fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Reintentar
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ── sin ítems ── */
  if (items.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: C.bg }}>
        <div style={{ maxWidth: 480, width: '100%', margin: '0 auto', background: 'white', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
          {header}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center' }}>
            <p style={{ fontSize: 52, margin: 0 }}>🏷️</p>
            <p style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 15, color: C.text, margin: 0 }}>
              Todavía no hay pedidos para etiquetar
            </p>
            <button
              onClick={() => navigate('/menu')}
              style={{
                background: C.orange, color: 'white', border: 'none',
                borderRadius: 12, padding: '12px 24px',
                fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 14,
                cursor: 'pointer', marginTop: 8,
              }}
            >
              Ver el menú
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ── lista ── */
  const continuarDisabled = destino === 'pagar' && huerfanos.length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: C.bg }}>
      <div style={{
        maxWidth:      480,
        width:         '100%',
        margin:        '0 auto',
        background:    'white',
        minHeight:     '100vh',
        display:       'flex',
        flexDirection: 'column',
      }}>
        {header}
        <div style={{
          flex:      1,
          overflowY: 'auto',
          padding:   destino ? '12px 16px 110px' : '12px 16px 24px',
          display:   'flex',
          flexDirection: 'column',
          gap:       10,
        }}>
          <p style={{
            fontFamily: 'Inter, sans-serif',
            fontSize:   13,
            color:      C.gray,
            margin:     '0 0 4px',
            lineHeight: 1.4,
          }}>
            Etiquetá qué pediste vos para calcular tu parte de la cuenta.
          </p>

          {/* ── barra de comensales ── */}
          <div>
            <p style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 13, color: C.text, margin: '0 0 8px' }}>
              Comensales
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {comensales.map((comensal) => (
                <ComensalChip
                  key={comensal.id}
                  comensal={comensal}
                  puedoBorrar={comensal.creadoPorComensalId !== null && comensal.creadoPorComensalId === comensalIdActual}
                  confirmando={confirmandoBorrado === comensal.id}
                  borrando={borrandoId === comensal.id}
                  onPedirBorrar={() => setConfirmandoBorrado(comensal.id)}
                  onConfirmarBorrar={() => void handleConfirmarBorrar(comensal.id)}
                  onCancelarBorrar={() => setConfirmandoBorrado(null)}
                />
              ))}

              {agregando ? (
                <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <input
                    autoFocus
                    value={nombreNuevo}
                    onChange={(e) => setNombreNuevo(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void handleAgregarComensal() }}
                    maxLength={40}
                    placeholder="Nombre"
                    style={{
                      padding: '6px 10px', borderRadius: 999, border: `1.5px solid ${C.border}`,
                      fontFamily: 'Inter, sans-serif', fontSize: 12, width: 110,
                    }}
                  />
                  <button
                    onClick={() => void handleAgregarComensal()}
                    disabled={creandoComensal || !nombreNuevo.trim()}
                    style={{
                      padding: '6px 12px', borderRadius: 999, border: 'none',
                      background: C.orange, color: 'white',
                      fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 12,
                      cursor: creandoComensal ? 'default' : 'pointer',
                      opacity: creandoComensal || !nombreNuevo.trim() ? 0.6 : 1,
                    }}
                  >
                    {creandoComensal ? '…' : 'Agregar'}
                  </button>
                  <button
                    onClick={() => { setAgregando(false); setNombreNuevo(''); setErrorComensales(null) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.gray, fontFamily: 'Inter, sans-serif', fontSize: 12 }}
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAgregando(true)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', padding: '6px 12px', borderRadius: 999,
                    border: `1.5px dashed ${C.border}`, background: 'white', color: C.gray,
                    fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: 12, cursor: 'pointer',
                  }}
                >
                  + Agregar
                </button>
              )}
            </div>
            {errorComensales && (
              <p style={{
                fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#DC2626',
                background: '#FEF2F2', border: '1px solid #FECACA',
                borderRadius: 10, padding: '8px 10px', margin: '8px 0 0',
              }}>
                {errorComensales}
              </p>
            )}
          </div>

          {items.map((item) => (
            <ItemCard
              key={item.pedidoItemId}
              item={item}
              comensales={comensales}
              enProceso={enProceso}
              onToggle={(comensal) => void handleToggle(item, comensal)}
            />
          ))}
        </div>

        {destino && (
          <div style={{
            position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
            width: '100%', maxWidth: 480, background: 'white',
            borderTop: `1px solid ${C.border}`, padding: '14px 16px 24px',
            boxShadow: '0 -4px 20px rgba(0,0,0,0.08)',
          }}>
            {continuarDisabled && (
              <p style={{
                fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#DC2626',
                background: '#FEF2F2', border: '1px solid #FECACA',
                borderRadius: 10, padding: '8px 10px', margin: '0 0 10px', textAlign: 'center',
              }}>
                Faltan etiquetar: {nombresHuerfanos.join(', ')}
              </p>
            )}
            <button
              onClick={handleContinuar}
              disabled={continuarDisabled}
              style={{
                width: '100%', padding: '14px 16px',
                background: C.orange, color: 'white', border: 'none',
                borderRadius: 14, fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 15,
                cursor: continuarDisabled ? 'not-allowed' : 'pointer',
                opacity: continuarDisabled ? 0.5 : 1,
              }}
            >
              Continuar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
