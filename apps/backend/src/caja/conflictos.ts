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

export const MENSAJE_TURNO_ABIERTO = 'Ya hay un turno abierto en este restaurante'
export const MENSAJE_CAJA_YA_ABIERTA = 'La caja ya está abierta'

/**
 * Los choques de una apertura: los dos índices únicos parciales (`turno_restaurante_id_abierto_key` y
 * `turno_caja_caja_id_abierta_key`) y el P2034. Lo demás pasa tal cual.
 */
export function traducirConflictoDeApertura(err: unknown): unknown {
  if (esUnicoViolado(err, 'Turno', ['restaurante_id'])) return new ConflictException(MENSAJE_TURNO_ABIERTO)
  if (esUnicoViolado(err, 'TurnoCaja', ['caja_id'])) return new ConflictException(MENSAJE_CAJA_YA_ABIERTA)
  return traducirOperacionSimultanea(err)
}

/** Un turno cerrado no admite cambios. */
export const MENSAJE_TURNO_CERRADO = 'El turno está cerrado'

/**
 * Los choques de una reasignación: dos reemplazos a la vez pueden chocar en el único (turno_id, mesa_id) o en la
 * serialización. Los dos son el 409 genérico; lo demás pasa tal cual.
 */
export function traducirConflictoDeReasignacion(err: unknown): unknown {
  if (esUnicoViolado(err, 'AsignacionTurno', ['turno_id', 'mesa_id'])) return new ConflictException(MENSAJE_OPERACION_SIMULTANEA)
  return traducirOperacionSimultanea(err)
}

/**
 * Los choques de un cierre: si dos cierres chocan en el único (turno_caja_id, metodo) del arqueo, el que pierde ve que
 * el turno ya se cerró. El P2034 es el 409 genérico; lo demás pasa tal cual.
 */
export function traducirConflictoDeCierre(err: unknown): unknown {
  if (esUnicoViolado(err, 'ArqueoMetodo', ['turno_caja_id', 'metodo'])) return new ConflictException(MENSAJE_TURNO_CERRADO)
  return traducirOperacionSimultanea(err)
}
