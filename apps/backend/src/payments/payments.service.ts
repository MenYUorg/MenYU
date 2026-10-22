import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { MenyuGateway } from '../gateway/menyu.gateway'
import { MercadoPagoProvider } from './providers/mercado-pago.provider'
import { MercadoPagoOAuthService } from './mercado-pago-oauth.service'
import { DivisionService } from '../comensales/division.service'
import { PaymentStatus } from './providers/payment-provider.interface'
import { isAllowedOrigin } from '../common/is-allowed-origin'
import { runSerializableTransaction } from '../common/run-serializable-transaction'
import { SELECT_DISPONIBILIDAD, restauranteDisponible } from '../common/restaurante-disponible'
import { atribucionDelCobro } from '../common/atribucion-del-cobro'
import { AccesoService } from '../auth/supabase/acceso.service'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { ConfirmarEfectivoDto } from './dto/confirmar-efectivo.dto'
import {
  ESTADO_PAGO_PENDIENTE,
  ESTADO_PAGO_APROBADO,
  ESTADO_PAGO_CANCELADO,
} from '../common/estado-pago.constant'

const MP_STATUS_MAP: Record<PaymentStatus, string> = {
  APROBADO: 'aprobado',
  PENDIENTE: 'pendiente',
  RECHAZADO: 'rechazado',
  EN_PROCESO: 'pendiente',
}

export interface SesionResumen {
  sesionId: string
  mesaNumero: string
  estado: 'activa' | 'efectivo_solicitado' | 'mp_pendiente' | 'cerrada'
  total: number
  pedidos: { id: string; total: number; estado: string }[]
  pagos: { id: string; metodo: string; estado: string; monto: number }[]
  cerradaEn?: string
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: MenyuGateway,
    private readonly mpProvider: MercadoPagoProvider,
    private readonly mpOAuth: MercadoPagoOAuthService,
    private readonly divisionService: DivisionService,
    private readonly acceso: AccesoService,
  ) {}

  /** El rol en el restaurante lo exige la ruta (`@RequiereRolEn`). */
  async getSesiones(restauranteId: string): Promise<SesionResumen[]> {
    const sesiones = await this.prisma.sesionMesa.findMany({
      where: { mesa: { restauranteId } },
      include: {
        mesa: { select: { numero: true } },
        pedidos: {
          include: {
            items: true,
          },
        },
        pagos: true,
      },
      orderBy: { iniciadaEn: 'desc' },
      take: 100,
    })

    return sesiones.map((sesion) => {
      const total = sesion.pedidos.reduce(
        (acc, pedido) =>
          acc +
          pedido.items.reduce(
            (s, item) => s + Number(item.precioUnitario) * item.cantidad,
            0,
          ),
        0,
      )

      let estado: SesionResumen['estado']
      if (sesion.estado === 'cerrada') {
        estado = 'cerrada'
      } else if (
        sesion.pagos.some((p) => p.estado === 'pendiente' && p.metodo === 'mercadopago')
      ) {
        estado = 'mp_pendiente'
      } else if (sesion.pagos.some((p) => p.metodo === 'efectivo' && p.estado !== 'aprobado')) {
        estado = 'efectivo_solicitado'
      } else {
        estado = 'activa'
      }

      return {
        sesionId: sesion.id,
        mesaNumero: sesion.mesa.numero,
        estado,
        total,
        pedidos: sesion.pedidos.map((p) => ({
          id: p.id,
          total: p.items.reduce(
            (s, i) => s + Number(i.precioUnitario) * i.cantidad,
            0,
          ),
          estado: p.estado,
        })),
        pagos: sesion.pagos.map((p) => ({
          id: p.id,
          metodo: p.metodo,
          estado: p.estado,
          monto: Number(p.monto),
        })),
        cerradaEn: sesion.cerradaEn?.toISOString(),
      }
    })
  }

  async solicitarEfectivo(sesionId: string) {
    // Serializable: dos pedidos de efectivo simultáneos no pueden crear dos filas. El segundo
    // choca (P2034), se reintenta una vez y ahí ya ve el pendiente del primero.
    // Sin I/O externa adentro: los eventos de socket salen después del commit.
    const resultado = await runSerializableTransaction(
      this.prisma,
      async (tx) => {
        const sesion = await tx.sesionMesa.findUnique({
          where: { id: sesionId },
          include: {
            mesa: {
              select: {
                id: true,
                numero: true,
                restauranteId: true,
                restaurante: { select: SELECT_DISPONIBILIDAD },
              },
            },
          },
        })
        if (!sesion) throw new NotFoundException('Sesión no encontrada')
        if (sesion.cerradaEn !== null) throw new BadRequestException('La sesión ya fue cerrada')
        // El efectivo lo cobra el mozo, y con el restaurante (o su marca) dado de baja el personal perdió el acceso:
        // recibe 403 al confirmarlo. El pedido quedaba pendiente para siempre, con un llamado que nadie podía atender
        // (entrega 4.7 de docs/auth/specs/auth.md). A esa mesa le queda Mercado Pago, que no pasa por el personal.
        if (!restauranteDisponible(sesion.mesa.restaurante)) {
          throw new ForbiddenException('Este restaurante no está disponible')
        }

        // Un efectivo ya pedido y sin cobrar se reutiliza; uno aprobado o cancelado no cuenta.
        const existing = await tx.pago.findFirst({
          where: { sesionId, metodo: 'efectivo', estado: ESTADO_PAGO_PENDIENTE },
        })
        if (existing) return { creado: false as const, pagoId: existing.id }

        const { total, saldo: monto } = await this.saldoPendienteSesion(sesionId, tx)

        const pago = await tx.pago.create({
          data: { sesionId, monto, metodo: 'efectivo', estado: ESTADO_PAGO_PENDIENTE },
        })

        // Reemplazar cualquier llamado pendiente y crear uno con motivo pedir_cuenta
        await tx.llamadoMozo.deleteMany({
          where: { sesionId, estado: 'pendiente' },
        })
        const llamado = await tx.llamadoMozo.create({
          data: { sesionId, motivo: 'pedir_cuenta' },
        })

        return { creado: true as const, sesion, pago, llamado, totalAcumulado: total }
      },
      'solicitarEfectivo',
    )

    if (!resultado.creado) {
      return { pagoId: resultado.pagoId, sesionId, estado: 'efectivo_solicitado' }
    }

    const { sesion, pago, llamado, totalAcumulado } = resultado

    this.gateway.emitMozoCalled(sesion.mesa.restauranteId, {
      llamadoId: llamado.id,
      sesionId,
      mesaNumero: sesion.mesa.numero,
      motivo: 'pedir_cuenta',
    })

    this.gateway.emitQuierePagar(sesion.mesa.restauranteId, {
      sesionId,
      mesaId: sesion.mesa.id,
      mesaNumero: sesion.mesa.numero,
      totalAcumulado,
    })

    return { pagoId: pago.id, sesionId, estado: 'efectivo_solicitado' }
  }

  async avisarMozoPedidoDeCuenta(sesionId: string) {
    const sesion = await this.prisma.sesionMesa.findUnique({
      where: { id: sesionId },
      include: {
        mesa: {
          select: {
            id: true,
            numero: true,
            restauranteId: true,
            restaurante: { select: SELECT_DISPONIBILIDAD },
          },
        },
        pedidos: { include: { items: { select: { cantidad: true, precioUnitario: true } } } },
      },
    })
    if (!sesion) throw new NotFoundException('Sesión no encontrada')
    // Igual que en `solicitarEfectivo`: con la baja, nadie puede atender el llamado.
    if (!restauranteDisponible(sesion.mesa.restaurante)) {
      throw new ForbiddenException('Este restaurante no está disponible')
    }

    // Reemplazar cualquier llamado pendiente y crear uno con motivo pedir_cuenta
    await this.prisma.llamadoMozo.deleteMany({
      where: { sesionId, estado: 'pendiente' },
    })
    const llamado = await this.prisma.llamadoMozo.create({
      data: { sesionId, motivo: 'pedir_cuenta' },
    })

    const totalAcumulado = sesion.pedidos.reduce(
      (acc, p) => acc + p.items.reduce((s, i) => s + Number(i.precioUnitario) * i.cantidad, 0),
      0,
    )

    this.gateway.emitMozoCalled(sesion.mesa.restauranteId, {
      llamadoId: llamado.id,
      sesionId,
      mesaNumero: sesion.mesa.numero,
      motivo: 'pedir_cuenta',
    })

    this.gateway.emitQuierePagar(sesion.mesa.restauranteId, {
      sesionId,
      mesaId: sesion.mesa.id,
      mesaNumero: sesion.mesa.numero,
      totalAcumulado,
    })

    return { sesionId, estado: 'mozo_llamado' }
  }

  /** Lo confirma el salón del restaurante del pago, y queda a nombre de quien cobra (`atribucionDelCobro`). */
  async confirmarEfectivo(dto: ConfirmarEfectivoDto, usuario: UsuarioAutenticado) {
    const { pagoId } = dto
    const fechaCobro = new Date()

    const pago = await this.prisma.pago.findUnique({
      where: { id: pagoId },
      include: { sesion: { select: { mesaId: true, mesa: { select: { restauranteId: true } } } } },
    })
    if (!pago || pago.metodo !== 'efectivo') {
      throw new NotFoundException('Pago en efectivo no encontrado')
    }
    const { usuarioId, mozoId } = await atribucionDelCobro(
      this.prisma,
      this.acceso,
      usuario,
      pago.sesion.mesa.restauranteId,
      dto.mozoId,
    )
    // Un cobro ya confirmado (o cancelado) no se vuelve a confirmar: le cambiaría el autor y la fecha.
    const yaNoPendiente = new ConflictException('Ese pago ya no está pendiente')
    if (pago.estado !== ESTADO_PAGO_PENDIENTE) throw yaNoPendiente

    return runSerializableTransaction(this.prisma, async (tx) => {
      // El estado se vuelve a mirar al escribir: otro cobro, el webhook o el reintento de esta transacción pueden haberlo
      // cambiado después de la lectura de arriba.
      const { count } = await tx.pago.updateMany({
        where: { id: pagoId, estado: ESTADO_PAGO_PENDIENTE },
        data: { estado: ESTADO_PAGO_APROBADO, fechaCobro, mozoId, usuarioId },
      })
      if (count === 0) throw yaNoPendiente

      const totalSesion = await this.divisionService.calcularTotalSesion(tx, pago.sesionId)
      const pagosAprobados = await tx.pago.findMany({
        where: { sesionId: pago.sesionId, estado: 'aprobado' },
      })
      const totalCubierto = pagosAprobados.reduce((acc, p) => acc + Number(p.monto), 0)
      const sesionCubierta = totalCubierto >= totalSesion

      if (sesionCubierta) {
        // La mesa quedó cobrada: cualquier pago que siga pendiente (p. ej. un MP que un
        // comensal inició) ya no se va a cobrar. El pago de este cobro ya está aprobado, no entra.
        await tx.pago.updateMany({
          where: { sesionId: pago.sesionId, estado: ESTADO_PAGO_PENDIENTE },
          data: { estado: ESTADO_PAGO_CANCELADO },
        })
        await tx.sesionMesa.update({
          where: { id: pago.sesionId },
          data: { estado: 'cerrada', cerradaEn: fechaCobro },
        })
        await tx.mesa.update({
          where: { id: pago.sesion.mesaId },
          data: { estado: 'libre' },
        })
      }

      return { sesionId: pago.sesionId, estado: sesionCubierta ? 'cerrada' : 'activa' }
    }, 'confirmarEfectivo')
  }

  async crearPreferenciaMercadoPago(sesionId: string, origin?: string) {
    // Antes de crear nada: si la sesión no existe o el restaurante no conectó Mercado Pago,
    // se falla acá y no queda ninguna fila pendiente.
    const sesionPrevia = await this.prisma.sesionMesa.findUnique({
      where: { id: sesionId },
      select: { mesa: { select: { restauranteId: true } } },
    })
    if (!sesionPrevia) throw new NotFoundException('Sesión no encontrada')
    const restauranteId = sesionPrevia.mesa.restauranteId
    const accessToken = await this.mpOAuth.getAccessTokenDecrypted(restauranteId)
    const frontendOrigin = this.resolveFrontendOrigin(origin)

    // Fase 1: transacción serializable, sin I/O externa adentro (un reintento por P2034
    // repetiría la llamada HTTP). Nunca se reutiliza una fila: cada intento cancela los MP
    // pendientes de la sesión y crea uno nuevo con el saldo actual.
    const { pago, monto } = await runSerializableTransaction(
      this.prisma,
      async (tx) => {
        const { saldo: monto } = await this.saldoPendienteSesion(sesionId, tx)
        await tx.pago.updateMany({
          where: { sesionId, metodo: 'mercadopago', estado: ESTADO_PAGO_PENDIENTE },
          data: { estado: ESTADO_PAGO_CANCELADO },
        })
        const pago = await tx.pago.create({
          data: { sesionId, monto, metodo: 'mercadopago', estado: ESTADO_PAGO_PENDIENTE },
        })
        return { pago, monto }
      },
      'crearPreferenciaMercadoPago',
    )

    // Fase 2: I/O externa (Mercado Pago), fuera de la transacción. Si falla, la fila nueva
    // quedaría pendiente sin preferencia: se cancela para no dejar un MP fantasma.
    try {
      const preference = await this.mpProvider.createPreference({
        restauranteId,
        sesionId,
        pagoId: pago.id,
        monto,
        descripcion: `Pago ${pago.id}`,
        externalReference: pago.id,
        accessToken,
        ...(frontendOrigin
          ? {
              successUrl: `${frontendOrigin}/pago/exitoso`,
              failureUrl: `${frontendOrigin}/pago/fallido`,
              pendingUrl: `${frontendOrigin}/pago/pendiente`,
            }
          : {}),
      })
      return { initPoint: preference.initPoint, preferenceId: preference.id }
    } catch (err) {
      await this.prisma.pago
        .updateMany({
          where: { id: pago.id, estado: ESTADO_PAGO_PENDIENTE },
          data: { estado: ESTADO_PAGO_CANCELADO },
        })
        .catch((e) =>
          this.logger.error(
            `crearPreferenciaMercadoPago: no se pudo cancelar el pago ${pago.id} tras el fallo de MP`,
            e,
          ),
        )
      throw err
    }
  }

  // Deriva las back_urls del Origin del request (validado contra la misma whitelist que CORS)
  // en vez de una FRONTEND_URL fija, para no depender de la URL de preview de Vercel de cada rama de QA.
  private resolveFrontendOrigin(origin?: string): string | undefined {
    if (!origin) {
      this.logger.debug('crearPreferenciaMercadoPago: sin header Origin, uso fallback FRONTEND_URL')
      return undefined
    }
    const cleanOrigin = origin.replace(/\/+$/, '')
    if (!isAllowedOrigin(cleanOrigin)) {
      this.logger.debug(
        `crearPreferenciaMercadoPago: origin "${cleanOrigin}" no matchea la whitelist de CORS, uso fallback FRONTEND_URL`,
      )
      return undefined
    }
    return cleanOrigin
  }

  private async saldoPendienteSesion(
    sesionId: string,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<{ total: number; saldo: number }> {
    const total = await this.divisionService.calcularTotalSesion(client, sesionId)

    const pagosAprobados = await client.pago.findMany({
      where: { sesionId, estado: 'aprobado' },
    })
    const totalYaCobrado = pagosAprobados.reduce((acc, p) => acc + Number(p.monto), 0)

    const saldo = total - totalYaCobrado
    if (saldo <= 0) {
      throw new BadRequestException('Esta sesión ya está completamente pagada')
    }
    return { total, saldo }
  }

  async procesarWebhookMercadoPago(
    restauranteId: string,
    pagoId: string,
    query: Record<string, string>,
  ) {
    const accessToken = await this.mpOAuth.getAccessTokenDecrypted(restauranteId)
    const resultado = await this.mpProvider.processWebhook(query, accessToken)
    const estadoInterno = MP_STATUS_MAP[resultado.status]

    const pagoActual = await this.prisma.pago.findUnique({
      where: { id: pagoId },
      include: { sesion: { select: { mesaId: true } } },
    })
    if (!pagoActual) {
      this.logger.warn(`procesarWebhookMercadoPago: pago ${pagoId} no encontrado, ignorando notificación`)
      return
    }

    // La notificación tiene que ser de ESTE pago y el pago tiene que ser de Mercado Pago.
    // Va antes de la transacción: externalReference viene del request y metodo no cambia
    // mientras el pago está en este flujo. Con el provider actual, las notificaciones de
    // relleno (tópico desconocido, payment sin order) traen externalReference '' y caen acá.
    if (resultado.externalReference !== pagoId) {
      this.logger.warn(
        `procesarWebhookMercadoPago: externalReference "${resultado.externalReference}" no coincide con pagoId ${pagoId}, ` +
          `ignorando notificación (sesionId=${pagoActual.sesionId}, merchantOrderId=${resultado.externalId})`,
      )
      return
    }
    if (pagoActual.metodo !== 'mercadopago') {
      this.logger.warn(
        `procesarWebhookMercadoPago: el pago ${pagoId} no es de Mercado Pago (metodo=${pagoActual.metodo}), ` +
          `ignorando notificación (sesionId=${pagoActual.sesionId}, merchantOrderId=${resultado.externalId})`,
      )
      return
    }

    if (pagoActual.referenciaExterna === resultado.externalId && pagoActual.estado === estadoInterno) {
      return
    }

    const sesionCerrada = await runSerializableTransaction(this.prisma, async (tx) => {
      // Estados finales: aprobado y cancelado no los cambia el webhook (ni siquiera
      // referenciaExterna). Se lee acá, dentro de la tx, porque registrarCobro puede
      // cancelar el pago entre la lectura de arriba y este punto.
      const actual = await tx.pago.findUnique({ where: { id: pagoId }, select: { estado: true } })
      if (
        actual &&
        (actual.estado === ESTADO_PAGO_APROBADO || actual.estado === ESTADO_PAGO_CANCELADO)
      ) {
        if (actual.estado !== estadoInterno) {
          const detalle = `sesionId=${pagoActual.sesionId}, pagoId=${pagoId}, merchantOrderId=${resultado.externalId}`
          this.logger.warn(
            actual.estado === ESTADO_PAGO_CANCELADO && estadoInterno === ESTADO_PAGO_APROBADO
              ? `procesarWebhookMercadoPago: MP informó aprobado para un pago cancelado; devolución manual pendiente (${detalle})`
              : `procesarWebhookMercadoPago: transición ignorada ${actual.estado} → ${estadoInterno} (${detalle})`,
          )
        }
        return false
      }

      await tx.pago.update({
        where: { id: pagoId },
        data: {
          estado: estadoInterno,
          referenciaExterna: resultado.externalId,
          ...(estadoInterno === 'aprobado' ? { fechaCobro: new Date() } : {}),
        },
      })

      if (estadoInterno !== 'aprobado') return false

      const totalSesion = await this.divisionService.calcularTotalSesion(tx, pagoActual.sesionId)
      const pagosAprobados = await tx.pago.findMany({
        where: { sesionId: pagoActual.sesionId, estado: 'aprobado' },
      })
      const totalCubierto = pagosAprobados.reduce((acc, p) => acc + Number(p.monto), 0)
      const sesionCubierta = totalCubierto >= totalSesion

      if (sesionCubierta) {
        // La mesa quedó cobrada: cualquier pago que siga pendiente (p. ej. un efectivo que un
        // comensal pidió) ya no se va a cobrar. El pago de este webhook ya está aprobado, no entra.
        await tx.pago.updateMany({
          where: { sesionId: pagoActual.sesionId, estado: ESTADO_PAGO_PENDIENTE },
          data: { estado: ESTADO_PAGO_CANCELADO },
        })
        await tx.sesionMesa.update({
          where: { id: pagoActual.sesionId },
          data: { estado: 'cerrada', cerradaEn: new Date() },
        })
        await tx.mesa.update({
          where: { id: pagoActual.sesion.mesaId },
          data: { estado: 'libre' },
        })
      }

      return sesionCubierta
    }, 'procesarWebhookMercadoPago')

    if (sesionCerrada) {
      const sesion = await this.prisma.sesionMesa.findUnique({
        where: { id: pagoActual.sesionId },
        select: { mesa: { select: { id: true, numero: true } } },
      })
      if (sesion) {
        this.gateway.emitSesionCobrada(restauranteId, {
          sesionId: pagoActual.sesionId,
          mesaId: sesion.mesa.id,
          mesaNumero: sesion.mesa.numero,
        })
      }
    }
  }
}
