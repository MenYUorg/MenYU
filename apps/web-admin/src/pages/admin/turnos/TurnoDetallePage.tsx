import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import type { TurnoDetalle } from '@menyu/types'
import { useContextStore } from '../../../store/contextStore'
import { api, ApiError } from '../../../services/api'
import { volver } from '../cajas/estilos'
import { Cargando } from './Cargando'
import { DetalleDelTurno } from './DetalleDelTurno'
import { AlertaDeError, ErrorConReintentar } from './ErrorConReintentar'
import { mensajeDeError } from './historial'
import type { LecturaDelResumen } from './ResumenDeCobros'

/** El turno leído, o el error de leerlo. `sinAcceso`: un 404 o un 403, que no se reintentan. */
type LecturaDelDetalle =
  | { id: string; estado: 'listo'; turno: TurnoDetalle }
  | { id: string; estado: 'error'; mensaje: string; sinAcceso: boolean }

const LISTA = '/admin/turnos'

function VolverALaLista() {
  return (
    <Link to={LISTA} style={volver}>
      <ArrowLeft size={14} aria-hidden="true" />Volver a turnos de caja
    </Link>
  )
}

/**
 * El detalle de un turno de caja (#360), de solo lectura. Lee GET /turnos/:id y, solo si el turno está cerrado,
 * después GET /turnos/:id/resumen: con el turno abierto no se pide (arqueo ciego). Las dos lecturas son independientes,
 * cada una con su contador contra las respuestas viejas. Si cambia el restaurante elegido, vuelve a la lista.
 */
export function TurnoDetallePage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { selectedRestauranteId } = useContextStore()
  const [detalle, setDetalle] = useState<LecturaDelDetalle | null>(null)
  const [resumen, setResumen] = useState<(LecturaDelResumen & { id: string }) | null>(null)
  const ultimoDetalle = useRef(0)
  const ultimoResumen = useRef(0)

  // Un turno es de un restaurante: si se elige otro, el detalle no vale. Al hidratarse (de nada a un restaurante) no.
  const restauranteAnterior = useRef(selectedRestauranteId)
  useEffect(() => {
    const anterior = restauranteAnterior.current
    restauranteAnterior.current = selectedRestauranteId
    if (anterior && selectedRestauranteId && anterior !== selectedRestauranteId) navigate(LISTA, { replace: true })
  }, [selectedRestauranteId, navigate])

  const leerResumen = useCallback(async () => {
    const pedido = ++ultimoResumen.current
    let nueva: LecturaDelResumen & { id: string }
    try {
      nueva = { id, estado: 'listo', resumen: await api.turnos.resumen(id) }
    } catch (e) {
      nueva = { id, estado: 'error', mensaje: mensajeDeError(e, 'No se pudo leer el resumen de cobros') }
    }
    if (pedido === ultimoResumen.current) setResumen(nueva)
  }, [id])

  const leerDetalle = useCallback(async () => {
    const pedido = ++ultimoDetalle.current
    let nueva: LecturaDelDetalle
    try {
      nueva = { id, estado: 'listo', turno: await api.turnos.detalle(id) }
    } catch (e) {
      const sinAcceso = e instanceof ApiError && (e.status === 404 || e.status === 403)
      nueva = { id, estado: 'error', mensaje: mensajeDeError(e, 'No se pudo leer el turno'), sinAcceso }
    }
    if (pedido !== ultimoDetalle.current) return
    setDetalle(nueva)
    if (nueva.estado === 'listo' && nueva.turno.cerradoEn !== null) void leerResumen()
  }, [id, leerResumen])

  useEffect(() => { void leerDetalle() }, [leerDetalle])

  const reintentarDetalle = () => {
    setDetalle(null)
    void leerDetalle()
  }
  const reintentarResumen = () => {
    setResumen(null)
    void leerResumen()
  }

  // Lo leído de otro turno no vale: hasta que llegue la lectura de este, se está cargando.
  const actual = detalle?.id === id ? detalle : null
  return (
    <div className="mx-auto w-full max-w-4xl p-4 md:p-6 flex flex-col gap-4">
      <VolverALaLista />
      {actual === null && <Cargando etiqueta="Cargando el turno" />}
      {actual?.estado === 'error' && (actual.sinAcceso ? (
        <AlertaDeError mensaje={actual.mensaje}><VolverALaLista /></AlertaDeError>
      ) : (
        <ErrorConReintentar mensaje={actual.mensaje} onReintentar={reintentarDetalle} />
      ))}
      {actual?.estado === 'listo' && (
        <DetalleDelTurno turno={actual.turno} resumen={resumen?.id === id ? resumen : null} onReintentarResumen={reintentarResumen} />
      )}
    </div>
  )
}
