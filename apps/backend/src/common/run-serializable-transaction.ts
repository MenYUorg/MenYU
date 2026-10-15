import { Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

const logger = new Logger('runSerializableTransaction')

// Mismo bloque de código que se necesitaba en PaymentsService, SessionsService
// y (Tarea 5) el service de cobro por comensal: reintenta una vez ante un
// conflicto de serialización (P2034) y deja pasar cualquier otro error.
// `contexto` identifica al método que llama, para poder rastrear en logs cuál
// operación chocó cuando dos transacciones serializables colisionan.
export async function runSerializableTransaction<T>(
  prisma: PrismaService,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  contexto: string,
): Promise<T> {
  try {
    return await prisma.$transaction(fn, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
      logger.warn(`[${contexto}] Conflicto de transacción serializable detectado, reintentando una vez`)
      return prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      })
    }
    throw err
  }
}
