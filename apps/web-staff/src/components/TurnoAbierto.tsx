import { useState } from 'react'
import type { PreparacionDeTurno, TurnoDeCaja } from '@menyu/types'
import { api, ApiError } from '../services/api'
import { AsignacionDeMesas } from './AsignacionDeMesas'
import { formatearFechaHora, formatearMonto } from '../utils/formato'
import { ordenarMesas } from '../utils/mesas'
import {
  asignacionesAEnviar,
  asignacionesIniciales,
  asignacionesQueNoSiguen,
  textoDeAsignacionQueNoSigue,
  type ValoresDeAsignacion,
} from '../utils/asignaciones'

/** El 409 de PUT /turnos/:id/asignaciones con el turno cerrado: apps/backend/src/caja/conflictos.ts (MENSAJE_TURNO_CERRADO). */
export const MENSAJE_TURNO_CERRADO = 'El turno está cerrado'

const C = {
  orange:   '#E8563A',
  orangeBg: '#FDF0ED',
  navy:     '#2D3561',
  white:    '#FFFFFF',
  border:   '#E6E8EF',
  textMut:  '#6B7280',
  green:    '#1F9D57',
  greenBg:  '#E8F6EE',
  red:      '#dc2626',
} as const

type Reasignacion =
  | { estado: 'cerrada' }
  | { estado: 'cargando' }
  | { estado: 'error'; mensaje: string }
  | { estado: 'editando'; preparacion: PreparacionDeTurno; valores: ValoresDeAsignacion; guardando: boolean; error: string | null }

interface TurnoAbiertoProps {
  turno: TurnoDeCaja
  restauranteId: string
  /** El turno que devolvió PUT /turnos/:id/asignaciones. */
  onReasignado: (turno: TurnoDeCaja) => void
  /** El turno se cerró mientras se editaba: la pantalla vuelve a leer el turno actual y muestra `mensaje`. */
  onTurnoCambio: (mensaje: string) => void
}

const mensajeDe = (e: unknown, porDefecto: string) => (e instanceof Error && e.message ? e.message : porDefecto)

const estiloTitulo = { fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 14, color: C.navy, margin: 0 } as const
const estiloTexto = { fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.navy, margin: 0 } as const
const estiloBoton = (principal: boolean, deshabilitado = false) => ({
  padding: '8px 16px', borderRadius: 8, fontFamily: 'Inter,sans-serif', fontSize: 13, fontWeight: 600,
  border: principal ? 'none' : `1px solid ${C.border}`,
  background: principal ? C.orange : C.white,
  color: principal ? C.white : C.navy,
  cursor: deshabilitado ? 'not-allowed' : 'pointer',
  opacity: deshabilitado ? 0.6 : 1,
})

/**
 * El turno abierto del restaurante (#359): desde cuándo y quién lo abrió, sus cajas con el fondo, las observaciones y
 * las mesas por mozo. "Reasignar mesas" pide la preparación cada vez (los mozos y las mesas pueden haber cambiado) y
 * arranca desde las asignaciones actuales del turno, no desde la precarga. Cerrar el turno llega con el PR 3.
 */
export function TurnoAbierto({ turno, restauranteId, onReasignado, onTurnoCambio }: TurnoAbiertoProps) {
  const [reasignacion, setReasignacion] = useState<Reasignacion>({ estado: 'cerrada' })

  async function abrirEditor() {
    setReasignacion({ estado: 'cargando' })
    try {
      const preparacion = await api.turnos.preparacion(restauranteId)
      setReasignacion({
        estado: 'editando',
        preparacion,
        valores: asignacionesIniciales(preparacion.mesas, preparacion.mozos, turno.asignaciones),
        guardando: false,
        error: null,
      })
    } catch (e) {
      setReasignacion({ estado: 'error', mensaje: mensajeDe(e, 'No se pudieron cargar las mesas y los mozos') })
    }
  }

  async function guardar(edicion: Extract<Reasignacion, { estado: 'editando' }>) {
    setReasignacion({ ...edicion, guardando: true, error: null })
    try {
      const { turno: actualizado } = await api.turnos.reasignar(turno.id, asignacionesAEnviar(edicion.valores))
      setReasignacion({ estado: 'cerrada' })
      onReasignado(actualizado)
    } catch (e) {
      const mensaje = mensajeDe(e, 'No se pudieron guardar las mesas')
      if (e instanceof ApiError && e.status === 409 && mensaje === MENSAJE_TURNO_CERRADO) {
        onTurnoCambio(mensaje)
        return
      }
      setReasignacion({ ...edicion, guardando: false, error: mensaje })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <section
        aria-label="Turno abierto"
        style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <span style={{
          alignSelf: 'flex-start', background: C.greenBg, color: C.green, borderRadius: 20, padding: '3px 10px',
          fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 12,
        }}>
          Turno abierto
        </span>
        <p style={{ ...estiloTexto, color: C.textMut }}>
          Desde {formatearFechaHora(turno.abiertoEn)} · abrió {turno.abiertoPor.nombre}
        </p>

        <ul aria-label="Cajas del turno" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {turno.cajas.map((caja) => (
            <li key={caja.id} style={{ ...estiloTexto, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 12px' }}>
              <strong>{caja.nombre}</strong> · fondo {formatearMonto(caja.fondoInicial)}
            </li>
          ))}
        </ul>

        {turno.observaciones && (
          <p style={{ ...estiloTexto, color: C.textMut }}>Observaciones: {turno.observaciones}</p>
        )}
      </section>

      <section
        aria-labelledby="mesas-por-mozo"
        style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <h2 id="mesas-por-mozo" style={estiloTitulo}>Mesas por mozo</h2>
          {(reasignacion.estado === 'cerrada' || reasignacion.estado === 'error') && (
            <button type="button" onClick={() => void abrirEditor()} style={estiloBoton(false)}>Reasignar mesas</button>
          )}
        </div>

        {reasignacion.estado === 'cargando' && (
          <p role="status" style={{ ...estiloTexto, color: C.textMut }}>Cargando las mesas y los mozos…</p>
        )}

        {reasignacion.estado === 'error' && (
          <p role="alert" style={{ ...estiloTexto, color: C.red }}>{reasignacion.mensaje}</p>
        )}

        {reasignacion.estado === 'editando' ? (
          <EditorDeReasignacion
            turno={turno}
            reasignacion={reasignacion}
            onChange={(valores) => setReasignacion({ ...reasignacion, valores })}
            onGuardar={() => void guardar(reasignacion)}
            onCancelar={() => setReasignacion({ estado: 'cerrada' })}
          />
        ) : turno.asignaciones.length === 0 ? (
          <p style={{ ...estiloTexto, color: C.textMut }}>Sin mesas asignadas: los mozos ven todas las mesas.</p>
        ) : (
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th scope="col" style={estiloCelda(true)}>Mesa</th>
                <th scope="col" style={estiloCelda(true)}>Mozo</th>
              </tr>
            </thead>
            <tbody>
              {ordenarMesas(turno.asignaciones.map((a) => ({ ...a, numero: a.mesaNumero }))).map((a) => (
                <tr key={a.mesaId}>
                  <td style={estiloCelda(false)}>{a.mesaNumero}</td>
                  <td style={estiloCelda(false)}>{a.mozoNombre}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

function EditorDeReasignacion({
  turno,
  reasignacion,
  onChange,
  onGuardar,
  onCancelar,
}: {
  turno: TurnoDeCaja
  reasignacion: Extract<Reasignacion, { estado: 'editando' }>
  onChange: (valores: ValoresDeAsignacion) => void
  onGuardar: () => void
  onCancelar: () => void
}) {
  const { preparacion, valores, guardando, error } = reasignacion
  const queNoSiguen = asignacionesQueNoSiguen(turno.asignaciones, preparacion.mesas, preparacion.mozos)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {queNoSiguen.length > 0 && (
        <ul
          aria-label="Asignaciones que no siguen"
          style={{
            margin: 0, padding: '10px 14px 10px 30px', background: C.orangeBg, border: `1px solid ${C.orange}`,
            borderRadius: 10, fontFamily: 'Inter,sans-serif', fontSize: 12.5, color: C.navy,
          }}
        >
          {queNoSiguen.map((a) => <li key={a.mesaId}>{textoDeAsignacionQueNoSigue(a)}</li>)}
        </ul>
      )}
      <AsignacionDeMesas
        mesas={preparacion.mesas}
        mozos={preparacion.mozos}
        valores={valores}
        onChange={onChange}
        deshabilitado={guardando}
      />
      {error && <p role="alert" style={{ ...estiloTexto, color: C.red }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={onGuardar} disabled={guardando} style={estiloBoton(true, guardando)}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" onClick={onCancelar} disabled={guardando} style={estiloBoton(false, guardando)}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

const estiloCelda = (encabezado: boolean) => ({
  textAlign: 'left' as const, padding: '6px 8px', borderBottom: `1px solid ${C.border}`,
  fontFamily: encabezado ? 'Montserrat,sans-serif' : 'Inter,sans-serif',
  fontWeight: encabezado ? 700 : 400, fontSize: encabezado ? 12 : 13,
  color: encabezado ? C.textMut : C.navy,
})
