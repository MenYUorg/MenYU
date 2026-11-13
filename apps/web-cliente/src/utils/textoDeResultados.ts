import type { DiscoveryBusquedaResponse } from '@menyu/types'

const plural = (cantidad: number, singular: string, plural: string) => `${cantidad} ${cantidad === 1 ? singular : plural}`

/**
 * Cuántos resultados dio la búsqueda de Discovery, en el texto corto que se anuncia: "2 ofertas y 3 restaurantes", "1 oferta",
 * "4 restaurantes" o, si no hay nada, "No encontramos nada para “pizza”". Los restaurantes son los que se llaman así por su
 * nombre y los que tienen platos que coinciden: en pantalla se ven igual, como tarjetas de restaurante.
 */
export function textoDeResultados(resultados: DiscoveryBusquedaResponse, buscado: string): string {
  const ofertas = resultados.ofertas.length
  const restaurantes = resultados.restaurantes.length + resultados.restaurantesConPlatos.length

  const partes: string[] = []
  if (ofertas > 0) partes.push(plural(ofertas, 'oferta', 'ofertas'))
  if (restaurantes > 0) partes.push(plural(restaurantes, 'restaurante', 'restaurantes'))

  return partes.length > 0 ? partes.join(' y ') : `No encontramos nada para “${buscado}”`
}
