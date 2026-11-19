import { useId } from 'react'
import { Link } from 'react-router-dom'
import type { CajaDelHistorial, TurnoDelHistorial } from '@menyu/types'
import { formatearFechaHoraCompleta } from '@menyu/ui/caja'
import { EncabezadoDeTurno } from './EncabezadoDeTurno'
import { NombreYFondo } from './NombreYFondo'
import { ObservacionesDelTurno } from './ObservacionesDelTurno'
import { SinArqueo } from './SinArqueo'
import { diferenciasDelArqueo, textoDeMovimientos } from './historial'

/**
 * Un turno del historial: quién lo abrió y lo cerró, y sus cajas en el orden de la API. Arqueo ciego, como en
 * web-staff: con el turno abierto no se muestran el arqueo ni los totales de los movimientos.
 */
export function TarjetaDeTurno({ turno }: { turno: TurnoDelHistorial }) {
  const titulo = useId()
  const cerrado = turno.cerradoEn !== null
  return (
    <li>
      <article aria-labelledby={titulo} className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-3">
        <EncabezadoDeTurno turno={turno} tituloId={titulo} />
        <ObservacionesDelTurno observaciones={turno.observaciones} />

        <ul aria-label="Cajas del turno" className="flex flex-col gap-2">
          {turno.cajas.map((caja) => <CajaDelTurno key={caja.id} caja={caja} cerrado={cerrado} />)}
        </ul>

        <Link
          to={`/admin/turnos/${encodeURIComponent(turno.id)}`}
          aria-label={`Ver detalle del turno del ${formatearFechaHoraCompleta(turno.abiertoEn)}`}
          className="self-start text-sm font-medium text-indigo-600 hover:underline"
        >
          Ver detalle
        </Link>
      </article>
    </li>
  )
}

function CajaDelTurno({ caja, cerrado }: { caja: CajaDelHistorial; cerrado: boolean }) {
  return (
    <li className="border border-gray-100 rounded-md px-3 py-2 text-sm text-gray-700 flex flex-col gap-1">
      <NombreYFondo nombre={caja.nombre} fondoInicial={caja.fondoInicial} />
      {cerrado ? (
        <>
          <ArqueoDeLaCaja caja={caja} />
          <p>{textoDeMovimientos(caja.movimientos)}</p>
        </>
      ) : (
        <p className="text-gray-500">El arqueo se ve cuando el turno se cierra</p>
      )}
    </li>
  )
}

function ArqueoDeLaCaja({ caja }: { caja: CajaDelHistorial }) {
  if (caja.arqueo === null) return <SinArqueo />
  const diferencias = diferenciasDelArqueo(caja.arqueo)
  if (diferencias.length === 0) return <p>Sin diferencias</p>
  return (
    <ul aria-label={`Diferencias del arqueo de ${caja.nombre}`} className="flex flex-col">
      {diferencias.map((texto) => <li key={texto}>{texto}</li>)}
    </ul>
  )
}
