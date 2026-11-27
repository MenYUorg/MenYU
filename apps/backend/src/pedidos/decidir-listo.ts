/** Lo mínimo de una línea de pedido para decidir qué marca "Listo" una comanda y si cierra el pedido. */
export interface ItemParaListo {
  id: string
  comandaId: string | null
  cantidad: number
  cantidadEditada: number | null
  listoEn: Date | null
}

/** Lo mínimo de una comanda del restaurante (compatible con `Comanda` de Prisma). */
export interface ComandaParaListo {
  id: string
  nombre: string
  activa: boolean
}

export interface DecisionDeListo {
  /** Ids de las líneas que pasan a listas. Vacío: no hay nada que hacer. */
  marcar: string[]
  /** Si el pedido entero pasa a "listo". */
  cerrar: boolean
}

/**
 * La comanda de cocina se reconoce por su nombre, sin mayúsculas ni espacios al principio y al final. Si un
 * restaurante la llama de otra forma, no hay comanda de cocina y se aplica la regla de "sin cocina".
 */
export const esComandaDeCocina = (nombre: string): boolean => nombre.trim().toLowerCase() === 'cocina'

/** Cantidad vigente de una línea: la editada si la hay, si no la original. 0 es una línea eliminada. */
const vigente = (item: ItemParaListo): boolean => (item.cantidadEditada ?? item.cantidad) > 0

/**
 * Si no queda ninguna línea vigente pendiente: todo lo que hay que preparar ya está listo. Lo usa la edición para
 * cerrar el pedido cuando eliminar líneas deja sin nada pendiente (por ejemplo, la cocina eliminó su último plato
 * después de que la barra marcó y nadie más tiene un "Listo" que tocar). Las líneas eliminadas no cuentan.
 */
export const nadaPendiente = (items: readonly ItemParaListo[]): boolean =>
  items.every((item) => !vigente(item) || item.listoEn !== null)

/**
 * Qué pasa cuando se marca "Listo" en un pedido en preparación (#344). Solo cuentan las líneas vigentes (las eliminadas
 * no hay que prepararlas) y todavía pendientes (`listoEn` null).
 *
 * - Sin `comandaId` (la pestaña "Todas" o el mozo): marca todo lo pendiente y cierra el pedido.
 * - Con `comandaId`: marca lo pendiente de esa comanda. Un ítem "de cocina" es el que no tiene comanda, el de una
 *   comanda inactiva (la cocina lo muestra en todas las pestañas) o el de la comanda de cocina.
 *   - Si es la comanda de cocina, cierra el pedido entero, aunque las otras comandas no hayan marcado.
 *   - Si no, cierra solo cuando el pedido no tiene ninguna línea vigente de cocina: la primera comanda que marca lo
 *     cierra. Si tiene alguna, solo la cocina lo cierra.
 *   - Si no tiene nada pendiente que sea suyo, no hace nada (por ejemplo un segundo clic).
 * - Al cerrar se marca también lo pendiente de las demás comandas: un pedido "listo" no deja líneas pendientes.
 *
 * `comandaId` tiene que ser una comanda del restaurante del pedido: lo valida quien llama.
 */
export function decidirListo(
  items: readonly ItemParaListo[],
  comandas: readonly ComandaParaListo[],
  comandaId: string | null,
): DecisionDeListo {
  const vigentes = items.filter(vigente)
  const pendientes = vigentes.filter((item) => item.listoEn === null)

  if (comandaId === null) return { marcar: pendientes.map((i) => i.id), cerrar: true }

  const idsDeCocina = new Set(comandas.filter((c) => esComandaDeCocina(c.nombre)).map((c) => c.id))
  const idsActivas = new Set(comandas.filter((c) => c.activa).map((c) => c.id))
  const esDeCocina = (item: ItemParaListo) =>
    item.comandaId === null || idsDeCocina.has(item.comandaId) || !idsActivas.has(item.comandaId)

  const esLaDeCocina = idsDeCocina.has(comandaId)
  const propios = pendientes.filter((item) => item.comandaId === comandaId || (esLaDeCocina && esDeCocina(item)))
  if (propios.length === 0) return { marcar: [], cerrar: false }

  const cerrar = esLaDeCocina || !vigentes.some(esDeCocina)
  return { marcar: (cerrar ? pendientes : propios).map((i) => i.id), cerrar }
}
