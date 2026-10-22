import type { Rol } from '@menyu/types'
import type { RolDeAdmin } from '../../../store/contextStore'

/** Los roles en palabras, como los nombra el equipo. */
export const ETIQUETA_DE_ROL: Record<Rol, string> = {
  OWNER: 'Dueño',
  GERENTE: 'Gerente',
  JEFE_SALON: 'Jefe de salón',
  MOZO: 'Mozo',
  COCINA: 'Cocina',
}

export function etiquetaDeRol(rol: Rol): string {
  return Object.prototype.hasOwnProperty.call(ETIQUETA_DE_ROL, rol) ? ETIQUETA_DE_ROL[rol] : rol
}

/**
 * A quién puede invitar cada uno, en el orden en que se ofrece. Es la misma matriz que `puede-invitar.ts` del backend
 * (docs/auth/specs/auth.md, Fase 2): el OWNER invita a cualquier rol de su marca; el GERENTE, al personal de salón y
 * cocina de sus restaurantes. El backend la vuelve a aplicar: acá solo se evita ofrecer lo que va a dar 403.
 */
export function rolesQuePuedeInvitar(rolPropio: RolDeAdmin): Rol[] {
  if (rolPropio === 'OWNER') return ['GERENTE', 'JEFE_SALON', 'MOZO', 'COCINA', 'OWNER']
  return ['JEFE_SALON', 'MOZO', 'COCINA']
}

/**
 * Quién le puede quitar el acceso a quién, con la misma matriz. Los dueños no se quitan desde acá (su membresía es de
 * la marca): eso es `DELETE /root/duenos/:membresiaId`, de la consola de ROOT.
 */
export function puedeQuitarAcceso(rolPropio: RolDeAdmin, rolDelOtro: Rol): boolean {
  if (rolDelOtro === 'OWNER') return false
  return rolesQuePuedeInvitar(rolPropio).includes(rolDelOtro)
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
