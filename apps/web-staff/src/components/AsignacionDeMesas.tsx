import { useId } from 'react'
import type { AvisoDePrecarga, PreparacionDeTurno } from '@menyu/types'
import { ordenarMesas } from '@menyu/ui/caja'
import { textoDelAviso, type ValoresDeAsignacion } from '../utils/asignaciones'

const C = {
  navy:     '#2D3561',
  white:    '#FFFFFF',
  border:   '#E6E8EF',
  textMut:  '#6B7280',
  orange:   '#E8563A',
  orangeBg: '#FDF0ED',
} as const

interface AsignacionDeMesasProps {
  mesas: PreparacionDeTurno['mesas']
  mozos: PreparacionDeTurno['mozos']
  /** El mozo de cada mesa, o `''` sin asignar. Se arma con `asignacionesIniciales`. */
  valores: ValoresDeAsignacion
  onChange: (valores: ValoresDeAsignacion) => void
  /** Por qué la precarga dejó mesas sin asignar. Solo al abrir el turno. */
  avisos?: AvisoDePrecarga[]
  deshabilitado?: boolean
}

/**
 * El editor de las mesas por mozo (#359): una fila por mesa, en orden natural, con el mozo que la atiende. Lo usan la
 * apertura del turno y la reasignación. No pide nada a la API: las mesas, los mozos y el valor inicial vienen por props.
 */
export function AsignacionDeMesas({ mesas, mozos, valores, onChange, avisos = [], deshabilitado }: AsignacionDeMesasProps) {
  const idAyuda = useId()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p id={idAyuda} style={{ fontFamily: 'Inter,sans-serif', fontSize: 12.5, color: C.textMut, margin: 0 }}>
        Con el turno abierto, cada mozo ve sus mesas y las que no tienen mozo asignado.
      </p>

      {avisos.length > 0 && (
        <ul
          aria-label="Avisos de la precarga"
          style={{
            margin: 0, padding: '10px 14px 10px 30px', background: C.orangeBg, border: `1px solid ${C.orange}`,
            borderRadius: 10, fontFamily: 'Inter,sans-serif', fontSize: 12.5, color: C.navy,
          }}
        >
          {avisos.map((aviso) => <li key={aviso.mesaId}>{textoDelAviso(aviso)}</li>)}
        </ul>
      )}

      {mesas.length === 0 ? (
        <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.textMut, margin: 0 }}>
          No hay mesas activas en este restaurante.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ordenarMesas(mesas).map((mesa) => {
            const idSelect = `${idAyuda}-mesa-${mesa.id}`
            return (
              <div
                key={mesa.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
                  background: C.white, border: `1px solid ${C.border}`, borderRadius: 8,
                }}
              >
                <label
                  htmlFor={idSelect}
                  style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13, color: C.navy, minWidth: 80 }}
                >
                  Mesa {mesa.numero}
                </label>
                <select
                  id={idSelect}
                  aria-label={`Mozo de la mesa ${mesa.numero}`}
                  aria-describedby={idAyuda}
                  value={valores[mesa.id] ?? ''}
                  disabled={deshabilitado}
                  onChange={(e) => onChange({ ...valores, [mesa.id]: e.target.value })}
                  style={{
                    flex: 1, padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.border}`,
                    fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.navy, background: C.white,
                  }}
                >
                  <option value="">Sin asignar</option>
                  {mozos.map((mozo) => <option key={mozo.id} value={mozo.id}>{mozo.nombre}</option>)}
                </select>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
