import { matchPath } from 'react-router-dom'
import { useDiscoveryStore } from '../store/discoveryStore'
import { menuEsDe, usePublicMenuStore } from '../store/publicMenuStore'
import { useSessionStore } from '../store/sessionStore'
import { pantallaDeRuta, tituloDeLaPestana } from '../utils/pantallas'

/**
 * El restaurante de esta pantalla: el de la dirección (`/restaurante/:id/…`) o, en las pantallas de la mesa, el de la sesión.
 * El nombre sale del menú que ya se pidió o, si no, de Discovery; `null` mientras no llegó ninguno.
 */
function useNombreDelRestaurante(pathname: string): string | null {
  const restauranteDeLaSesion = useSessionStore((s) => s.restauranteId)
  const menu = usePublicMenuStore((s) => s.menu)
  const detalle = useDiscoveryStore((s) => s.detalle)
  const restaurantes = useDiscoveryStore((s) => s.restaurantes)

  const id = matchPath({ path: '/restaurante/:restauranteId', end: false }, pathname)?.params.restauranteId ?? restauranteDeLaSesion
  if (!id) return null

  if (menu && menuEsDe(menu, id)) return menu.restaurante.nombre
  const minuscula = id.toLowerCase()
  if (detalle?.restaurante && detalle.restaurante.id.toLowerCase() === minuscula) return detalle.restaurante.nombre
  return restaurantes.find((r) => r.id.toLowerCase() === minuscula)?.nombre ?? null
}

/** El título de la pestaña de esta ruta: "{Pantalla} · {Restaurante}". En el detalle, la pantalla es el nombre del plato. */
export function useTituloDeLaPantalla(pathname: string): string {
  const restaurante = useNombreDelRestaurante(pathname)
  const platoDelDetalle = usePublicMenuStore((s) => {
    const itemId = matchPath('/menu/:itemId', pathname)?.params.itemId
    return itemId ? s.getItemById(itemId)?.nombre ?? null : null
  })
  return tituloDeLaPestana(platoDelDetalle ?? pantallaDeRuta(pathname), restaurante)
}
