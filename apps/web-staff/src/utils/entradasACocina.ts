/** Cuántos ids de pedidos que ya entraron a la pantalla se recuerdan como máximo durante la jornada. */
export const MAXIMO_DE_ENTRADAS_RECORDADAS = 1000

/**
 * Registra que el pedido `id` entró a la pantalla Cocina y devuelve `true` solo la PRIMERA vez (no estaba en `vistos`).
 * Si ya estaba devuelve `false` y no cambia nada (ni el tamaño ni el orden). Muta `vistos` in-place.
 *
 * La pantalla decide "primera entrada" con este registro y no con el estado de React: así un evento repetido, o dos
 * seguidos antes del siguiente render, no reimprimen. El tope acota la memoria durante la jornada descartando los ids
 * más viejos (por orden de inserción) sin habilitar reimpresiones: sacar el id al salir el pedido haría que uno que
 * vuelve a llegar parezca nuevo.
 */
export function marcarEntrada(
  vistos: Set<string>,
  id: string,
  maximo: number = MAXIMO_DE_ENTRADAS_RECORDADAS,
): boolean {
  if (vistos.has(id)) return false
  vistos.add(id)
  for (const viejo of vistos) {
    if (vistos.size <= maximo) break
    vistos.delete(viejo)
  }
  return true
}

/** Marca como ya entrados los ids que la pantalla conocía de antemano (los que carga `fetchAll`). */
export function sembrarEntradas(
  vistos: Set<string>,
  ids: readonly string[],
  maximo: number = MAXIMO_DE_ENTRADAS_RECORDADAS,
): void {
  for (const id of ids) marcarEntrada(vistos, id, maximo)
}
