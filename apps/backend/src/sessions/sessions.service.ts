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

  async getSessionesActivas(restauranteId: string, user: JwtPayload) {
    await this.assertStaffAccess(restauranteId, user)

    const sesiones = await this.prisma.sesionMesa.findMany({
      where: { mesa: { restauranteId }, estado: 'activa' },
      include: {
        mesa: { select: { id: true, numero: true } },
        participantes: { select: { id: true } },
        pedidos: {
          include: {
            items: { select: { cantidad: true, cantidadEditada: true, precioUnitario: true } },
            pago: { select: { metodo: true, estado: true, fechaCobro: true } },
          },
        },
      },
      orderBy: { iniciadaEn: 'asc' },
    })

    const now = Date.now()
    return sesiones.map((s) => {
      const cantidadItems = s.pedidos.reduce(
        (acc, p) => acc + p.items.reduce((sum, i) => sum + (i.cantidadEditada ?? i.cantidad), 0),
        0,
      )
      const totalAcumulado = s.pedidos.reduce(
        (acc, p) =>
          acc + p.items.reduce((sum, i) => sum + Number(i.precioUnitario) * (i.cantidadEditada ?? i.cantidad), 0),
        0,
      )
      const quierePagar = s.pedidos.some(
        (p) => p.pago?.metodo === 'efectivo' && p.pago?.estado === 'pendiente' && !p.pago?.fechaCobro,
      )
      return {
        id: s.id,
        mesaId: s.mesa.id,
        mesaNumero: s.mesa.numero,
        tiempoTranscurrido: Math.floor((now - s.iniciadaEn.getTime()) / 60000),
        cantidadItems,
        cantidadPersonas: s.participantes.length,
        totalAcumulado,
        quierePagar,
      }
    })
  }

  async getSessionesPagadas(restauranteId: string, fecha: string | undefined, user: JwtPayload) {
    await this.assertStaffAccess(restauranteId, user)

    let fechaFilter: { gte: Date; lte: Date } | undefined
    if (fecha === 'hoy') {
      const inicio = new Date(); inicio.setHours(0, 0, 0, 0)
      const fin = new Date(); fin.setHours(23, 59, 59, 999)
      fechaFilter = { gte: inicio, lte: fin }
    } else if (fecha === 'ayer') {
      const inicio = new Date(); inicio.setDate(inicio.getDate() - 1); inicio.setHours(0, 0, 0, 0)
      const fin = new Date(); fin.setDate(fin.getDate() - 1); fin.setHours(23, 59, 59, 999)
      fechaFilter = { gte: inicio, lte: fin }
    }

    const sesiones = await this.prisma.sesionMesa.findMany({
      where: {
        mesa: { restauranteId },
        estado: 'cerrada',
        ...(fechaFilter ? { cerradaEn: fechaFilter } : {}),
        pedidos: { some: { pago: { estado: 'aprobado' } } },
      },
      include: {
        mesa: { select: { numero: true } },
        pedidos: {
          include: {
            items: { select: { cantidad: true, cantidadEditada: true, precioUnitario: true } },
            pago: { include: { mozo: { select: { nombre: true } } } },
          },
        },
      },
      orderBy: { cerradaEn: 'desc' },
    })

    return sesiones.map((s) => {
      const pago = s.pedidos.flatMap((p) => (p.pago ? [p.pago] : [])).find((p) => p.estado === 'aprobado')
      const totalCobrado = s.pedidos.reduce(
        (acc, p) =>
          acc + p.items.reduce((sum, i) => sum + Number(i.precioUnitario) * (i.cantidadEditada ?? i.cantidad), 0),
        0,
      )
      return {
        id: s.id,
        mesaNumero: s.mesa.numero,
        totalCobrado,
        metodoPago:       pago?.metodo ?? 'desconocido',
        cobradoPorNombre: pago?.cobradoPorNombre ?? pago?.mozo?.nombre ?? null,
        referenciaExterna: pago?.referenciaExterna ?? null,
        fechaCobro:       pago?.fechaCobro?.toISOString() ?? s.cerradaEn?.toISOString() ?? '',
      }
    })
  }

  async getHistorialSesiones(
    restauranteId: string,
    desde: string | undefined,
    hasta: string | undefined,
    user: JwtPayload,
  ) {
    await this.assertStaffAccess(restauranteId, user)

    const hoy = new Date().toISOString().slice(0, 10)
    const desdeStr = desde ?? hoy
    const hastaStr = hasta ?? hoy

    const desdeDate = new Date(`${desdeStr}T00:00:00.000Z`)
    const hastaDate = new Date(`${hastaStr}T23:59:59.999Z`)

    const sesiones = await this.prisma.sesionMesa.findMany({
      where: {
        mesa: { restauranteId },
        estado: 'cerrada',
        cerradaEn: { gte: desdeDate, lte: hastaDate },
      },
      include: {
        mesa: { select: { numero: true } },
        pedidos: {
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
            ediciones: {
              include: {
                admin: { select: { email: true } },
                mozo: { select: { nombre: true } },
                itemsEliminados: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { cerradaEn: 'desc' },
    })

    return sesiones.map((s) => {
      const totalSesion = s.pedidos.reduce(
        (acc, p) =>
          acc +
          p.items.reduce(
            (sum, i) => sum + Number(i.precioUnitario) * (i.cantidadEditada ?? i.cantidad),
            0,
          ),
        0,
      )

      return {
        sesionId: s.id,
        mesaNumero: s.mesa.numero,
        iniciadaEn: s.iniciadaEn.toISOString(),
        cerradaEn: s.cerradaEn!.toISOString(),
        cantidadPedidos: s.pedidos.length,
        totalSesion,
        pedidos: s.pedidos.map((p) => {
          const totalPedido = p.items.reduce(
            (sum, i) => sum + Number(i.precioUnitario) * (i.cantidadEditada ?? i.cantidad),
            0,
          )
          return {
            id: p.id,
            estado: p.estado,
            createdAt: p.createdAt.toISOString(),
            totalPedido,
            tieneEdiciones: p.ediciones.length > 0,
            items: p.items.map((pi) => ({
              id: pi.id,
              cantidad: pi.cantidad,
              cantidadEditada: pi.cantidadEditada,
              precioUnitario: Number(pi.precioUnitario),
              itemNombre: pi.item.nombre,
              mods: pi.mods.map((mod) => ({
                accion: mod.accion,
                ingredienteNombre: mod.itemIngrediente.ingrediente.nombre,
              })),
            })),
            ediciones: p.ediciones.map((e) => ({
              id: e.id,
              justificacion: e.justificacion,
              creadoEn: e.creadoEn.toISOString(),
              editor: e.admin
                ? { nombre: e.admin.email, tipo: 'gerente' as const }
                : { nombre: e.mozo?.nombre ?? 'desconocido', tipo: 'mozo' as const },
              itemsEliminados: e.itemsEliminados.map((item) => ({
                itemNombre: item.itemNombre,
                cantidadAntes: item.cantidadAntes,
                cantidadDespues: item.cantidadDespues,
                precioUnitario: Number(item.precioUnitario),
                esAnulacion: item.cantidadDespues === 0,
              })),
            })),
          }
        }),
      }
    })
  }

  async registrarCobro(
    sesionId: string,
    dto: { metodoPago: string; mozoId?: string; cobradoPorNombre?: string; referenciaExterna?: string },
    user: JwtPayload,
  ) {
    const sesion = await this.prisma.sesionMesa.findUnique({
      where: { id: sesionId },
      include: {
        mesa: { select: { id: true, numero: true, restauranteId: true } },
        pedidos: {
          include: { pago: true, items: { select: { cantidad: true, precioUnitario: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    })
    if (!sesion) throw new NotFoundException('Sesión no encontrada')
    if (sesion.cerradaEn !== null) throw new BadRequestException('La sesión ya fue cerrada')

    await this.assertStaffAccess(sesion.mesa.restauranteId, user)

    const pagoExistente = sesion.pedidos.flatMap((p) => (p.pago ? [p.pago] : []))[0]
    const fechaCobro = new Date()

    await this.prisma.$transaction(async (tx) => {
      if (pagoExistente) {
        await tx.pago.update({
          where: { id: pagoExistente.id },
          data: { metodo: dto.metodoPago, mozoId: dto.mozoId || null, cobradoPorNombre: dto.cobradoPorNombre, referenciaExterna: dto.referenciaExterna, fechaCobro, estado: 'aprobado' },
        })
      } else {
        const ultimoPedido = sesion.pedidos[0]
        if (!ultimoPedido) throw new BadRequestException('La sesión no tiene pedidos')
        const monto = sesion.pedidos.reduce(
          (acc, p) => acc + p.items.reduce((s, i) => s + Number(i.precioUnitario) * i.cantidad, 0),
          0,
        )
        await tx.pago.create({
          data: {
            pedidoId: ultimoPedido.id,
            monto,
            metodo: dto.metodoPago,
            mozoId: dto.mozoId || null,
            cobradoPorNombre: dto.cobradoPorNombre,
            referenciaExterna: dto.referenciaExterna,
            fechaCobro,
            estado: 'aprobado',
          },
        })
      }
      await tx.sesionMesa.update({
        where: { id: sesionId },
        data: { estado: 'cerrada', cerradaEn: fechaCobro },
      })
      await tx.mesa.update({
        where: { id: sesion.mesaId },
        data: { estado: 'libre' },
      })
    })

    this.gateway.emitSesionCobrada(sesion.mesa.restauranteId, {
      sesionId,
      mesaId: sesion.mesaId,
      mesaNumero: sesion.mesa.numero,
    })

    return { ok: true }
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
