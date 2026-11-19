import type { TurnoDelHistorial } from '@menyu/types'
import { Badge } from '@menyu/ui'
import { formatearFechaHoraCompleta } from '@menyu/ui/caja'

type DatosDelEncabezado = Pick<TurnoDelHistorial, 'abiertoEn' | 'abiertoPor' | 'cerradoEn' | 'cerradoPor'>

/**
 * El encabezado de un turno, en la lista y en el detalle: el título "Turno del …" (con `tituloId`, para nombrar la
 * tarjeta o la página), quién lo abrió y, si está cerrado, quién lo cerró; el badge "Abierto" o "Cerrado".
 */
export function EncabezadoDeTurno({ turno, tituloId }: { turno: DatosDelEncabezado; tituloId: string }) {
  const apertura = formatearFechaHoraCompleta(turno.abiertoEn)
  return (
    <header className="flex flex-wrap items-start justify-between gap-2">
      <div className="flex flex-col gap-0.5 text-sm text-gray-600">
        <h2 id={tituloId} className="text-base font-semibold text-gray-900">Turno del {apertura}</h2>
        <p>Abierto el {apertura} por {turno.abiertoPor.nombre}</p>
        {turno.cerradoEn !== null && (
          <p>
            Cerrado el {formatearFechaHoraCompleta(turno.cerradoEn)}
            {turno.cerradoPor && ` por ${turno.cerradoPor.nombre}`}
          </p>
        )}
      </div>
      {turno.cerradoEn === null ? <Badge variant="success">Abierto</Badge> : <Badge>Cerrado</Badge>}
    </header>
  )
}
