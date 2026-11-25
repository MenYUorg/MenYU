import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useContextStore } from '../../../store/contextStore'
import { tarjeta, tituloSeccion, textoAyuda } from '../marca/estilos'
import { Cargando } from '../turnos/Cargando'
import { ErrorConReintentar } from '../turnos/ErrorConReintentar'
import { FilaDeAbm } from './FilaDeAbm'
import { FormularioDeAltaDeAbm } from './FormularioDeAltaDeAbm'
import type { Bloqueo, ConfigDeAbm, ItemDelAbm } from './tipos'

/** Lo leído de un restaurante: la lista (con lo extra que pida el ABM), o el error de leerla. */
type Lectura<T, X> =
  | { restauranteId: string; estado: 'listo'; items: T[]; extra: X }
  | { restauranteId: string; estado: 'error'; mensaje: string }

interface PantallaDeAbmProps<T extends ItemDelAbm, X> {
  /** Debe ser estable entre renders (un objeto de módulo). */
  config: ConfigDeAbm
  /** La lista y lo extra que decide los bloqueos. Debe ser estable entre renders: un cambio de identidad relee. */
  leer: (restauranteId: string) => Promise<{ items: T[]; extra: X }>
  crear: (restauranteId: string, nombre: string) => Promise<unknown>
  actualizar: (id: string, cambios: { nombre?: string; activa?: boolean }) => Promise<unknown>
  /** Por qué un ítem no se puede desactivar; sin esto, ninguno está bloqueado. */
  bloqueoDe?: (item: T, extra: X) => Bloqueo | null
}

/**
 * El ABM de un restaurante: crear, renombrar, activar y desactivar (no se borra). La lista se lee al entrar, al cambiar
 * de restaurante y después de cada operación; sin polling.
 */
export function PantallaDeAbm<T extends ItemDelAbm, X>({ config, leer, crear, actualizar, bloqueoDe }: PantallaDeAbmProps<T, X>) {
  const { selectedRestauranteId } = useContextStore()
  const idNueva = useId()
  const idLista = useId()
  const [lectura, setLectura] = useState<Lectura<T, X> | null>(null)
  // La respuesta de una lectura anterior (otro restaurante, una operación que se cruzó) no pisa la más nueva.
  const ultimaLectura = useRef(0)

  const releer = useCallback(async () => {
    const pedido = ++ultimaLectura.current
    if (!selectedRestauranteId) return
    let nueva: Lectura<T, X>
    try {
      const { items, extra } = await leer(selectedRestauranteId)
      nueva = { restauranteId: selectedRestauranteId, estado: 'listo', items, extra }
    } catch (e) {
      const mensaje = e instanceof Error && e.message ? e.message : config.errorDeLecturaPorDefecto
      nueva = { restauranteId: selectedRestauranteId, estado: 'error', mensaje }
    }
    if (pedido === ultimaLectura.current) setLectura(nueva)
  }, [selectedRestauranteId, leer, config.errorDeLecturaPorDefecto])

  useEffect(() => { void releer() }, [releer])

  if (!selectedRestauranteId) {
    return <div className="flex items-center justify-center h-48 text-gray-400 text-sm">{config.seleccionaRestaurante}</div>
  }

  // Lo de otro restaurante no vale: hasta que llegue la lectura del elegido, se está cargando.
  const actual = lectura?.restauranteId === selectedRestauranteId ? lectura : null
  return (
    <div className="mx-auto w-full max-w-3xl p-4 md:p-6 space-y-6">
      <section aria-labelledby={idNueva} style={tarjeta}>
        <h3 id={idNueva} style={tituloSeccion}>{config.tituloDelAlta}</h3>
        <p style={{ ...textoAyuda, margin: '6px 0 16px', lineHeight: 1.5 }}>{config.ayudaDelAlta}</p>
        <FormularioDeAltaDeAbm config={config} restauranteId={selectedRestauranteId} crear={crear} onCreada={() => void releer()} />
      </section>
      <section aria-labelledby={idLista} style={tarjeta}>
        <h3 id={idLista} style={tituloSeccion}>{config.tituloDeLaLista}</h3>
        <ListaDeAbm config={config} lectura={actual} actualizar={actualizar} bloqueoDe={bloqueoDe} onCambio={() => void releer()} />
      </section>
    </div>
  )
}

interface ListaDeAbmProps<T extends ItemDelAbm, X> {
  config: ConfigDeAbm
  lectura: Lectura<T, X> | null
  actualizar: PantallaDeAbmProps<T, X>['actualizar']
  bloqueoDe: PantallaDeAbmProps<T, X>['bloqueoDe']
  onCambio: () => void
}

function ListaDeAbm<T extends ItemDelAbm, X>({ config, lectura, actualizar, bloqueoDe, onCambio }: ListaDeAbmProps<T, X>) {
  if (lectura === null) {
    return <Cargando etiqueta={config.etiquetaDeCarga} />
  }
  if (lectura.estado === 'error') {
    return <ErrorConReintentar mensaje={lectura.mensaje} onReintentar={onCambio} />
  }
  if (lectura.items.length === 0) {
    return (
      <p style={{ ...textoAyuda, fontSize: 14, padding: '16px 0', lineHeight: 1.5 }}>
        {config.textoVacio}
      </p>
    )
  }
  return (
    <ul aria-label={config.ariaLabelDeLaLista} style={{ listStyle: 'none', margin: '12px 0 0', padding: 0 }}>
      {lectura.items.map((item) => (
        <FilaDeAbm
          key={item.id}
          config={config}
          item={item}
          bloqueo={bloqueoDe?.(item, lectura.extra) ?? null}
          actualizar={actualizar}
          onCambio={onCambio}
        />
      ))}
    </ul>
  )
}
