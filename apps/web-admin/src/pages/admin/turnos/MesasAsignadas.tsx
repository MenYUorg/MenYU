import type { AsignacionDelTurno } from '@menyu/types'
import { Seccion } from './Seccion'
import { mesasPorMozo } from './historial'

/** Las mesas asignadas en el turno, por mozo (por nombre) y en orden natural. Sin asignaciones, las ven todos. */
export function MesasAsignadas({ asignaciones }: { asignaciones: AsignacionDelTurno[] }) {
  const grupos = mesasPorMozo(asignaciones)
  return (
    <Seccion titulo="Mesas asignadas">
      {grupos.length === 0 ? (
        <p className="text-sm text-gray-500">Sin mesas asignadas: todas las ven todos los mozos.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm text-gray-700">
          {grupos.map((grupo) => (
            <li key={grupo.mozoId}>
              <span className="font-medium text-gray-900">{grupo.mozoNombre}</span>
              {`: ${grupo.mesas.length === 1 ? 'mesa' : 'mesas'} ${grupo.mesas.join(', ')}`}
            </li>
          ))}
        </ul>
      )}
    </Seccion>
  )
}
