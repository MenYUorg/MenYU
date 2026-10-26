import { Rol } from '@prisma/client'

const ROLES_DE_ROOT: Rol[] = ['OWNER']
const ROLES_DE_GERENTE: Rol[] = ['JEFE_SALON', 'MOZO', 'COCINA']

/**
 * Quién puede invitar a quién (docs/auth/specs/auth.md, Fase 2, con la regla de ROOT de la 4.4):
 * - ROOT: a OWNER. Las cuentas ROOT se invitan desde la consola (`POST /root/roots`), no con un rol.
 * - OWNER: a cualquier rol de su marca.
 * - GERENTE: a JEFE_SALON, MOZO y COCINA de sus restaurantes.
 *
 * `rolesEnAmbito` son los roles de quien invita en la marca o el restaurante de la invitación (los
 * calcula AccesoService, así que el OWNER de la marca ya figura como OWNER en sus restaurantes).
 */
export function puedeInvitar(invitador: { esRoot: boolean; rolesEnAmbito: Rol[] }, rolInvitado: Rol): boolean {
  if (invitador.esRoot && ROLES_DE_ROOT.includes(rolInvitado)) return true
  if (invitador.rolesEnAmbito.includes('OWNER')) return true
  if (invitador.rolesEnAmbito.includes('GERENTE')) return ROLES_DE_GERENTE.includes(rolInvitado)
  return false
}
