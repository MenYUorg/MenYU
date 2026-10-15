import { useParams } from 'react-router-dom'
import { MenuView } from '../../components/menu/MenuView'

/**
 * La carta de un restaurante en modo vista (`/restaurante/:restauranteId/carta`): el mismo menú que el de la mesa pero
 * solo para mirar, sin pedir. Es pública: no necesita sesión de mesa ni cuenta.
 */
export function CartaPage() {
  const { restauranteId = null } = useParams()
  return <MenuView modo="carta" restauranteId={restauranteId} />
}
