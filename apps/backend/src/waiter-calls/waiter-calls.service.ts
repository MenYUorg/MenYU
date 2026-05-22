import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { PrismaService } from '../prisma/prisma.service'
import { MenyuGateway } from '../gateway/menyu.gateway'
import { CreateWaiterCallDto } from './dto/create-waiter-call.dto'

interface SessionJwt {
  sub: string
  tipo: string
  sesionId: string
  mesaId: string
  restauranteId: string
}

@Injectable()
export class WaiterCallsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly gateway: MenyuGateway,
  ) {}

  async llamar(dto: CreateWaiterCallDto, authHeader: string | undefined) {
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Session JWT requerido')
    }

    let payload: SessionJwt
    try {
      payload = this.jwt.verify<SessionJwt>(authHeader.slice(7))
    } catch {
      throw new UnauthorizedException('Session JWT inválido o expirado')
    }

    if (payload.tipo !== 'cliente') {
      throw new UnauthorizedException('Solo clientes pueden llamar al mozo')
    }

    const { restauranteId } = payload

    // a. Verificar sesión activa con mesa
    const sesion = await this.prisma.sesionMesa.findUnique({
      where: { id: dto.sesionId },
      include: { mesa: { select: { numero: true } } },
    })
    if (!sesion) throw new NotFoundException('Sesión no encontrada')
    if (sesion.estado !== 'activa') {
      throw new BadRequestException('La sesión no está activa')
    }

    // b. Persistir llamado (un pendiente por sesión a la vez)
    await this.prisma.llamadoMozo.deleteMany({
      where: { sesionId: dto.sesionId, estado: 'pendiente' },
    })
    await this.prisma.llamadoMozo.create({
      data: { sesionId: dto.sesionId },
    })

    // c. Emitir evento al mozo
    this.gateway.emitMozoCalled(restauranteId, {
      sesionId: dto.sesionId,
      mesaNumero: sesion.mesa.numero,
    })

    return { ok: true }
  }
}
