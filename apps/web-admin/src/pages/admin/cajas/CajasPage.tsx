import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { CajaDelRestaurante } from '@menyu/types'
import { useContextStore } from '../../../store/contextStore'
import { api } from '../../../services/api'
import { tarjeta, tituloSeccion, textoAyuda } from '../marca/estilos'
import { Cargando } from '../turnos/Cargando'
import { ErrorConReintentar } from '../turnos/ErrorConReintentar'
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
  const idNueva = useId()
  const idLista = useId()
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
    <div className="mx-auto w-full max-w-3xl p-4 md:p-6 space-y-6">
      <section aria-labelledby={idNueva} style={tarjeta}>
        <h3 id={idNueva} style={tituloSeccion}>Nueva caja</h3>
        <p style={{ ...textoAyuda, margin: '6px 0 16px', lineHeight: 1.5 }}>Un turno puede abrir hasta 2 cajas. Una caja no se borra: se desactiva.</p>
        <FormularioDeAlta restauranteId={selectedRestauranteId} onCreada={() => void leer()} />
      </section>
      <section aria-labelledby={idLista} style={tarjeta}>
        <h3 id={idLista} style={tituloSeccion}>Cajas</h3>
        <ListaDeCajas lectura={actual} onCambio={() => void leer()} />
      </section>
    </div>
  )
}

function ListaDeCajas({ lectura, onCambio }: { lectura: Lectura | null; onCambio: () => void }) {
  if (lectura === null) {
    return <Cargando etiqueta="Cargando las cajas" />
  }
  if (lectura.estado === 'error') {
    return <ErrorConReintentar mensaje={lectura.mensaje} onReintentar={onCambio} />
  }
  if (lectura.cajas.length === 0) {
    return (
      <p style={{ ...textoAyuda, fontSize: 14, padding: '16px 0', lineHeight: 1.5 }}>
        Todavía no hay cajas. Creá la primera para poder abrir un turno desde la app del personal.
      </p>
    )
  }
  return (
    <ul aria-label="Cajas del restaurante" style={{ listStyle: 'none', margin: '12px 0 0', padding: 0 }}>
      {lectura.cajas.map((caja) => (
        <FilaDeCaja key={caja.id} caja={caja} abierta={lectura.abiertas?.includes(caja.id) ?? false} onCambio={onCambio} />
      ))}
    </ul>
  )
}
