import type { AsignacionDelTurno } from '@menyu/types'
import { C, textoAyuda } from '../marca/estilos'
import { Seccion } from './Seccion'
import { mesasPorMozo } from './historial'

/** Las mesas asignadas en el turno, por mozo (por nombre) y en orden natural. Sin asignaciones, las ven todos. */
export function MesasAsignadas({ asignaciones }: { asignaciones: AsignacionDelTurno[] }) {
  const grupos = mesasPorMozo(asignaciones)
  return (
    <Seccion titulo="Mesas asignadas">
      {grupos.length === 0 ? (
        <p style={{ ...textoAyuda, fontSize: 13 }}>Sin mesas asignadas: todas las ven todos los mozos.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#374151' }}>
          {grupos.map((grupo) => (
            <li key={grupo.mozoId}>
              <span style={{ fontWeight: 600, color: C.text }}>{grupo.mozoNombre}</span>
              {`: ${grupo.mesas.length === 1 ? 'mesa' : 'mesas'} ${grupo.mesas.join(', ')}`}
            </li>
          ))}
        </ul>
      )}
    </Seccion>
  )
}
