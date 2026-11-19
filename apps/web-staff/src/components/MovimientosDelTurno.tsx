import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { MovimientoDeCaja, TurnoCajaApi, TurnoDeCaja, TurnoDetalle } from '@menyu/types'
import { api } from '../services/api'
import { FormularioDeMovimiento } from './FormularioDeMovimiento'
import { formatearFechaHora, formatearMonto } from '@menyu/ui/caja'

const C = {
  navy:    '#2D3561',
  white:   '#FFFFFF',
  border:  '#E6E8EF',
  textMut: '#6B7280',
  green:   '#1F9D57',
  red:     '#dc2626',
} as const

type Lista =
  | { estado: 'cargando' }
  | { estado: 'error'; mensaje: string }
  | { estado: 'listo'; detalle: TurnoDetalle }

interface MovimientosDelTurnoProps {
  turno: TurnoDeCaja
  /** El turno se cerró mientras se registraba: la pantalla vuelve a leer el turno actual y muestra `mensaje`. */
  onTurnoCambio: (mensaje: string) => void
}

const estiloTexto = { fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.navy, margin: 0 } as const

/**
 * Los ingresos y egresos de efectivo de las cajas del turno abierto (#359): la lista y el formulario para registrar uno.
 * Arqueo ciego: no muestra saldos, esperados ni sumas. La lista sale de GET /turnos/:id y se vuelve a leer al montar,
 * después de registrar y después de un registro sin respuesta; "Actualizar" de la pantalla desmonta el turno, así que
 * también la vuelve a leer. Mientras se relee, la lista anterior sigue a la vista. Una lectura vieja que llega tarde no
 * pisa a la nueva.
 */
export function MovimientosDelTurno({ turno, onTurnoCambio }: MovimientosDelTurnoProps) {
  const id = useId()
  const [lista, setLista] = useState<Lista>({ estado: 'cargando' })
  const ultimaLectura = useRef(0)
  const turnoId = turno.id

  const leer = useCallback(async () => {
    const lectura = ++ultimaLectura.current
    // Con una lista ya leída, sigue a la vista mientras se relee: "Cargando…" es solo para cuando no hay ninguna.
    setLista((actual) => (actual.estado === 'listo' ? actual : { estado: 'cargando' }))
    try {
      const detalle = await api.turnos.detalle(turnoId)
      if (lectura === ultimaLectura.current) setLista({ estado: 'listo', detalle })
    } catch (e) {
      if (lectura === ultimaLectura.current) {
        setLista({ estado: 'error', mensaje: e instanceof Error && e.message ? e.message : 'No se pudieron leer los movimientos' })
      }
    }
  }, [turnoId])

  useEffect(() => { void leer() }, [leer])

  return (
    <section
      aria-labelledby={`${id}-titulo`}
      style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      <h2 id={`${id}-titulo`} style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 14, color: C.navy, margin: 0 }}>
        Movimientos de caja
      </h2>
      <ListaDeMovimientos lista={lista} cajas={turno.cajas} onReintentar={() => void leer()} />
      <FormularioDeMovimiento
        turnoId={turnoId}
        cajas={turno.cajas}
        onReleer={() => void leer()}
        onTurnoCambio={onTurnoCambio}
      />
    </section>
  )
}

function ListaDeMovimientos({ lista, cajas, onReintentar }: { lista: Lista; cajas: TurnoCajaApi[]; onReintentar: () => void }) {
  if (lista.estado === 'cargando') {
    return <p role="status" style={{ ...estiloTexto, color: C.textMut }}>Cargando los movimientos…</p>
  }

  if (lista.estado === 'error') {
    return (
      <div role="alert" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
        <p style={{ ...estiloTexto, color: C.red }}>{lista.mensaje}</p>
        <button
          type="button"
          onClick={onReintentar}
          style={{
            padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.white,
            fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.navy, cursor: 'pointer',
          }}
        >
          Reintentar
        </button>
      </div>
    )
  }

  // En el orden de las cajas del turno; cada caja con sus movimientos tal como los da la API.
  const grupos = cajas.map((caja) => ({
    caja,
    movimientos: lista.detalle.cajas.find((c) => c.cajaId === caja.cajaId)?.movimientos ?? [],
  }))
  if (grupos.every((g) => g.movimientos.length === 0)) {
    return <p style={{ ...estiloTexto, color: C.textMut }}>Todavía no hay movimientos en este turno.</p>
  }

  const conSubtitulo = cajas.length > 1
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {grupos.map(({ caja, movimientos }) => (
        <div key={caja.cajaId} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {conSubtitulo && (
            <h3 style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13, color: C.navy, margin: 0 }}>{caja.nombre}</h3>
          )}
          {movimientos.length === 0 ? (
            <p style={{ ...estiloTexto, color: C.textMut }}>Sin movimientos en esta caja.</p>
          ) : (
            <ul aria-label={`Movimientos de ${caja.nombre}`} style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {movimientos.map((m) => <FilaDeMovimiento key={m.id} movimiento={m} />)}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}

function FilaDeMovimiento({ movimiento: m }: { movimiento: MovimientoDeCaja }) {
  const ingreso = m.tipo === 'INGRESO'
  return (
    <li style={{ ...estiloTexto, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px' }}>
      <span style={{ color: C.textMut }}>{formatearFechaHora(m.createdAt)}</span>
      {' · '}
      <strong style={{ color: ingreso ? C.green : C.red }}>{ingreso ? 'Ingreso' : 'Egreso'}</strong>
      {' · '}
      <strong>{formatearMonto(m.monto)}</strong>
      {' · '}
      {m.motivo}
      {' · '}
      <span style={{ color: C.textMut }}>cargó {m.usuario.nombre}</span>
    </li>
  )
}
