import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

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

/**
 * Una fila de `RegistroAsistente` por pregunta: el log de evaluación y la fuente de los contadores de uso de la Fase 5.
 * Es anónimo: no guarda la IP ni el historial.
 */
@Injectable()
export class RegistroAsistenteService {
  constructor(private readonly prisma: PrismaService) {}

  /** Antes de llamar al modelo: el intento cuenta para los límites aunque el modelo falle. Devuelve el id de la fila. */
  async iniciar(intento: IntentoDelAsistente): Promise<string> {
    const { id } = await this.prisma.registroAsistente.create({ data: intento, select: { id: true } })
    return id
  }

  /** Al terminar el stream. Si el modelo falló, no se llama: la fila queda con la respuesta en null. */
  async completar(id: string, resultado: ResultadoDelIntento): Promise<void> {
    await this.prisma.registroAsistente.update({ where: { id }, data: resultado })
  }
}
