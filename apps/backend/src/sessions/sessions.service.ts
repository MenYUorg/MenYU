import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Pago } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { UsersService } from '../users/users.service'
import { MenyuGateway } from '../gateway/menyu.gateway'
import { JwtPayload } from '../auth/auth.service'
import { SessionJwtPayload } from '../auth/guards/session-auth.guard'
import { SALON } from '../auth/roles-del-personal'
import { AccesoService } from '../auth/supabase/acceso.service'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { OpenSessionDto } from './dto/open-session.dto'
import { RegistrarCobroDto } from './dto/registrar-cobro.dto'
import { DivisionService } from '../comensales/division.service'
import { runSerializableTransaction } from '../common/run-serializable-transaction'
import { atribucionDelCobro } from '../common/atribucion-del-cobro'
import { LimiteIntentos } from '../common/limite-intentos'
import { EDITOR_INCLUDE, editorDe } from '../pedidos/editor-de-la-edicion'
import { restauranteDisponible, SELECT_DISPONIBILIDAD } from '../common/restaurante-disponible'
import {
  ESTADO_PAGO_APROBADO,
  ESTADO_PAGO_PENDIENTE,
  ESTADO_PAGO_CANCELADO,
} from '../common/estado-pago.constant'

// Un pago de Mercado Pago "pendiente" más nuevo que esto puede ser un comensal con el
// checkout abierto: cobrar la mesa lo cancela, así que se pide confirmación al mozo.
// Más viejo que esto se considera abandonado y se cancela sin aviso.
const VENTANA_MP_PENDIENTE_MS = 10 * 60 * 1000

// Límite de intentos fallidos al entrar a una mesa (fuerza bruta). Se cuentan fallos, no requests
// por IP: el proxy de Railway y el wifi compartido de un local harían bloquear a todos.
// El PIN (4 dígitos) se cuenta por restaurante y el código de sesión (3 dígitos) por mesa.
// El ingreso por QR (un UUID) no se limita. Ver las limitaciones en LimiteIntentos.
const MINUTO_MS = 60_000
export const LIMITE_PIN = { maxFallos: 10, ventanaMs: 10 * MINUTO_MS, bloqueoMs: 15 * MINUTO_MS }
export const LIMITE_CODIGO_SESION = { maxFallos: 5, ventanaMs: 10 * MINUTO_MS, bloqueoMs: 15 * MINUTO_MS }

function haceMinutos(createdAt: Date, ahora: number): string {
  const min = Math.floor((ahora - createdAt.getTime()) / 60_000)
  if (min < 1) return 'hace menos de 1 minuto'
  return min === 1 ? 'hace 1 minuto' : `hace ${min} minutos`
}

function mensajePagosMpRecientes(pagos: Pick<Pago, 'monto' | 'createdAt'>[], ahora: number): string {
  // Precondición: se llama solo con al menos un pago (registrarCobro lo garantiza).
  const [primero, ...resto] = pagos
  if (!primero) throw new Error('mensajePagosMpRecientes necesita al menos un pago')
  const total = pagos.reduce((acc, p) => acc + Number(p.monto), 0).toFixed(2)
  const masReciente = resto.reduce((a, b) => (b.createdAt > a.createdAt ? b : a), primero)
  if (pagos.length === 1) {
    return `Un comensal inició un pago por MercadoPago de $${total} ${haceMinutos(masReciente.createdAt, ahora)}. Si cobrás la mesa, ese pago se cancela.`
  }
  return `Hay ${pagos.length} pagos por MercadoPago sin terminar por un total de $${total} (el más reciente ${haceMinutos(masReciente.createdAt, ahora)}). Si cobrás la mesa, se cancelan.`
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
  private readonly logger = new Logger(SessionsService.name)
  private readonly intentosPin = new LimiteIntentos(LIMITE_PIN)
  private readonly intentosCodigoSesion = new LimiteIntentos(LIMITE_CODIGO_SESION)

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly gateway: MenyuGateway,
    private readonly divisionService: DivisionService,
    private readonly acceso: AccesoService,
  ) {}

  async openStaff(dto: { mesaId: string }, usuario: UsuarioAutenticado): Promise<OpenStaffSessionResult> {
    const mesa = await this.prisma.mesa.findUnique({
      where: { id: dto.mesaId },
      select: { id: true, numero: true, restauranteId: true, activo: true },
    })
    if (!mesa || !mesa.activo) throw new NotFoundException('Mesa no encontrada')

    await this.acceso.exigirRol(usuario.id, mesa.restauranteId, SALON)

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

    // Primero la mesa: si no existe (o es de otro restaurante) no se crea un cliente "Invitado" de más.
    const mesa = await this.resolveMesaContandoFallosDePin(dto)

    const sesionActiva = await this.prisma.sesionMesa.findFirst({
      where: { mesaId: mesa.id, estado: 'activa' },
    })

    // Con el restaurante (o su marca) dado de baja no se abren mesas nuevas. Una sesión que ya está abierta se deja terminar
    // (docs/plan-consola-root.md, sección 6): quien vuelve a escanear el QR de su mesa, o se suma a ella, entra igual, porque
    // si no no podría pedir la cuenta ni pagar.
    if (!sesionActiva && !restauranteDisponible(mesa.restaurante)) {
      throw new ForbiddenException('Este restaurante no está disponible')
    }

    // Unirse a una sesión abierta en modo seguro pide el código (salvo el primer cliente de una sesión que abrió el staff).
    let esAnfitrionDeStaff = false
    if (sesionActiva) {
      // Si la sesión fue abierta por staff (clienteId = null),
      // el primer cliente real se convierte en anfitrión sin PIN.
      const esSesionStaff = sesionActiva.clienteId === null
      const yaHayParticipantes = await this.prisma.sesionMesaCliente.count({
        where: { sesionId: sesionActiva.id },
      }) > 0
      esAnfitrionDeStaff = esSesionStaff && !yaHayParticipantes

      if (!esAnfitrionDeStaff && mesa.restaurante.modoSesion === 'seguro') {
        if (!dto.codigoSesion) {
          throw new ForbiddenException('Esta mesa requiere código de sesión para unirse')
        }
        this.intentosCodigoSesion.verificar(mesa.id)
        if (dto.codigoSesion !== sesionActiva.codigoSesion) {
          this.intentosCodigoSesion.registrarFallo(mesa.id)
          throw new ForbiddenException('Código de sesión incorrecto')
        }
      }
    }

    // Todas las validaciones que rechazan van antes: un rechazo no crea al cliente "Invitado".
    const clienteId = await this.resolveClienteId(authHeader)

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
      esAnfitrion  = esAnfitrionDeStaff

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

  async close(payload: SessionJwtPayload): Promise<{ ok: boolean }> {
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

  async cerrarMesaAdmin(mesaId: string, usuario: UsuarioAutenticado): Promise<{ ok: boolean }> {
    const mesa = await this.prisma.mesa.findUnique({ where: { id: mesaId } })
    if (!mesa) throw new NotFoundException('Mesa no encontrada')
    await this.acceso.exigirRol(usuario.id, mesa.restauranteId, SALON)

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

  async getSessionActiva(mesaId: string, usuario: UsuarioAutenticado): Promise<SessionActivaResult | null> {
    const mesa = await this.prisma.mesa.findUnique({ where: { id: mesaId } })
    if (!mesa) throw new NotFoundException('Mesa no encontrada')
    await this.acceso.exigirRol(usuario.id, mesa.restauranteId, SALON)

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

  /** El rol en el restaurante lo exige la ruta (`@RequiereRolEn`). */
  async getSessionesActivas(restauranteId: string) {
    const sesiones = await this.prisma.sesionMesa.findMany({
      where: { mesa: { restauranteId }, estado: 'activa' },
      include: {
        mesa: { select: { id: true, numero: true } },
        participantes: { select: { id: true } },
        pedidos: {
          include: {
            items: { select: { cantidad: true, cantidadEditada: true, precioUnitario: true } },
          },
        },
        pagos: { select: { metodo: true, estado: true, fechaCobro: true } },
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
      const quierePagar = s.pagos.some(
        (p) => p.metodo === 'efectivo' && p.estado === 'pendiente' && !p.fechaCobro,
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

  /** El rol en el restaurante lo exige la ruta (`@RequiereRolEn`). */
  async getSessionesPagadas(restauranteId: string, fecha: string | undefined) {
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
        pagos: { some: { estado: 'aprobado' } },
      },
      include: {
        mesa: { select: { numero: true } },
        pedidos: {
          include: {
            items: { select: { cantidad: true, cantidadEditada: true, precioUnitario: true } },
          },
        },
        pagos: { include: { mozo: { select: { nombre: true } }, usuario: { select: { nombre: true } } } },
      },
      orderBy: { cerradaEn: 'desc' },
    })

    return sesiones.map((s) => {
      const pagosAprobados = s.pagos
        .filter((p) => p.estado === 'aprobado')
        .sort((a, b) => (a.fechaCobro?.getTime() ?? 0) - (b.fechaCobro?.getTime() ?? 0))

      const totalCobrado = s.pedidos.reduce(
        (acc, p) =>
          acc + p.items.reduce((sum, i) => sum + Number(i.precioUnitario) * (i.cantidadEditada ?? i.cantidad), 0),
        0,
      )

      let metodoPago: string
      let cobradoPorNombre: string | null
      let referenciaExterna: string | null
      let fechaCobro: string

      if (pagosAprobados.length === 1) {
        const pago = pagosAprobados[0]
        metodoPago = pago.metodo
        cobradoPorNombre = pago.cobradoPorNombre ?? pago.mozo?.nombre ?? pago.usuario?.nombre ?? null
        referenciaExterna = pago.referenciaExterna ?? null
        fechaCobro = pago.fechaCobro?.toISOString() ?? s.cerradaEn?.toISOString() ?? ''
      } else if (pagosAprobados.length > 1) {
        metodoPago = 'mixto'
        cobradoPorNombre = null
        referenciaExterna = null
        const masReciente = pagosAprobados.reduce<Date | null>((latest, p) => {
          if (!p.fechaCobro) return latest
          if (!latest || p.fechaCobro > latest) return p.fechaCobro
          return latest
        }, null)
        fechaCobro = masReciente?.toISOString() ?? s.cerradaEn?.toISOString() ?? ''
      } else {
        metodoPago = 'desconocido'
        cobradoPorNombre = null
        referenciaExterna = null
        fechaCobro = s.cerradaEn?.toISOString() ?? ''
      }

      return {
        id: s.id,
        mesaNumero: s.mesa.numero,
        totalCobrado,
        metodoPago,
        cobradoPorNombre,
        referenciaExterna,
        fechaCobro,
        pagos: pagosAprobados.map((p) => ({
          id: p.id,
          metodo: p.metodo,
          estado: p.estado,
          cobradoPorNombre: p.cobradoPorNombre,
          referenciaExterna: p.referenciaExterna,
          fechaCobro: p.fechaCobro?.toISOString() ?? null,
        })),
      }
    })
  }

  /** El rol en el restaurante lo exige la ruta (`@RequiereRolEn`). */
  async getHistorialSesiones(
    restauranteId: string,
    desde: string | undefined,
    hasta: string | undefined,
  ) {
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
              include: { ...EDITOR_INCLUDE, itemsEliminados: true },
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
              editor: editorDe(e),
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

  /**
   * Cobra el saldo de la sesión. Lo registra el salón del restaurante de la mesa, y queda a nombre de quien cobra
   * (`atribucionDelCobro`): un mozo, con su propio `Mozo`; un OWNER o GERENTE, con su cuenta y, si lo indica, un mozo.
   */
  async registrarCobro(
    sesionId: string,
    dto: RegistrarCobroDto,
    usuario: UsuarioAutenticado,
  ) {
    const sesion = await this.prisma.sesionMesa.findUnique({
      where: { id: sesionId },
      include: {
        mesa: { select: { id: true, numero: true, restauranteId: true } },
      },
    })
    if (!sesion) throw new NotFoundException('Sesión no encontrada')

    const { usuarioId, mozoId } = await atribucionDelCobro(this.prisma, this.acceso, usuario, sesion.mesa.restauranteId, dto.mozoId)
    if (sesion.cerradaEn !== null) throw new BadRequestException('La sesión ya fue cerrada')

    const fechaCobro = new Date()
    const ahora = fechaCobro.getTime()

    const sesionCerrada = await runSerializableTransaction(this.prisma, async (tx) => {
      const totalSesion = await this.divisionService.calcularTotalSesion(tx, sesionId)

      const pagosAprobadosPrevios = await tx.pago.findMany({
        where: { sesionId, estado: ESTADO_PAGO_APROBADO },
      })
      const totalYaCobrado = pagosAprobadosPrevios.reduce((acc, p) => acc + Number(p.monto), 0)
      const saldoPendiente = totalSesion - totalYaCobrado
      if (saldoPendiente <= 0) {
        throw new BadRequestException('Esta sesión ya está completamente pagada')
      }

      // Pagos de Mercado Pago iniciados por un comensal y sin resolver. Cobrar la mesa los
      // cancela. Los recientes pueden estar en pleno checkout: piden confirmación.
      const pagosMpPendientes = await tx.pago.findMany({
        where: { sesionId, metodo: 'mercadopago', estado: ESTADO_PAGO_PENDIENTE },
      })
      const pagosMpRecientes = pagosMpPendientes.filter(
        (p) => ahora - p.createdAt.getTime() < VENTANA_MP_PENDIENTE_MS,
      )
      if (pagosMpRecientes.length > 0 && !dto.confirmarCancelacionPagosPendientes) {
        throw new ConflictException(mensajePagosMpRecientes(pagosMpRecientes, ahora))
      }
      if (pagosMpPendientes.length > 0) {
        await tx.pago.updateMany({
          where: { id: { in: pagosMpPendientes.map((p) => p.id) } },
          data: { estado: ESTADO_PAGO_CANCELADO },
        })
      }

      // Efectivo que un comensal pidió: es el pago que el mozo viene a cobrar, se reutiliza.
      const pagoEfectivoPendiente = await tx.pago.findFirst({
        where: { sesionId, metodo: 'efectivo', estado: ESTADO_PAGO_PENDIENTE },
      })

      if (pagoEfectivoPendiente) {
        await tx.pago.update({
          where: { id: pagoEfectivoPendiente.id },
          data: {
            estado: ESTADO_PAGO_APROBADO,
            monto: saldoPendiente,
            metodo: dto.metodoPago,
            mozoId,
            usuarioId,
            cobradoPorNombre: dto.cobradoPorNombre,
            referenciaExterna: dto.referenciaExterna,
            fechaCobro,
          },
        })
      } else {
        await tx.pago.create({
          data: {
            sesionId,
            monto: saldoPendiente,
            metodo: dto.metodoPago,
            estado: ESTADO_PAGO_APROBADO,
            mozoId,
            usuarioId,
            cobradoPorNombre: dto.cobradoPorNombre,
            referenciaExterna: dto.referenciaExterna,
            fechaCobro,
          },
        })
      }

      const pagosAprobados = await tx.pago.findMany({
        where: { sesionId, estado: ESTADO_PAGO_APROBADO },
      })
      const totalCubierto = pagosAprobados.reduce((acc, p) => acc + Number(p.monto), 0)

      if (totalCubierto >= totalSesion) {
        await tx.sesionMesa.update({
          where: { id: sesionId },
          data: { estado: 'cerrada', cerradaEn: fechaCobro },
        })
        await tx.mesa.update({
          where: { id: sesion.mesaId },
          data: { estado: 'libre' },
        })
        return true
      }

      this.logger.warn(
        `registrarCobro: saldo cubierto (${totalCubierto}) no alcanza el total de la sesión ${sesionId} (${totalSesion}), no se cierra la sesión`,
      )
      return false
    }, 'registrarCobro')

    if (sesionCerrada) {
      this.gateway.emitSesionCobrada(sesion.mesa.restauranteId, {
        sesionId,
        mesaId: sesion.mesaId,
        mesaNumero: sesion.mesa.numero,
      })
    }

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

  /**
   * resolveMesa, con el límite de intentos del PIN: si el restaurante está bloqueado responde 429 sin
   * buscar la mesa, y un PIN que no existe cuenta como fallo. El ingreso por QR no pasa por el límite.
   */
  private async resolveMesaContandoFallosDePin(dto: OpenSessionDto) {
    if (dto.tableCode) return this.resolveMesa(dto)

    const restauranteId = dto.restauranteId!
    this.intentosPin.verificar(restauranteId)
    try {
      return await this.resolveMesa(dto)
    } catch (e) {
      if (e instanceof NotFoundException) this.intentosPin.registrarFallo(restauranteId)
      throw e
    }
  }

  /**
   * La mesa por el código del QR (`tableCode`) o por el PIN del restaurante. Si junto con el QR llega `restauranteId`
   * (la persona eligió un restaurante en la app), la mesa tiene que ser de ese restaurante. El PIN ya se busca dentro
   * del restaurante.
   */
  private async resolveMesa(dto: OpenSessionDto) {
    const where = dto.tableCode
      ? { qrToken: dto.tableCode, activo: true }
      : { restauranteId: dto.restauranteId!, pin: dto.pin!, activo: true }

    const mesa = await this.prisma.mesa.findFirst({
      where,
      include: { restaurante: { select: { modoSesion: true, ...SELECT_DISPONIBILIDAD } } },
    })

    if (!mesa) throw new NotFoundException('Mesa no encontrada')
    if (dto.tableCode && dto.restauranteId && mesa.restauranteId !== dto.restauranteId) {
      throw new ConflictException('Ese QR no es de este restaurante')
    }
    return mesa
  }

  private generateCodigoSesion(): string {
    return String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')
  }
}
