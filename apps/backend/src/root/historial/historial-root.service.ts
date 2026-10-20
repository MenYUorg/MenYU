import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { JwtPayload } from '../../auth/auth.service'
import { PrismaService } from '../../prisma/prisma.service'
import { comoTextoLiteral } from '../comun/cuentas'
import { RootCambio, RootHistorialItem, RootHistorialPagina } from '../root.types'
import { POR_PAGINA } from './dto/listar-historial.dto'
import { ActorHistorial, EntradaHistorial, registrarEnHistorial } from './registrar-historial'

/** Los filtros de la pantalla del historial (docs/plan-consola-root.md, 7.2). Todos opcionales. */
export interface FiltrosHistorial {
  /** El email de una cuenta ROOT, o `script`. */
  actor?: string
  entidad?: 'MARCA' | 'RESTAURANTE' | 'OWNER' | 'ROOT'
  /** `YYYY-MM-DD`: desde el principio de ese día en Buenos Aires. */
  desde?: string
  /** `YYYY-MM-DD`: hasta el final de ese día en Buenos Aires. */
  hasta?: string
  /** El `siguiente` de la página anterior. */
  cursor?: number
}

// Buenos Aires no tiene horario de verano desde 2009: siempre UTC-3 (los reportes usan la misma zona).
const ZONA_DE_LA_APP = '-03:00'

// Lo único que sale del historial: nada de más.
const SELECT_HISTORIAL = {
  id: true,
  createdAt: true,
  actorTipo: true,
  actorNombre: true,
  accion: true,
  entidadTipo: true,
  entidadId: true,
  entidadNombre: true,
  marcaId: true,
  marcaNombre: true,
  detalle: true,
} satisfies Prisma.HistorialRootSelect

type FilaHistorial = Prisma.HistorialRootGetPayload<{ select: typeof SELECT_HISTORIAL }>

/** `YYYY-MM-DD` de un día que existe (no el 31 de febrero). */
function diaValido(dia: string): boolean {
  const [anio, mes, d] = dia.split('-').map(Number)
  const fecha = new Date(Date.UTC(anio, mes - 1, d))
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === d
}

function limiteDelDia(dia: string, campo: 'desde' | 'hasta'): Date {
  if (!diaValido(dia)) throw new BadRequestException(`${campo} no es una fecha que exista (${dia})`)
  return new Date(campo === 'desde' ? `${dia}T00:00:00.000${ZONA_DE_LA_APP}` : `${dia}T23:59:59.999${ZONA_DE_LA_APP}`)
}

/** El detalle viene de una columna JSON: se lee con cuidado y se devuelve siempre una lista bien formada. */
function aCambios(detalle: Prisma.JsonValue): RootCambio[] {
  if (!Array.isArray(detalle)) return []
  return detalle.flatMap((cambio) => {
    if (cambio === null || typeof cambio !== 'object' || Array.isArray(cambio) || typeof cambio.campo !== 'string') return []
    return [
      {
        campo: cambio.campo,
        antes: typeof cambio.antes === 'string' ? cambio.antes : null,
        despues: typeof cambio.despues === 'string' ? cambio.despues : null,
      },
    ]
  })
}

function aItem(fila: FilaHistorial): RootHistorialItem {
  return {
    id: fila.id,
    cuando: fila.createdAt.toISOString(),
    actorTipo: fila.actorTipo === 'SCRIPT' ? 'SCRIPT' : 'ROOT',
    actorNombre: fila.actorNombre,
    accion: fila.accion,
    entidadTipo: fila.entidadTipo as RootHistorialItem['entidadTipo'],
    entidadId: fila.entidadId,
    entidadNombre: fila.entidadNombre,
    marcaId: fila.marcaId,
    marcaNombre: fila.marcaNombre,
    cambios: aCambios(fila.detalle),
  }
}

/**
 * Historial de acciones de ROOT. Solo tiene tres cosas a propósito: `actorDe`, `registrar` y `listar`. No hay `actualizar` ni
 * `borrar` (la base además lo impide con disparadores).
 */
@Injectable()
export class HistorialRootService {
  constructor(private readonly prisma: PrismaService) {}

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

  /**
   * El historial, de lo más nuevo a lo más viejo, de a 50 con cursor. Es de solo lectura: el orden es por `id` (que crece con cada
   * registro), así que "las siguientes" son las de `id` menor al cursor y una acción nueva nunca corre la página.
   */
  async listar(filtros: FiltrosHistorial): Promise<RootHistorialPagina> {
    const where: Prisma.HistorialRootWhereInput = {}

    if (filtros.actor) {
      if (filtros.actor.toLowerCase() === 'script') {
        where.actorTipo = 'SCRIPT'
      } else {
        where.actorTipo = 'ROOT'
        where.actorNombre = { equals: comoTextoLiteral(filtros.actor), mode: 'insensitive' }
      }
    }
    if (filtros.entidad) where.entidadTipo = filtros.entidad

    if (filtros.desde || filtros.hasta) {
      const desde = filtros.desde ? limiteDelDia(filtros.desde, 'desde') : undefined
      const hasta = filtros.hasta ? limiteDelDia(filtros.hasta, 'hasta') : undefined
      if (desde && hasta && desde > hasta) throw new BadRequestException('desde no puede ser posterior a hasta')
      where.createdAt = { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) }
    }
    if (filtros.cursor) where.id = { lt: filtros.cursor }

    // Se pide una de más para saber si hay otra página sin hacer un conteo.
    const filas = await this.prisma.historialRoot.findMany({
      where,
      orderBy: { id: 'desc' },
      take: POR_PAGINA + 1,
      select: SELECT_HISTORIAL,
    })
    const hayMas = filas.length > POR_PAGINA
    const pagina = hayMas ? filas.slice(0, POR_PAGINA) : filas
    return { items: pagina.map(aItem), siguiente: hayMas ? pagina[pagina.length - 1].id : null }
  }
}
