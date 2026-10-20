import { Injectable, UnauthorizedException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { JwtPayload } from '../../auth/auth.service'
import { ActorHistorial, EntradaHistorial, registrarEnHistorial } from './registrar-historial'

/**
 * Historial de acciones de ROOT. Solo tiene dos cosas a propósito: `actorDe` y `registrar`. No hay `actualizar` ni `borrar` (la
 * base además lo impide con disparadores). La lectura (`GET /root/historial`, con filtros y cursor) llega en la etapa 1b.
 */
@Injectable()
export class HistorialRootService {
  /**
   * La cuenta ROOT que actúa, leída de la base DENTRO de la transacción del cambio. El token puede estar vigente hasta 8 horas
   * después de que la cuenta se retiró o dejó de ser ROOT: en ese caso no se hace nada (401), y el email que queda en el historial
   * es el de ahora, no el que dice el token.
   */
  async actorDe(tx: Pick<Prisma.TransactionClient, 'admin'>, user: JwtPayload): Promise<Extract<ActorHistorial, { tipo: 'ROOT' }>> {
    const cuenta = await tx.admin.findUnique({ where: { id: user.sub }, select: { id: true, email: true, rol: true } })
    if (!cuenta || cuenta.rol !== 'ROOT') throw new UnauthorizedException('Tu cuenta ROOT ya no existe')
    return { tipo: 'ROOT', id: cuenta.id, nombre: cuenta.email }
  }

  /** Escribe la acción con el cliente de la transacción del cambio: si esto falla, el cambio no se hace. */
  registrar(tx: Pick<Prisma.TransactionClient, 'historialRoot'>, entrada: EntradaHistorial): Promise<void> {
    return registrarEnHistorial(tx, entrada)
  }
}
