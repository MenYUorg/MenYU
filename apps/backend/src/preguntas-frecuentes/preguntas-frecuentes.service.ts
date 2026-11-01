import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { PreguntaFrecuenteDto } from './dto/pregunta-frecuente.dto'

const PREGUNTA_FRECUENTE_SELECT = {
  id: true,
  pregunta: true,
  respuesta: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PreguntaFrecuenteSelect

export type PreguntaFrecuente = Prisma.PreguntaFrecuenteGetPayload<{ select: typeof PREGUNTA_FRECUENTE_SELECT }>

/**
 * Las preguntas frecuentes del local para el asistente. El rol en el restaurante (OWNER o GERENTE) lo exige la ruta;
 * una pregunta de otro restaurante es un 404, como si no existiera.
 */
@Injectable()
export class PreguntasFrecuentesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Por fecha de creación (sin campo de orden en el MVP). */
  listar(restauranteId: string): Promise<PreguntaFrecuente[]> {
    return this.prisma.preguntaFrecuente.findMany({
      where: { restauranteId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: PREGUNTA_FRECUENTE_SELECT,
    })
  }

  crear(restauranteId: string, dto: PreguntaFrecuenteDto): Promise<PreguntaFrecuente> {
    return this.prisma.preguntaFrecuente.create({
      data: { restauranteId, pregunta: dto.pregunta, respuesta: dto.respuesta },
      select: PREGUNTA_FRECUENTE_SELECT,
    })
  }

  async actualizar(restauranteId: string, id: string, dto: PreguntaFrecuenteDto): Promise<PreguntaFrecuente> {
    await this.exigirDelRestaurante(restauranteId, id)
    return this.prisma.preguntaFrecuente.update({
      where: { id },
      data: { pregunta: dto.pregunta, respuesta: dto.respuesta },
      select: PREGUNTA_FRECUENTE_SELECT,
    })
  }

  async eliminar(restauranteId: string, id: string): Promise<void> {
    await this.exigirDelRestaurante(restauranteId, id)
    await this.prisma.preguntaFrecuente.delete({ where: { id } })
  }

  private async exigirDelRestaurante(restauranteId: string, id: string): Promise<void> {
    const pregunta = await this.prisma.preguntaFrecuente.findFirst({ where: { id, restauranteId }, select: { id: true } })
    if (!pregunta) throw new NotFoundException('Pregunta frecuente no encontrada')
  }
}
