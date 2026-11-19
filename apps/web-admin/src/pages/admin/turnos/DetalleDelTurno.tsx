import { useId } from 'react'
import type { TurnoDetalle } from '@menyu/types'
import { CajaDelDetalle } from './CajaDelDetalle'
import { EncabezadoDeTurno } from './EncabezadoDeTurno'
import { MesasAsignadas } from './MesasAsignadas'
import { ObservacionesDelTurno } from './ObservacionesDelTurno'
import { ResumenDeCobros, type LecturaDelResumen } from './ResumenDeCobros'
import { Seccion } from './Seccion'

/**
 * Un turno entero: el encabezado, las observaciones, las cajas en el orden de la API, el resumen de cobros y las mesas
 * asignadas. Arqueo ciego: con el turno abierto no hay arqueo, ni totales de movimientos, ni resumen.
 */
export function DetalleDelTurno({ turno, resumen, onReintentarResumen }: {
  turno: TurnoDetalle
  resumen: LecturaDelResumen | null
  onReintentarResumen: () => void
}) {
  const titulo = useId()
  const cerrado = turno.cerradoEn !== null
  return (
    <article aria-labelledby={titulo} className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-4">
      <EncabezadoDeTurno turno={turno} tituloId={titulo} />
      <ObservacionesDelTurno observaciones={turno.observaciones} />
      {!cerrado && <p className="text-sm text-gray-500">El arqueo y el resumen de cobros se ven cuando el turno se cierra</p>}

      <Seccion titulo="Cajas">
        {turno.cajas.map((caja) => <CajaDelDetalle key={caja.id} caja={caja} cerrado={cerrado} />)}
      </Seccion>
      {cerrado && <ResumenDeCobros lectura={resumen} onReintentar={onReintentarResumen} />}
      <MesasAsignadas asignaciones={turno.asignaciones} />
    </article>
  )
}
