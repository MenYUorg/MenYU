import { JwtPayload } from '../auth/auth.service'
import { PrismaMock, crearPrismaMock } from './prisma-mock'

/** La cuenta ROOT que "inicia sesión" en los tests de la consola. */
export const ROOT_USER: JwtPayload = { sub: 'root-1', tipo: 'admin', rol: 'ROOT' }
export const EMAIL_DEL_ROOT = 'ana@ejemplo.com'

/**
 * Un `prisma` y una transacción DISTINTOS. `$transaction` le pasa al callback el `tx`, no el `prisma`: así los tests pueden afirmar
 * que el cambio y el registro del historial se escriben con el cliente de la transacción y que nada se escribe por fuera
 * (`expect(prisma.admin.create).not.toHaveBeenCalled()`), que es lo que hace que un fallo del historial revierta el cambio.
 *
 * El `tx` ya viene con la cuenta ROOT que actúa (la lee `HistorialRootService.actorDe`) y con el historial aceptando escrituras.
 */
export function armarTransaccionRoot(): { prisma: PrismaMock; tx: PrismaMock } {
  const prisma = crearPrismaMock()
  const tx = crearPrismaMock()
  prisma.$transaction.mockImplementation((fn: (cliente: PrismaMock) => Promise<unknown>) => fn(tx))
  tx.admin.findUnique.mockResolvedValue({ id: ROOT_USER.sub, email: EMAIL_DEL_ROOT, rol: 'ROOT' })
  tx.historialRoot.create.mockResolvedValue({ id: 1 })
  tx.refreshToken.updateMany.mockResolvedValue({ count: 0 })
  return { prisma, tx }
}

/** Lo que se escribió en el historial, fila por fila. */
export function filasDelHistorial(tx: PrismaMock): Array<Record<string, any>> {
  return tx.historialRoot.create.mock.calls.map(([args]) => args.data)
}

/**
 * Todo lo que se le pidió a la base (consultas y escrituras), serializado. Para afirmar que una contraseña o un hash no
 * aparecen en ninguna parte del historial.
 */
export function serializar(valor: unknown): string {
  return JSON.stringify(valor)
}
