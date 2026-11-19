import { useCallback, useEffect, useRef, useState } from 'react'
import type { CajaDelRestaurante } from '@menyu/types'
import { Button, Spinner } from '@menyu/ui'
import { useContextStore } from '../../../store/contextStore'
import { api } from '../../../services/api'
import { FilaDeCaja } from './FilaDeCaja'
import { FormularioDeAlta } from './FormularioDeAlta'

/** Lo leído de un restaurante: la lista, o el error de leerla. `abiertas` en null: no se pudo saber (falla abierta). */
type Lectura =
  | { restauranteId: string; estado: 'listo'; cajas: CajaDelRestaurante[]; abiertas: string[] | null }
  | { restauranteId: string; estado: 'error'; mensaje: string }

/**
 * Las cajas del restaurante (#360): crearlas, renombrarlas, activarlas y desactivarlas (no se borran). OWNER y GERENTE.
 * La lista y las cajas abiertas del turno se leen al entrar, al cambiar de restaurante y después de cada operación; sin
 * polling. Si las abiertas no se pueden leer, no se marca ninguna y decide el backend.
 */
export function CajasPage() {
  const { selectedRestauranteId } = useContextStore()
  const [lectura, setLectura] = useState<Lectura | null>(null)
  // La respuesta de una lectura anterior (otro restaurante, una operación que se cruzó) no pisa la más nueva.
  const ultimaLectura = useRef(0)

  const leer = useCallback(async () => {
    const pedido = ++ultimaLectura.current
    if (!selectedRestauranteId) return
    let nueva: Lectura
    try {
      const [cajas, abiertas] = await Promise.all([
        api.cajas.listar(selectedRestauranteId),
        api.cajas.abiertas(selectedRestauranteId).then((r) => r.cajas.map((c) => c.cajaId), () => null),
      ])
      nueva = { restauranteId: selectedRestauranteId, estado: 'listo', cajas, abiertas }
    } catch (e) {
      const mensaje = e instanceof Error && e.message ? e.message : 'No se pudieron leer las cajas'
      nueva = { restauranteId: selectedRestauranteId, estado: 'error', mensaje }
    }
    if (pedido === ultimaLectura.current) setLectura(nueva)
  }, [selectedRestauranteId])

  useEffect(() => { void leer() }, [leer])

  if (!selectedRestauranteId) {
    return <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Seleccioná un restaurante para ver las cajas</div>
  }

  // Lo de otro restaurante no vale: hasta que llegue la lectura del elegido, se está cargando.
  const actual = lectura?.restauranteId === selectedRestauranteId ? lectura : null
  return (
    <div className="max-w-2xl">
      <p className="text-sm text-gray-500 mb-4">Un turno puede abrir hasta 2 cajas. Una caja no se borra: se desactiva.</p>
      <FormularioDeAlta restauranteId={selectedRestauranteId} onCreada={() => void leer()} />
      <ListaDeCajas lectura={actual} onCambio={() => void leer()} />
    </div>
  )
}

function ListaDeCajas({ lectura, onCambio }: { lectura: Lectura | null; onCambio: () => void }) {
  if (lectura === null) {
    return <div role="status" aria-label="Cargando las cajas" className="flex justify-center py-16"><Spinner size="lg" /></div>
  }
  if (lectura.estado === 'error') {
    return (
      <div role="alert" className="flex flex-col items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
        <p>{lectura.mensaje}</p>
        <Button variant="secondary" size="sm" onClick={onCambio}>Reintentar</Button>
      </div>
    )
  }
  if (lectura.cajas.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-12">
        Todavía no hay cajas. Creá la primera para poder abrir un turno desde la app del personal.
      </p>
    )
  }
  return (
    <ul aria-label="Cajas del restaurante" className="flex flex-col gap-3">
      {lectura.cajas.map((caja) => (
        <FilaDeCaja key={caja.id} caja={caja} abierta={lectura.abiertas?.includes(caja.id) ?? false} onCambio={onCambio} />
      ))}
    </ul>
  )
}
