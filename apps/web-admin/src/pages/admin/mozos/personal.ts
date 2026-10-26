import type { Rol } from '@menyu/types'
import { rolesQuePuedeInvitar as rolesDeLaMatriz } from '@menyu/types/permisos'
import type { RolDeAdmin } from '../../../store/contextStore'

// La matriz de quién invita y quita vive en `@menyu/types` (`permisos.ts`), que es también lo que comprueba el
// `puede-invitar.spec.ts` del backend: antes estaba copiada a mano acá y podían divergir sin que nada avisara.
//
// Se importa por el subpath `@menyu/types/permisos`, que apunta a la fuente, como hace `@menyu/ui` con los suyos. La
// entrada principal del paquete es el `dist` compilado (CommonJS, con `__exportStar`) y Rollup no puede resolver un
// valor a través de ese helper: `vite build` fallaba con "is not exported", aunque en runtime existiera.
export { ETIQUETA_DE_ROL, etiquetaDeRol, puedeQuitarAcceso } from '@menyu/types/permisos'

/** A quién puede invitar cada uno, en el orden en que se ofrece. El backend la vuelve a aplicar. */
export function rolesQuePuedeInvitar(rolPropio: RolDeAdmin): readonly Rol[] {
  return rolesDeLaMatriz(rolPropio)
}

/** La invitación de un OWNER va con la marca; las demás, con el restaurante. */
export function ambitoDeLaInvitacion(
  rol: Rol,
  marcaId: string | null,
  restauranteId: string,
): { marcaId: string } | { restauranteId: string } | null {
  if (rol !== 'OWNER') return { restauranteId }
  return marcaId ? { marcaId } : null
}
