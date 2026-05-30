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
    const llamado = await this.prisma.llamadoMozo.create({
      data: { sesionId: dto.sesionId, motivo: dto.motivo ?? 'general' },
    })

    // c. Emitir evento al mozo
    this.gateway.emitMozoCalled(restauranteId, {
      llamadoId: llamado.id,
      sesionId: dto.sesionId,
      mesaNumero: sesion.mesa.numero,
      motivo: llamado.motivo ?? 'general',
    })

    return { ok: true }
  }

  async atender(id: string, authHeader: string | undefined) {
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('JWT de mozo requerido')
    }

    let payload: { sub: string; tipo: string }
    try {
      payload = this.jwt.verify<{ sub: string; tipo: string }>(authHeader.slice(7))
    } catch {
      throw new UnauthorizedException('JWT inválido o expirado')
    }

    if (payload.tipo !== 'mozo') {
      throw new UnauthorizedException('Solo mozos pueden atender llamados')
    }

    const llamado = await this.prisma.llamadoMozo.findUnique({ where: { id } })
    if (!llamado) throw new NotFoundException('Llamado no encontrado')
    if (llamado.estado !== 'pendiente') throw new BadRequestException('Este llamado ya fue atendido')

    return this.prisma.llamadoMozo.update({
      where: { id },
      data: { estado: 'atendido', mozoId: payload.sub },
    })
  }
}
