import { PrismaService } from '../prisma/prisma.service'
import { JwtPayload } from '../auth/auth.service'

/**
 * Mock de PrismaService para tests unitarios de services.
 *
 * Cada `prisma.<modelo>.<método>` es un `jest.fn()` que se crea la primera vez que se usa, así cada
 * test configura solo lo que necesita (`prisma.mozo.findUnique.mockResolvedValue(...)`) sin declarar
 * a mano todos los modelos. `$transaction` ejecuta el callback con el mismo mock o resuelve el array
 * de operaciones, como la transacción real.
 */
export type PrismaMock = Record<string, Record<string, jest.Mock>> & {
  $transaction: jest.Mock
  $queryRaw: jest.Mock
}

export function crearPrismaMock(): PrismaMock {
  const modelos = new Map<string, Record<string, jest.Mock>>()
  const raiz: Record<string, unknown> = {
    $queryRaw: jest.fn(),
  }
  const mock = new Proxy(raiz, {
    get(target, clave: string) {
      if (clave in target) return target[clave]
      if (!modelos.has(clave)) {
        modelos.set(
          clave,
          new Proxy({} as Record<string, jest.Mock>, {
            get(metodos, metodo: string) {
              if (!(metodo in metodos)) metodos[metodo] = jest.fn()
              return metodos[metodo]
            },
          }),
        )
      }
      return modelos.get(clave)
    },
  }) as unknown as PrismaMock
  raiz.$transaction = jest.fn((arg: unknown) =>
    typeof arg === 'function' ? arg(mock) : Promise.all(arg as Promise<unknown>[]),
  )
  return mock
}

/** El mock con el tipo que esperan los constructores de los services. */
export function comoPrisma(mock: PrismaMock): PrismaService {
  return mock as unknown as PrismaService
}

// Usuarios del JWT de admin que se repiten en los tests de permisos.
export const OWNER: JwtPayload = { sub: 'admin-owner', tipo: 'admin', rol: 'OWNER' }
export const GERENTE: JwtPayload = { sub: 'admin-gerente', tipo: 'admin', rol: 'GERENTE' }

/**
 * Configura el mock para que `OWNER` sea dueño de la marca del restaurante `restauranteId`
 * (admin.marcaId === restaurante.marcaId), que es el chequeo de pertenencia de los services.
 */
export function ownerDeLaMarca(prisma: PrismaMock, restauranteId = 'rest-1') {
  prisma.admin.findUnique.mockResolvedValue({ id: OWNER.sub, marcaId: 'marca-1' })
  prisma.restaurante.findUnique.mockResolvedValue({ id: restauranteId, marcaId: 'marca-1', activo: true })
}

/** Configura el mock para que `OWNER` sea de otra marca que la del restaurante. */
export function ownerDeOtraMarca(prisma: PrismaMock, restauranteId = 'rest-1') {
  prisma.admin.findUnique.mockResolvedValue({ id: OWNER.sub, marcaId: 'otra-marca' })
  prisma.restaurante.findUnique.mockResolvedValue({ id: restauranteId, marcaId: 'marca-1', activo: true })
}
