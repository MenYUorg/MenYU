import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { UpdateInformacionLocalDto } from './dto/update-informacion-local.dto'

/** Lo que ve el panel, sin el id de la fila: el recurso es el restaurante. */
const INFORMACION_LOCAL_SELECT = {
  asistenteHabilitado: true,
  horarios: true,
  formasPago: true,
  wifi: true,
  petFriendly: true,
  accesibleSillaRuedas: true,
  opcionesParaChicos: true,
  estacionamiento: true,
} satisfies Prisma.InformacionLocalSelect

type Informacion = Prisma.InformacionLocalGetPayload<{ select: typeof INFORMACION_LOCAL_SELECT }>

/** Respuesta de `GET` y `PUT /restaurantes/:restauranteId/informacion-local`. */
export type InformacionDelLocal = Informacion & { restauranteId: string }

/** Sin fila no hay nada cargado y el asistente está apagado. */
const SIN_CARGAR: Informacion = {
  asistenteHabilitado: false,
  horarios: null,
  formasPago: null,
  wifi: null,
  petFriendly: null,
  accesibleSillaRuedas: null,
  opcionesParaChicos: null,
  estacionamiento: null,
}

/** La información del local para el asistente. El rol en el restaurante (OWNER o GERENTE) lo exige la ruta. */
@Injectable()
export class InformacionLocalService {
  constructor(private readonly prisma: PrismaService) {}

  async obtener(restauranteId: string): Promise<InformacionDelLocal> {
    const informacion = await this.prisma.informacionLocal.findUnique({
      where: { restauranteId },
      select: INFORMACION_LOCAL_SELECT,
    })
    return { restauranteId, ...(informacion ?? SIN_CARGAR) }
  }

  /** Upsert parcial: lo que no viene en el DTO no cambia y null lo borra. */
  async guardar(restauranteId: string, dto: UpdateInformacionLocalDto): Promise<InformacionDelLocal> {
    const informacion = await this.prisma.informacionLocal.upsert({
      where: { restauranteId },
      create: { ...dto, restauranteId },
      update: { ...dto },
      select: INFORMACION_LOCAL_SELECT,
    })
    return { restauranteId, ...informacion }
  }
}
