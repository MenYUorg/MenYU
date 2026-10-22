import { PrismaService } from '../prisma/prisma.service'

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
