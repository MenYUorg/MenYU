import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { runSerializableTransaction } from '../common/run-serializable-transaction'
import { PrismaService } from '../prisma/prisma.service'
import type { ConfiguracionDelAsistente } from './configuracion'

export interface IntentoDelAsistente {
  restauranteId: string
  /** Solo si la pregunta vino con sesión de mesa: identifica la mesa, no a una persona. */
  sesionMesaId: string | null
  /** Solo el último mensaje del usuario, no el historial. */
  pregunta: string
  modelo: string
}

export interface ResultadoDelIntento {
  respuesta: string
  tokensEntrada: number | null
  tokensSalida: number | null
  duracionMs: number
}

/** Los límites que se cuentan en `RegistroAsistente`. */
export type LimitesDelRegistro = Pick<ConfiguracionDelAsistente, 'maxPreguntasSesion' | 'maxPreguntasDia'>

/** La fila del intento, o lo que lo frenó (sin insertar nada). */
export type InicioDelIntento =
  | { ok: true; id: string }
  | { ok: false; codigo: 'limite_sesion' | 'no_disponible_hoy' | 'no_disponible_momentaneamente' }

/** El inicio del día UTC: el tope diario es presupuestario, no de UX (docs/asistente/specs/asistente.md). */
export function inicioDelDiaUtc(ahora = new Date()): Date {
  return new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()))
}

/**
 * Una fila de `RegistroAsistente` por pregunta: el log de evaluación y la fuente de los límites por sesión y diario, que
 * así sobreviven a un reinicio. Es anónimo: no guarda la IP ni el historial.
 */
@Injectable()
export class RegistroAsistenteService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Antes de llamar al modelo: el intento cuenta para los límites aunque el modelo falle. Primero el límite de la sesión
   * (si vino con una) y después el tope diario, entre todos los restaurantes. Los conteos y el insert van en la misma
   * transacción serializable: una ráfaga de pedidos en paralelo no pasa contando todos antes de que se inserte el primero.
   * Si la transacción vuelve a chocar después del reintento de `runSerializableTransaction`, el intento no se registra ni
   * llega al modelo: `no_disponible_momentaneamente` (se limita de más, nunca de menos).
   */
  async iniciar(intento: IntentoDelAsistente, limites: LimitesDelRegistro): Promise<InicioDelIntento> {
    try {
      return await this.contarYRegistrar(intento, limites)
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        return { ok: false, codigo: 'no_disponible_momentaneamente' }
      }
      throw error
    }
  }

  /** Al terminar el stream. Si el modelo falló, no se llama: la fila queda con la respuesta en null. */
  async completar(id: string, resultado: ResultadoDelIntento): Promise<void> {
    await this.prisma.registroAsistente.update({ where: { id }, data: resultado })
  }

  private contarYRegistrar(intento: IntentoDelAsistente, limites: LimitesDelRegistro): Promise<InicioDelIntento> {
    return runSerializableTransaction(
      this.prisma,
      async (tx): Promise<InicioDelIntento> => {
        if (intento.sesionMesaId) {
          const deLaSesion = await tx.registroAsistente.count({ where: { sesionMesaId: intento.sesionMesaId } })
          if (deLaSesion >= limites.maxPreguntasSesion) return { ok: false, codigo: 'limite_sesion' }
        }
        const delDia = await tx.registroAsistente.count({ where: { createdAt: { gte: inicioDelDiaUtc() } } })
        if (delDia >= limites.maxPreguntasDia) return { ok: false, codigo: 'no_disponible_hoy' }

        const { id } = await tx.registroAsistente.create({ data: intento, select: { id: true } })
        return { ok: true, id }
      },
      'RegistroAsistenteService.iniciar',
    )
  }
}
