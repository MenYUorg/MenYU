import type { MenuPublico, MenuPublicoItem } from '@menyu/types'
import type { CartItem } from '../store/carritoStore'
import { precioVigenteDe } from './precio'

// Diferencias menores a medio centavo son ruido de la coma flotante, no un cambio de precio.
const TOLERANCIA = 0.005

/** Todos los platos del menú por id (están en las categorías, y también en recomendados o descuentos). */
export function indexarPlatos(menu: MenuPublico): Map<string, MenuPublicoItem> {
  const platos = new Map<string, MenuPublicoItem>()
  const secciones = [
    ...menu.categorias.flatMap((categoria) => categoria.itemsDirectos),
    ...(menu.recomendados ?? []),
    ...(menu.descuentos ?? []),
  ]
  for (const plato of secciones) platos.set(plato.id, plato)
  return platos
}

/**
 * Vuelve a calcular el precio unitario de cada plato del carrito con el menú actual: precio vigente (con
 * descuento si lo tiene) más los extras agregados, que se cobran a su precio normal.
 *
 * El carrito se guarda en el navegador, así que puede tener precios de un menú anterior (un descuento nuevo
 * o uno que ya se sacó). Si el plato o alguno de sus extras ya no está en el menú, no se puede calcular y
 * se deja como está. `cambio` indica si algún precio cambió.
 */
export function repreciarItems(items: CartItem[], menu: MenuPublico): { items: CartItem[]; cambio: boolean } {
  const platos = indexarPlatos(menu)
  let cambio = false

  const actualizados = items.map((enCarrito) => {
    const plato = platos.get(enCarrito.itemMenuId)
    if (!plato) return enCarrito

    let extras = 0
    for (const mod of enCarrito.modificaciones) {
      if (mod.accion !== 'agregar') continue
      const ingrediente = (plato.ingredientes ?? []).find((ii) => ii.id === mod.itemIngredienteId)
      if (!ingrediente) return enCarrito
      extras += Number(ingrediente.precioExtra) * mod.cantidad
    }

    const precioUnitario = precioVigenteDe(plato) + extras
    if (Math.abs(precioUnitario - enCarrito.precioUnitario) < TOLERANCIA) return enCarrito

    cambio = true
    return { ...enCarrito, precioUnitario }
  })

  return { items: cambio ? actualizados : items, cambio }
}
