import { useId } from 'react'
import { Link } from 'react-router-dom'
import type { CajaDelHistorial, TurnoDelHistorial } from '@menyu/types'
import { formatearFechaHoraCompleta } from '@menyu/ui/caja'
import { ChevronRight } from 'lucide-react'
import { C } from '../marca/estilos'
import { bloqueInterno, enlace, tarjetaDeLista } from '../cajas/estilos'
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
      <article aria-labelledby={titulo} style={{ ...tarjetaDeLista, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <EncabezadoDeTurno turno={turno} tituloId={titulo} />
        <ObservacionesDelTurno observaciones={turno.observaciones} />

        <ul aria-label="Cajas del turno" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {turno.cajas.map((caja) => <CajaDelTurno key={caja.id} caja={caja} cerrado={cerrado} />)}
        </ul>

        <Link
          to={`/admin/turnos/${encodeURIComponent(turno.id)}`}
          aria-label={`Ver detalle del turno del ${formatearFechaHoraCompleta(turno.abiertoEn)}`}
          style={enlace}
        >
          Ver detalle
          <ChevronRight size={14} aria-hidden="true" />
        </Link>
      </article>
    </li>
  )
}

function CajaDelTurno({ caja, cerrado }: { caja: CajaDelHistorial; cerrado: boolean }) {
  return (
    <li style={{ ...bloqueInterno, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <NombreYFondo nombre={caja.nombre} fondoInicial={caja.fondoInicial} />
      {cerrado ? (
        <>
          <ArqueoDeLaCaja caja={caja} />
          <p style={{ margin: 0 }}>{textoDeMovimientos(caja.movimientos)}</p>
        </>
      ) : (
        <p style={{ color: C.sub, margin: 0 }}>El arqueo se ve cuando el turno se cierra</p>
      )}
    </li>
  )
}

function ArqueoDeLaCaja({ caja }: { caja: CajaDelHistorial }) {
  if (caja.arqueo === null) return <SinArqueo />
  const diferencias = diferenciasDelArqueo(caja.arqueo)
  if (diferencias.length === 0) return <p style={{ margin: 0 }}>Sin diferencias</p>
  return (
    <ul aria-label={`Diferencias del arqueo de ${caja.nombre}`} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
      {diferencias.map((texto) => <li key={texto}>{texto}</li>)}
    </ul>
  )
}
