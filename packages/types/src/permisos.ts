import type { Rol } from './auth.types'

/** Quien invita o quita: un rol de membresía, o ROOT, que no es una membresía sino `Usuario.esRoot`. */
export type RolQueInvita = Rol | 'ROOT'

/**
 * Quién puede invitar a quién (docs/auth/specs/auth.md, Fase 2, con la regla de ROOT de la 4.4):
 *
 * - ROOT invita a OWNER y nada más. Las cuentas ROOT se invitan desde la consola (`POST /root/roots`), sin un rol.
 * - OWNER invita a cualquier rol de su marca, incluido otro OWNER.
 * - GERENTE invita al personal de salón y cocina de sus restaurantes.
 * - El resto no invita a nadie.
 *
 * El orden de cada lista es el que web-admin ofrece en el formulario de Personal.
 *
 * **Quien decide es el backend** (`auth/invitaciones/puede-invitar.ts`): acá está la tabla para que web-admin no
 * ofrezca lo que va a terminar en 403, y para que `puede-invitar.spec.ts` compruebe que las dos dicen lo mismo. El
 * backend no importa este paquete (sus tipos salen de Prisma), así que ese test es lo que ata una cosa a la otra.
 */
export const ROLES_QUE_PUEDE_INVITAR: Record<RolQueInvita, readonly Rol[]> = {
  ROOT: ['OWNER'],
  OWNER: ['GERENTE', 'JEFE_SALON', 'MOZO', 'COCINA', 'OWNER'],
  GERENTE: ['JEFE_SALON', 'MOZO', 'COCINA'],
  JEFE_SALON: [],
  MOZO: [],
  COCINA: [],
}

/** Los roles que puede invitar, en el orden en que se ofrecen. */
export function rolesQuePuedeInvitar(rol: RolQueInvita): readonly Rol[] {
  return ROLES_QUE_PUEDE_INVITAR[rol] ?? []
}

/**
 * Si puede quitarle el acceso a alguien con ese rol. A un OWNER no se le quita desde Personal: su membresía es de la
 * marca, así que eso es `DELETE /root/duenos/:membresiaId`, de la consola de ROOT.
 */
export function puedeQuitarAcceso(rolPropio: RolQueInvita, rolDelOtro: Rol): boolean {
  if (rolDelOtro === 'OWNER') return false
  return rolesQuePuedeInvitar(rolPropio).includes(rolDelOtro)
}

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
