import type { TurnoDelHistorial } from '@menyu/types'
import { formatearFechaHoraCompleta } from '@menyu/ui/caja'
import { C, tituloSeccion } from '../marca/estilos'
import { pastillaExito, pastillaNeutra } from '../cajas/estilos'

type DatosDelEncabezado = Pick<TurnoDelHistorial, 'abiertoEn' | 'abiertoPor' | 'cerradoEn' | 'cerradoPor'>

/**
 * El encabezado de un turno, en la lista y en el detalle: el título "Turno del …" (con `tituloId`, para nombrar la
 * tarjeta o la página), quién lo abrió y, si está cerrado, quién lo cerró; el badge "Abierto" o "Cerrado".
 */
export function EncabezadoDeTurno({ turno, tituloId }: { turno: DatosDelEncabezado; tituloId: string }) {
  const apertura = formatearFechaHoraCompleta(turno.abiertoEn)
  return (
    <header className="flex flex-wrap items-start justify-between gap-2">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontFamily: 'Inter, sans-serif', fontSize: 13, color: C.sub }}>
        <h2 id={tituloId} style={tituloSeccion}>Turno del {apertura}</h2>
        <p style={{ margin: 0 }}>Abierto el {apertura} por {turno.abiertoPor.nombre}</p>
        {turno.cerradoEn !== null && (
          <p style={{ margin: 0 }}>
            Cerrado el {formatearFechaHoraCompleta(turno.cerradoEn)}
            {turno.cerradoPor && ` por ${turno.cerradoPor.nombre}`}
          </p>
        )}
      </div>
      {turno.cerradoEn === null ? <span style={pastillaExito}>Abierto</span> : <span style={pastillaNeutra}>Cerrado</span>}
    </header>
  )
}
