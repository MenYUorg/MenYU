import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { CUENTAS } from './acceso-de-test'
import { SIN_USUARIO } from './app-endpoints'
import { PrismaMock, crearPrismaMock } from './prisma-mock'

/** La cuenta ROOT que "inicia sesión" en los tests de la consola. */
export const ROOT_USER: UsuarioAutenticado = CUENTAS.ROOT

/**
 * Las cuentas que no entran a la consola (403): el personal de cada rol, una cuenta sin membresías y una de Supabase sin
 * `Usuario`, como la de un cliente registrado.
 */
export const NO_ROOT = [
  ['OWNER', CUENTAS.OWNER_A],
  ['GERENTE', CUENTAS.GERENTE],
  ['JEFE_SALON', CUENTAS.JEFE_SALON],
  ['MOZO', CUENTAS.MOZO],
  ['COCINA', CUENTAS.COCINA],
  ['sin membresías', CUENTAS.SIN_MEMBRESIAS],
  ['sin Usuario (un cliente registrado)', SIN_USUARIO],
] as const
/** El email de esa cuenta en la base, distinto del de la sesión: el historial guarda el de la base. */
export const EMAIL_DEL_ROOT = 'ana@ejemplo.com'

/**
 * Un `prisma` y una transacción DISTINTOS. `$transaction` le pasa al callback el `tx`, no el `prisma`: así los tests pueden afirmar
 * que el cambio y el registro del historial se escriben con el cliente de la transacción y que nada se escribe por fuera
 * (`expect(prisma.membresia.create).not.toHaveBeenCalled()`), que es lo que hace que un fallo del historial revierta el cambio.
 *
 * El `tx` ya viene con la cuenta ROOT que actúa (la lee `HistorialRootService.actorDe`) y con el historial aceptando escrituras.
 */
export function armarTransaccionRoot(): { prisma: PrismaMock; tx: PrismaMock } {
  const prisma = crearPrismaMock()
  const tx = crearPrismaMock()
  prisma.$transaction.mockImplementation((fn: (cliente: PrismaMock) => Promise<unknown>) => fn(tx))
  tx.usuario.findUnique.mockResolvedValue({ id: ROOT_USER.id, email: EMAIL_DEL_ROOT, esRoot: true, activo: true })
  tx.historialRoot.create.mockResolvedValue({ id: 1 })
  return { prisma, tx }
}

/** Lo que se escribió en el historial, fila por fila. */
export function filasDelHistorial(tx: PrismaMock): Array<Record<string, any>> {
  return tx.historialRoot.create.mock.calls.map(([args]) => args.data)
}

/** Una respuesta o un registro, serializado: para afirmar que un dato que no tiene que salir no aparece en ninguna parte. */
export function serializar(valor: unknown): string {
  return JSON.stringify(valor)
}
