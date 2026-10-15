import { ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { JwtPayload } from '../auth/auth.service'

// Único chequeo de "¿este usuario de staff puede operar sobre este restaurante?",
// compartido entre SessionsService y PaymentsService para que no queden dos
// implementaciones que puedan desincronizarse (mismo criterio que
// runSerializableTransaction).
export async function assertStaffAccess(
  prisma: PrismaService,
  restauranteId: string,
  user: JwtPayload,
): Promise<void> {
  if (user.tipo === 'mozo') {
    if (user.restauranteId !== restauranteId) {
      throw new ForbiddenException('No tenés acceso a este restaurante')
    }
    return
  }
  await assertAdminAccess(prisma, restauranteId, user)
}

async function assertAdminAccess(
  prisma: PrismaService,
  restauranteId: string,
  user: JwtPayload,
): Promise<void> {
  if (user.rol === 'ROOT') return
  if (user.rol === 'OWNER') {
    const admin = await prisma.admin.findUnique({ where: { id: user.sub } })
    const restaurante = await prisma.restaurante.findUnique({ where: { id: restauranteId } })
    if (!admin || !restaurante || admin.marcaId !== restaurante.marcaId) {
      throw new ForbiddenException('No tenés acceso a este restaurante')
    }
    return
  }
  if (user.rol === 'GERENTE') {
    const asignacion = await prisma.adminRestaurante.findUnique({
      where: { adminId_restauranteId: { adminId: user.sub, restauranteId } },
    })
    if (!asignacion) throw new ForbiddenException('No tenés acceso a este restaurante')
    return
  }
  throw new ForbiddenException('No tenés acceso a este restaurante')
}
