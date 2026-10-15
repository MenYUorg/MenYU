import { MenuView } from '../../components/menu/MenuView'
import { useSessionStore } from '../../store/sessionStore'

/** El menú de la mesa (`/menu`): el del restaurante de la sesión, con pedido, mozo, carrito y detalle de los platos. */
export function ClienteMenuPage() {
  const restauranteId = useSessionStore((s) => s.restauranteId)
  return <MenuView modo="mesa" restauranteId={restauranteId} />
}
