import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { PrismaService } from '../prisma/prisma.service'
import { UsersService } from '../users/users.service'
import { MenyuGateway } from '../gateway/menyu.gateway'
import { JwtPayload } from '../auth/auth.service'
import { OpenSessionDto } from './dto/open-session.dto'

interface SessionJwtPayload {
  sub: string
  tipo: 'cliente'
  sesionId: string
  mesaId: string
  restauranteId: string
}

export interface OpenStaffSessionResult {
  sesionId: string
  mesaId: string
  restauranteId: string
  codigoSesion: string
  numeroMesa: string
  esNueva: boolean
}

export interface OpenSessionResult {
  sesionId: string
  mesaId: string
  restauranteId: string
  codigoSesion: string
  clienteId: string
  jwt: string
  esAnfitrion: boolean
  numeroMesa: string
  modoSesion: string
}

export interface SessionActivaResult {
  sesionId: string
  creadaEn: string
  cantidadClientes: number
  totalAcumulado: number
  llamadoActivo: { id: string; motivo: string } | null
  pedidos: {
    id: string
    estado: string
    createdAt: string
    items: {
      id: string
      cantidad: number
      precioUnitario: number
      itemNombre: string
      modificaciones: { ingredienteNombre: string; tipo: string }[]
    }[]
  }[]
}

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly gateway: MenyuGateway,
  ) {}

  async openStaff(dto: { mesaId: string }, user: JwtPayload): Promise<OpenStaffSessionResult> {
    const mesa = await this.prisma.mesa.findUnique({
      where: { id: dto.mesaId },
      select: { id: true, numero: true, restauranteId: true, activo: true },
    })
    if (!mesa || !mesa.activo) throw new NotFoundException('Mesa no encontrada')

    await this.assertStaffAccess(mesa.restauranteId, user)

    const sesionActiva = await this.prisma.sesionMesa.findFirst({
      where: { mesaId: mesa.id, estado: 'activa' },
    })

    if (sesionActiva) {
      return {
        sesionId: sesionActiva.id,
        mesaId: mesa.id,
        restauranteId: mesa.restauranteId,
        codigoSesion: sesionActiva.codigoSesion,
        numeroMesa: mesa.numero,
        esNueva: false,
      }
    }

    const codigoSesion = this.generateCodigoSesion()
    const [sesion] = await this.prisma.$transaction([
      this.prisma.sesionMesa.create({
        data: { mesaId: mesa.id, clienteId: null, codigoSesion },
      }),
      this.prisma.mesa.update({
        where: { id: mesa.id },
        data: { estado: 'ocupada' },
      }),
    ])

    return {
      sesionId: sesion.id,
      mesaId: mesa.id,
      restauranteId: mesa.restauranteId,
      codigoSesion,
      numeroMesa: mesa.numero,
      esNueva: true,
    }
  }

  async open(dto: OpenSessionDto, authHeader?: string): Promise<OpenSessionResult> {
    if (!dto.tableCode && (!dto.restauranteId || !dto.pin)) {
      throw new BadRequestException('Debe proveer tableCode o restauranteId + pin')
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
      const [sesion] = await this.prisma.$transaction([
        this.prisma.sesionMesa.create({
          data: {
            mesaId: mesa.id,
            clienteId,
            codigoSesion,
            participantes: { create: { clienteId, orden: 1 } },
          },
        }),
        this.prisma.mesa.update({
          where: { id: mesa.id },
          data: { estado: 'ocupada' },
        }),
      ])
      sesionId = sesion.id
      esAnfitrion = true
    } else {
      sesionId     = sesionActiva.id
      codigoSesion = sesionActiva.codigoSesion

      // Si la sesión fue abierta por staff (clienteId = null),
      // el primer cliente real se convierte en anfitrión sin PIN.
      const esSesionStaff = sesionActiva.clienteId === null
      const yaHayParticipantes = await this.prisma.sesionMesaCliente.count({
        where: { sesionId: sesionActiva.id },
      }) > 0

      const esAnfitrionDeStaff = esSesionStaff && !yaHayParticipantes
      esAnfitrion = esAnfitrionDeStaff

      if (!esAnfitrionDeStaff && mesa.restaurante.modoSesion === 'seguro') {
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
        const count = await this.prisma.sesionMesaCliente.count({ where: { sesionId } })
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
      restauranteId: mesa.restauranteId,
      codigoSesion,
      clienteId,
      jwt: this.jwt.sign(payload),
      esAnfitrion,
      numeroMesa: mesa.numero,
      modoSesion: mesa.restaurante.modoSesion,
    }
  }

  async close(authHeader?: string): Promise<{ ok: boolean }> {
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Session JWT requerido')
    }

    let payload: SessionJwtPayload
    try {
      payload = this.jwt.verify<SessionJwtPayload>(authHeader.slice(7))
    } catch {
      throw new UnauthorizedException('Session JWT inválido o expirado')
    }

    if (payload.tipo !== 'cliente') {
      throw new UnauthorizedException('Solo clientes pueden cerrar sesiones de mesa')
    }

    const sesion = await this.prisma.sesionMesa.findUnique({ where: { id: payload.sesionId } })
    if (!sesion) throw new NotFoundException('Sesión no encontrada')
    if (sesion.estado !== 'activa') throw new BadRequestException('La sesión ya está cerrada')

    await this.prisma.$transaction([
      this.prisma.sesionMesa.update({
        where: { id: payload.sesionId },
        data: { estado: 'cerrada', cerradaEn: new Date() },
      }),
      this.prisma.mesa.update({
        where: { id: payload.mesaId },
        data: { estado: 'libre' },
      }),
    ])

    this.gateway.emitSesionCerrada(payload.restauranteId, payload.sesionId)

    return { ok: true }
  }

  async cerrarMesaAdmin(mesaId: string, user: JwtPayload): Promise<{ ok: boolean }> {
    const mesa = await this.prisma.mesa.findUnique({ where: { id: mesaId } })
    if (!mesa) throw new NotFoundException('Mesa no encontrada')
    await this.assertStaffAccess(mesa.restauranteId, user)

    const sesion = await this.prisma.sesionMesa.findFirst({
      where: { mesaId, estado: 'activa' },
    })
    if (!sesion) throw new NotFoundException('No hay sesión activa en esta mesa')

    await this.prisma.$transaction([
      this.prisma.sesionMesa.update({
        where: { id: sesion.id },
        data: { estado: 'cerrada', cerradaEn: new Date() },
      }),
      this.prisma.mesa.update({
        where: { id: mesaId },
        data: { estado: 'libre' },
      }),
    ])

    this.gateway.emitSesionCerrada(mesa.restauranteId, sesion.id)

    return { ok: true }
  }

  async getSessionActiva(mesaId: string, user: JwtPayload): Promise<SessionActivaResult | null> {
    const mesa = await this.prisma.mesa.findUnique({ where: { id: mesaId } })
    if (!mesa) throw new NotFoundException('Mesa no encontrada')
    await this.assertStaffAccess(mesa.restauranteId, user)

    const sesion = await this.prisma.sesionMesa.findFirst({
      where: { mesaId, estado: 'activa' },
    })
    if (!sesion) return null

    const [cantidadClientes, itemsParaTotal, llamadoActivoDb, pedidosDb] = await Promise.all([
      this.prisma.sesionMesaCliente.count({ where: { sesionId: sesion.id } }),
      this.prisma.pedidoItem.findMany({
        where: { pedido: { sesionId: sesion.id, estado: { not: 'cancelado' } } },
        select: { precioUnitario: true, cantidad: true },
      }),
      this.prisma.llamadoMozo.findFirst({
        where: { sesionId: sesion.id, estado: 'pendiente' },
        select: { id: true, motivo: true },
      }),
      this.prisma.pedido.findMany({
        where: { sesionId: sesion.id },
        orderBy: { createdAt: 'desc' },
        include: {
          items: {
            include: {
              item: { select: { nombre: true } },
              mods: {
                include: {
                  itemIngrediente: {
                    include: { ingrediente: { select: { nombre: true } } },
                  },
                },
              },
            },
          },
        },
      }),
    ])

    const totalAcumulado = itemsParaTotal.reduce(
      (acc, item) => acc + Number(item.precioUnitario) * item.cantidad,
      0,
    )

    return {
      sesionId: sesion.id,
      creadaEn: sesion.iniciadaEn.toISOString(),
      cantidadClientes,
      totalAcumulado,
      llamadoActivo: llamadoActivoDb
        ? { id: llamadoActivoDb.id, motivo: llamadoActivoDb.motivo ?? 'general' }
        : null,
      pedidos: pedidosDb.map((p) => ({
        id: p.id,
        estado: p.estado,
        createdAt: p.createdAt.toISOString(),
        items: p.items.map((pi) => ({
          id: pi.id,
          cantidad: pi.cantidad,
          precioUnitario: Number(pi.precioUnitario),
          itemNombre: pi.item.nombre,
          modificaciones: pi.mods.map((mod) => ({
            ingredienteNombre: mod.itemIngrediente.ingrediente.nombre,
            tipo: mod.accion,
          })),
        })),
      })),
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
      : { restauranteId: dto.restauranteId!, pin: dto.pin!, activo: true }

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

  private async assertStaffAccess(restauranteId: string, user: JwtPayload): Promise<void> {
    if (user.tipo === 'mozo') {
      if (user.restauranteId !== restauranteId) {
        throw new ForbiddenException('No tenés acceso a este restaurante')
      }
      return
    }
    await this.assertAdminAccess(restauranteId, user)
  }

  private async assertAdminAccess(restauranteId: string, user: JwtPayload): Promise<void> {
    if (user.rol === 'ROOT') return
    if (user.rol === 'OWNER') {
      const admin = await this.prisma.admin.findUnique({ where: { id: user.sub } })
      const restaurante = await this.prisma.restaurante.findUnique({ where: { id: restauranteId } })
      if (!admin || !restaurante || admin.marcaId !== restaurante.marcaId) {
        throw new ForbiddenException('No tenés acceso a este restaurante')
      }
      return
    }
    if (user.rol === 'GERENTE') {
      const asignacion = await this.prisma.adminRestaurante.findUnique({
        where: { adminId_restauranteId: { adminId: user.sub, restauranteId } },
      })
      if (!asignacion) throw new ForbiddenException('No tenés acceso a este restaurante')
      return
    }
    throw new ForbiddenException('No tenés acceso a este restaurante')
  }
}
