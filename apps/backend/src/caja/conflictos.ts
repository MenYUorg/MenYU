import { ConflictException } from '@nestjs/common'
import { Prisma } from '@prisma/client'

/** Un P2034 que sobrevivió al reintento de runSerializableTransaction: no se sabe con qué chocó. */
export const MENSAJE_OPERACION_SIMULTANEA = 'Otra operación modificó esto al mismo tiempo; probá de nuevo'

/**
 * Si el error es el P2002 de un único de `modelo` sobre exactamente esas `columnas`. Con Prisma 6.19.3 y el adapter de
 * pg, `meta.target` trae las columnas y no el nombre del índice, también para los únicos parciales
 * (caja-schema.e2e-spec.ts).
 */
export function esUnicoViolado(err: unknown, modelo: string, columnas: string[]): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return false
  const meta = err.meta as { modelName?: unknown; target?: unknown } | undefined
  const target = meta?.target
  return (
    meta?.modelName === modelo &&
    Array.isArray(target) &&
    target.length === columnas.length &&
    columnas.every((columna, i) => target[i] === columna)
  )
}

/** Un conflicto de serialización (P2034). */
export function esOperacionSimultanea(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034'
}

/** El 409 genérico de un P2034, o el error tal cual. */
export function traducirOperacionSimultanea(err: unknown): unknown {
  return esOperacionSimultanea(err) ? new ConflictException(MENSAJE_OPERACION_SIMULTANEA) : err
}
