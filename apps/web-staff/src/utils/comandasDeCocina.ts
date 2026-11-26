/** Lo mínimo que la cocina necesita de una línea de pedido para decidir en qué pestania se ve. */
export type ItemConComanda = { comandaId: string | null; cantidad: number; cantidadEditada: number | null }

/** Lo mínimo de una comanda (compatible con `Comanda` de `@menyu/types`). */
export type ComandaDeCocina = { id: string; nombre: string; activa: boolean }

/** Una pestania es el id de una comanda; `null` es "Todas". */
export type Pestania = string | null

type Activas = ReadonlySet<string> | string[]

const estaActiva = (activas: Activas, comandaId: string) =>
  Array.isArray(activas) ? activas.includes(comandaId) : (activas as ReadonlySet<string>).has(comandaId)

/** Cantidad vigente de una línea: la editada si la hay, si no la original. 0 es una línea eliminada. */
const cantidadVigente = (item: ItemConComanda) => item.cantidadEditada ?? item.cantidad

/** Los ids de las comandas activas. */
export function idsActivos(comandas: ComandaDeCocina[] | undefined | null): string[] {
  return (comandas ?? []).filter((c) => c.activa).map((c) => c.id)
}

/** La pestania elegida solo vale si es una comanda activa de la lista; si no (o sin lista), vuelve a "Todas". */
export function pestaniaVigente(elegida: Pestania, comandas: ComandaDeCocina[] | undefined | null): Pestania {
  if (elegida === null) return null
  return (comandas ?? []).some((c) => c.id === elegida && c.activa) ? elegida : null
}

/**
 * Regla central: nunca puede quedar un plato sin pantalla. Se ve en "Todas", en su propia pestania, si no tiene comanda
 * y si su comanda no está entre las activas (desactivada o desconocida).
 */
export function itemVisible(item: ItemConComanda, pestania: Pestania, activas: Activas): boolean {
  return (
    pestania === null ||
    item.comandaId === pestania ||
    item.comandaId === null ||
    !estaActiva(activas, item.comandaId)
  )
}

/** Separa las líneas en visibles y ocultas para la pestania, conservando el orden y sin mutar. */
export function partirItems<T extends ItemConComanda>(
  items: readonly T[],
  pestania: Pestania,
  activas: Activas,
): { visibles: T[]; ocultos: T[] } {
  const visibles: T[] = []
  const ocultos: T[] = []
  for (const item of items) (itemVisible(item, pestania, activas) ? visibles : ocultos).push(item)
  return { visibles, ocultos }
}

/**
 * Si el pedido tiene algo para mostrar en la pestania. Cuenta todas las líneas visibles, también las eliminadas
 * (cantidad actual 0), porque la tarjeta las muestra tachadas. "Todas" (pestania null) siempre cuenta, también un
 * pedido sin ítems, para que se comporte exactamente como antes de las pestañas. En una pestaña filtrada, sin ítems no
 * hay nada que mostrar, así que no se lista, no suena ni se imprime.
 */
export function tieneAlgoVisible(items: readonly ItemConComanda[], pestania: Pestania, activas: Activas): boolean {
  return pestania === null || items.some((item) => itemVisible(item, pestania, activas))
}

/** Cantidad de líneas ocultas que siguen vigentes (no eliminadas). Cuenta líneas, no unidades. */
export function ocultosVigentes(ocultos: readonly ItemConComanda[]): number {
  return ocultos.filter((item) => cantidadVigente(item) > 0).length
}

/**
 * La comanda de cocina se reconoce por su nombre, sin mayúsculas ni espacios al principio y al final: es la misma regla
 * que aplica el backend al marcar "Listo" (`esComandaDeCocina` de `decidir-listo.ts`). Si un restaurante la llama de otra
 * forma, no hay comanda de cocina.
 */
export const esComandaDeCocina = (nombre: string): boolean => nombre.trim().toLowerCase() === 'cocina'

/** Una línea con la marca de "Listo" que le puso su comanda (`listoEn`); `null` es pendiente. */
export type ItemConListo = ItemConComanda & { listoEn?: string | null }

const yaMarcado = (item: ItemConListo) => (item.listoEn ?? null) !== null

/** Es "de cocina" lo que no tiene comanda, o su comanda es la de cocina o no está entre las activas. */
function esDeCocina(item: ItemConComanda, comandas: readonly ComandaDeCocina[]): boolean {
  if (item.comandaId === null) return true
  const comanda = comandas.find((c) => c.id === item.comandaId)
  return !comanda?.activa || esComandaDeCocina(comanda.nombre)
}

/**
 * Las líneas vigentes que le tocan a la pestania, o sea las que marca su "Listo". En "Todas" son todas. En una comanda
 * son las suyas; en la comanda de cocina, además las "de cocina" (sin comanda, o de una comanda inactiva o desconocida),
 * que se ven en todas las pestanias pero solo las cierra la cocina. Las eliminadas (cantidad vigente 0) no cuentan.
 */
export function itemsPropios<T extends ItemConComanda>(
  items: readonly T[],
  pestania: Pestania,
  comandas: readonly ComandaDeCocina[] | undefined | null,
): T[] {
  const vigentes = items.filter((item) => cantidadVigente(item) > 0)
  if (pestania === null) return vigentes
  const lista = comandas ?? []
  const esLaDeCocina = lista.some((c) => c.id === pestania && esComandaDeCocina(c.nombre))
  return vigentes.filter((item) => item.comandaId === pestania || (esLaDeCocina && esDeCocina(item, lista)))
}

export type ColumnaDeCocina = 'en_preparacion' | 'listo'

/**
 * En qué columna va el pedido en la pestania. "Todas" y un pedido ya `listo` siguen su estado. En una comanda, mientras el
 * pedido sigue en preparación, va a "Listo" cuando todas sus líneas propias ya están marcadas (y tiene alguna); si no,
 * a "En preparación".
 *
 * Todo lo que no es `listo` ni `en_preparacion` también devuelve "En preparación". Es el caso de un pedido anulado: la
 * pantalla lo sigue mostrando tachado en esa columna durante unos minutos (comportamiento anterior a este cambio). Que
 * no tenga botón "Listo" no lo decide esta función sino `puedeMarcarListo`, que lo excluye por su estado.
 */
export function columnaDelPedido(
  pedido: { estado: string; items: readonly ItemConListo[] },
  pestania: Pestania,
  comandas: readonly ComandaDeCocina[] | undefined | null,
): ColumnaDeCocina {
  if (pedido.estado === 'listo') return 'listo'
  if (pedido.estado !== 'en_preparacion' || pestania === null) return 'en_preparacion'
  const propios = itemsPropios(pedido.items, pestania, comandas)
  return propios.length > 0 && propios.every(yaMarcado) ? 'listo' : 'en_preparacion'
}

/**
 * Si la pestania tiene un "Listo" que tocar: el pedido está en su columna "En preparación" y, en una comanda, tiene alguna
 * línea propia pendiente. En "Todas" siempre que esté en preparación. Si la pestania solo ve líneas ajenas (por ejemplo, una
 * sin comanda desde Barra) no hay botón: lo cierra la cocina o "Todas".
 */
export function puedeMarcarListo(
  pedido: { estado: string; items: readonly ItemConListo[] },
  pestania: Pestania,
  comandas: readonly ComandaDeCocina[] | undefined | null,
): boolean {
  if (columnaDelPedido(pedido, pestania, comandas) !== 'en_preparacion' || pedido.estado !== 'en_preparacion') return false
  return pestania === null || itemsPropios(pedido.items, pestania, comandas).some((item) => !yaMarcado(item))
}

/** Las líneas que salen en la comanda impresa: las mismas que se ven en la pestania. */
export function itemsParaImprimir<T extends ItemConComanda>(
  items: readonly T[],
  pestania: Pestania,
  activas: Activas,
): T[] {
  return partirItems(items, pestania, activas).visibles
}

/**
 * El pedido tal como sale en el ticket de la pestania: las líneas que se ven (`itemsParaImprimir`), sin las que tienen
 * cantidad vigente 0 (eliminadas en una edición: no hay nada que preparar). Si no queda ninguna línea no hay nada que
 * imprimir y devuelve `null`. Sin mutar el pedido.
 */
export function pedidoParaImprimir<I extends ItemConComanda, P extends { items: I[] }>(
  pedido: P,
  pestania: Pestania,
  activas: Activas,
): P | null {
  const items = itemsParaImprimir(pedido.items, pestania, activas).filter((item) => cantidadVigente(item) > 0)
  return items.length === 0 ? null : { ...pedido, items }
}
