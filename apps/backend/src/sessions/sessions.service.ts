import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { PrismaService } from '../prisma/prisma.service'
import { UsersService } from '../users/users.service'
import { JwtPayload } from '../auth/auth.service'
import { OpenSessionDto } from './dto/open-session.dto'

interface SessionJwtPayload {
  sub: string
  tipo: 'cliente'
  sesionId: string
  mesaId: string
  restauranteId: string
}

interface OpenSessionResult {
  sesionId: string
  mesaId: string
  codigoSesion: string
  clienteId: string
  jwt: string
  esAnfitrion: boolean
}

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async open(dto: OpenSessionDto, authHeader?: string): Promise<OpenSessionResult> {
    if (!dto.tableCode && (!dto.restaurantId || !dto.pin)) {
      throw new BadRequestException('Debe proveer tableCode o restaurantId + pin')
    }

    const clienteId = await this.resolveClienteId(authHeader)
    const mesa = await this.resolveMesa(dto)

    const sesionActiva = await this.prisma.sesionMesa.findFirst({
      where: { mesaId: mesa.id, estado: 'activa' },
    })

    let sesionId: string
    let codigoSesion: string
    let esAnfitrion: boolean

    if (!sesionActiva) {
      codigoSesion = this.generateCodigoSesion()
      const sesion = await this.prisma.sesionMesa.create({
        data: {
          mesaId: mesa.id,
          clienteId,
          codigoSesion,
          participantes: { create: { clienteId, orden: 1 } },
        },
      })
      sesionId = sesion.id
      esAnfitrion = true
    } else {
      sesionId = sesionActiva.id
      codigoSesion = sesionActiva.codigoSesion
      esAnfitrion = false

      if (mesa.restaurante.modoSesion === 'seguro') {
        if (!dto.codigoSesion) {
          throw new ForbiddenException('Esta mesa requiere código de sesión para unirse')
        }
        if (dto.codigoSesion !== codigoSesion) {
          throw new ForbiddenException('Código de sesión incorrecto')
        }
      }

      const yaParticipa = await this.prisma.sesionMesaCliente.findUnique({
        where: { sesionId_clienteId: { sesionId, clienteId } },
      })

      if (!yaParticipa) {
        const count = await this.prisma.sesionMesaCliente.count({
          where: { sesionId },
        })
        await this.prisma.sesionMesaCliente.create({
          data: { sesionId, clienteId, orden: count + 1 },
        })
      }
    }

    const payload: SessionJwtPayload = {
      sub: clienteId,
      tipo: 'cliente',
      sesionId,
      mesaId: mesa.id,
      restauranteId: mesa.restauranteId,
    }

    return {
      sesionId,
      mesaId: mesa.id,
      codigoSesion,
      clienteId,
      jwt: this.jwt.sign(payload),
      esAnfitrion,
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private async resolveClienteId(authHeader?: string): Promise<string> {
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7)
      try {
        const payload = this.jwt.verify<JwtPayload>(token)
        if (payload.tipo === 'cliente' && payload.sub) {
          const exists = await this.users.findClienteById(payload.sub)
          if (exists) return payload.sub
        }
      } catch {
        // token inválido o expirado — continuar como invitado
      }
    }
    const guest = await this.users.createCliente({ nombre: 'Invitado' })
    return guest.id
  }

  private async resolveMesa(dto: OpenSessionDto) {
    const where = dto.tableCode
      ? { qrToken: dto.tableCode, activo: true }
      : { restauranteId: dto.restaurantId!, pin: dto.pin!, activo: true }

    const mesa = await this.prisma.mesa.findFirst({
      where,
      include: { restaurante: { select: { modoSesion: true } } },
    })

    if (!mesa) throw new NotFoundException('Mesa no encontrada')
    return mesa
  }

  private generateCodigoSesion(): string {
    return String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')
  }
}
