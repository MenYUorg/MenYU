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

/** Si marcar listo el pedido arrastra ítems de otras comandas, hay que confirmarlo. */
export function hayQueConfirmar(ocultos: readonly ItemConComanda[]): boolean {
  return ocultosVigentes(ocultos) > 0
}

const unirNombres = (nombres: string[]) =>
  nombres.length <= 1 ? (nombres[0] ?? '') : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`

/**
 * El texto de la confirmación al marcar listo todo el pedido, o `null` si no hay ocultos vigentes. Los nombres de las
 * comandas no se repiten y van por orden alfabético; si alguna no se encuentra, se omite.
 */
export function textoDeConfirmacion(
  ocultos: readonly ItemConComanda[],
  comandas: ComandaDeCocina[] | undefined | null,
): string | null {
  const vigentes = ocultos.filter((item) => cantidadVigente(item) > 0)
  if (vigentes.length === 0) return null

  const nombres = new Set<string>()
  for (const item of vigentes) {
    const nombre = (comandas ?? []).find((c) => c.id === item.comandaId)?.nombre
    if (nombre) nombres.add(nombre)
  }
  const ordenados = [...nombres].sort((a, b) => a.localeCompare(b, 'es'))

  const n = vigentes.length
  const items = n === 1 ? '1 ítem' : `${n} ítems`
  const de = ordenados.length > 0 ? ` de ${unirNombres(ordenados)}` : ''
  return `Vas a marcar listo todo el pedido, incluidos ${items}${de}`
}

/** Las líneas que salen en la comanda impresa: las mismas que se ven en la pestania. */
export function itemsParaImprimir<T extends ItemConComanda>(
  items: readonly T[],
  pestania: Pestania,
  activas: Activas,
): T[] {
  return partirItems(items, pestania, activas).visibles
}
