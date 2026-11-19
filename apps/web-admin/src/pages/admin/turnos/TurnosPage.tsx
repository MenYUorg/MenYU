import { useCallback, useEffect, useRef, useState } from 'react'
import type { TurnoDelHistorial } from '@menyu/types'
import { Button } from '@menyu/ui'
import { useContextStore } from '../../../store/contextStore'
import { api } from '../../../services/api'
import { Cargando } from './Cargando'
import { ErrorConReintentar } from './ErrorConReintentar'
import { mensajeDeError } from './historial'
import { TarjetaDeTurno } from './TarjetaDeTurno'

/** "Cargar más": quieto, pidiendo la página siguiente o con el error de pedirla. */
type MasTurnos = { estado: 'quieto' } | { estado: 'cargando' } | { estado: 'error'; mensaje: string }

/** Lo leído de un restaurante: los turnos cargados y el cursor de la página siguiente, o el error de leer la primera. */
type Lectura =
  | { restauranteId: string; estado: 'listo'; turnos: TurnoDelHistorial[]; siguiente: string | null; mas: MasTurnos }
  | { restauranteId: string; estado: 'error'; mensaje: string }

/**
 * El historial de turnos de caja del restaurante (#360), de solo lectura: del más nuevo al más viejo, de a 30. Se lee
 * al entrar, al cambiar de restaurante y con "Actualizar", que descarta lo cargado; sin polling. "Cargar más" agrega la
 * página siguiente. OWNER y GERENTE.
 */
export function TurnosPage() {
  const { selectedRestauranteId } = useContextStore()
  const [lectura, setLectura] = useState<Lectura | null>(null)
  // Cada lectura de la primera página invalida lo que esté en vuelo: una respuesta vieja, de otro restaurante o de un
  // "Cargar más" anterior a "Actualizar", no pisa a la nueva.
  const ultimaLectura = useRef(0)

  const leer = useCallback(async () => {
    const pedido = ++ultimaLectura.current
    if (!selectedRestauranteId) return
    let nueva: Lectura
    try {
      const pagina = await api.turnos.listar(selectedRestauranteId)
      nueva = { restauranteId: selectedRestauranteId, estado: 'listo', turnos: pagina.items, siguiente: pagina.siguiente, mas: { estado: 'quieto' } }
    } catch (e) {
      nueva = { restauranteId: selectedRestauranteId, estado: 'error', mensaje: mensajeDeError(e, 'No se pudieron leer los turnos') }
    }
    if (pedido === ultimaLectura.current) setLectura(nueva)
  }, [selectedRestauranteId])

  useEffect(() => { void leer() }, [leer])

  const actualizar = () => {
    setLectura(null)
    void leer()
  }

  const cargarMas = async (restauranteId: string, cursor: string) => {
    const pedido = ultimaLectura.current
    const conMas = (mas: MasTurnos, agregar?: { turnos: TurnoDelHistorial[]; siguiente: string | null }) =>
      setLectura((previa) => {
        if (pedido !== ultimaLectura.current || previa?.estado !== 'listo') return previa
        return agregar ? { ...previa, mas, turnos: [...previa.turnos, ...agregar.turnos], siguiente: agregar.siguiente } : { ...previa, mas }
      })
    conMas({ estado: 'cargando' })
    try {
      const pagina = await api.turnos.listar(restauranteId, cursor)
      conMas({ estado: 'quieto' }, { turnos: pagina.items, siguiente: pagina.siguiente })
    } catch (e) {
      conMas({ estado: 'error', mensaje: mensajeDeError(e, 'No se pudieron leer más turnos') })
    }
  }

  if (!selectedRestauranteId) {
    return <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Seleccioná un restaurante para ver los turnos de caja</div>
  }

  // Lo de otro restaurante no vale: hasta que llegue la lectura del elegido, se está cargando.
  const actual = lectura?.restauranteId === selectedRestauranteId ? lectura : null
  return (
    <div className="max-w-3xl flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-500">Del más nuevo al más viejo. Los turnos se abren y se cierran desde la app del personal.</p>
        <Button variant="secondary" size="sm" onClick={actualizar}>Actualizar</Button>
      </div>
      <Historial lectura={actual} onReintentar={actualizar} onCargarMas={(cursor) => void cargarMas(selectedRestauranteId, cursor)} />
    </div>
  )
}

function Historial({ lectura, onReintentar, onCargarMas }: {
  lectura: Lectura | null
  onReintentar: () => void
  onCargarMas: (cursor: string) => void
}) {
  if (lectura === null) {
    return <Cargando etiqueta="Cargando los turnos" />
  }
  if (lectura.estado === 'error') return <ErrorConReintentar mensaje={lectura.mensaje} onReintentar={onReintentar} />
  if (lectura.turnos.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-12">Todavía no hubo turnos. Se abren desde la app del personal, en Caja.</p>
  }
  const { siguiente, mas } = lectura
  return (
    <>
      <ul aria-label="Turnos de caja" className="flex flex-col gap-3">
        {lectura.turnos.map((turno) => <TarjetaDeTurno key={turno.id} turno={turno} />)}
      </ul>
      {/* Un error al pedir la página siguiente conserva lo ya cargado. */}
      {siguiente !== null && (mas.estado === 'error' ? (
        <ErrorConReintentar mensaje={mas.mensaje} onReintentar={() => onCargarMas(siguiente)} />
      ) : (
        <Button variant="secondary" className="self-center" disabled={mas.estado === 'cargando'} onClick={() => onCargarMas(siguiente)}>
          Cargar más
        </Button>
      ))}
    </>
  )
}
