import { ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { JwtPayload } from '../auth/auth.service'

// Chequeo de "¿este usuario es el OWNER de esta marca?" para lo que solo el OWNER puede hacer
// (logo de la marca, logo y dirección de un restaurante). Por la regla de ROOT, ni ROOT ni
// GERENTE pasan: a diferencia de assert-staff-access, acá no hay ningún bypass.
export async function assertOwnerDeMarca(
  prisma: PrismaService,
  marcaId: string,
  user: JwtPayload,
): Promise<void> {
  if (user.rol !== 'OWNER') {
    throw new ForbiddenException('Solo el owner de la marca puede hacer esto')
  }
  const admin = await prisma.admin.findUnique({
    where: { id: user.sub },
    select: { marcaId: true },
  })
  if (!admin || admin.marcaId !== marcaId) {
    throw new ForbiddenException('No tenés acceso a esta marca')
  }
}

export interface RestauranteDeOwner {
  id: string
  marcaId: string
  activo: boolean
  logoUrl: string | null
}

// Igual que assertOwnerDeMarca pero a partir de un restaurante: valida que pertenezca a la marca
// del OWNER y lo devuelve para no tener que volver a pedirlo.
export async function assertOwnerDeRestaurante(
  prisma: PrismaService,
  restauranteId: string,
  user: JwtPayload,
): Promise<RestauranteDeOwner> {
  if (user.rol !== 'OWNER') {
    throw new ForbiddenException('Solo el owner de la marca puede hacer esto')
  }
  const [admin, restaurante] = await Promise.all([
    prisma.admin.findUnique({ where: { id: user.sub }, select: { marcaId: true } }),
    prisma.restaurante.findUnique({
      where: { id: restauranteId },
      select: { id: true, marcaId: true, activo: true, logoUrl: true },
    }),
  ])
  if (!admin || !restaurante || admin.marcaId !== restaurante.marcaId) {
    throw new ForbiddenException('No tenés acceso a este restaurante')
  }
  return restaurante
}
