import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { SALON } from '../auth/roles-del-personal'
import { AccesoService } from '../auth/supabase/acceso.service'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { PrismaService } from '../prisma/prisma.service'

export interface AtribucionDelCobro {
  /** La cuenta que registró el cobro: siempre la del usuario. */
  usuarioId: string
  /** El mozo a cuyo nombre queda, si hay. */
  mozoId: string | null
}

/**
 * A nombre de quién queda un cobro (issue #356). Exige OWNER, GERENTE, JEFE_SALON o MOZO del restaurante (403 si no).
 * - Un JEFE_SALON o un MOZO cobra con su propio `Mozo`, que sale de su cuenta (403 si no está activo). El `mozoId` del
 *   body se ignora: nadie cobra a nombre de otro mozo.
 * - Un OWNER o un GERENTE cobra a su nombre y puede atribuirle el cobro a un mozo activo de ese restaurante (400 si el
 *   mozo no existe o está dado de baja, 403 si es de otro restaurante).
 */
export async function atribucionDelCobro(
  prisma: PrismaService,
  acceso: AccesoService,
  usuario: UsuarioAutenticado,
  restauranteId: string,
  mozoIdDelBody?: string | null,
): Promise<AtribucionDelCobro> {
  const roles = await acceso.exigirRol(usuario.id, restauranteId, SALON)
  const administra = roles.includes('OWNER') || roles.includes('GERENTE')

  if (!administra) {
    const mozo = await acceso.exigirMozo(usuario.id, restauranteId)
    return { usuarioId: usuario.id, mozoId: mozo.id }
  }
  if (!mozoIdDelBody) return { usuarioId: usuario.id, mozoId: null }

  const mozo = await prisma.mozo.findUnique({ where: { id: mozoIdDelBody }, select: { restauranteId: true, activo: true } })
  if (!mozo?.activo) throw new BadRequestException('El mozo indicado no existe o está dado de baja')
  if (mozo.restauranteId !== restauranteId) {
    throw new ForbiddenException('El mozo indicado no pertenece a este restaurante')
  }
  return { usuarioId: usuario.id, mozoId: mozoIdDelBody }
}
