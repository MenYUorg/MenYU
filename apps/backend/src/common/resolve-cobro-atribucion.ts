import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { JwtPayload } from '../auth/auth.service'

export interface AtribucionCobro {
  mozoId: string | null
  adminId: string | null
}

// Único lugar donde se decide quién queda como responsable de un cobro. La autoría sale del
// JWT y nunca del body, compartido entre SessionsService (registrarCobro) y PaymentsService
// (confirmarEfectivo) para que no queden dos reglas que puedan desincronizarse.
//
//  - mozo:  mozoId = su sub; mozoIdBody se ignora; adminId null.
//  - admin: adminId = su sub; mozoId = mozoIdBody solo si viene, el mozo existe (400 si no) y
//           es del restaurante de la sesión (403 si no); si no viene, null.
//
// Asume que el acceso al restaurante ya se validó con assertStaffAccess.
export async function resolveCobroAtribucion(
  prisma: PrismaService,
  user: JwtPayload,
  restauranteId: string,
  mozoIdBody?: string | null,
): Promise<AtribucionCobro> {
  if (user.tipo === 'mozo') return { mozoId: user.sub, adminId: null }
  if (user.tipo !== 'admin') {
    throw new ForbiddenException('Solo el staff puede registrar un cobro')
  }

  if (!mozoIdBody) return { mozoId: null, adminId: user.sub }

  const mozo = await prisma.mozo.findUnique({
    where: { id: mozoIdBody },
    select: { restauranteId: true },
  })
  if (!mozo) throw new BadRequestException('El mozo indicado no existe')
  if (mozo.restauranteId !== restauranteId) {
    throw new ForbiddenException('El mozo indicado no pertenece a este restaurante')
  }
  return { mozoId: mozoIdBody, adminId: user.sub }
}
