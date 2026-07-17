import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { MenyuGateway } from '../gateway/menyu.gateway'
import { MercadoPagoProvider } from './providers/mercado-pago.provider'
import { MercadoPagoOAuthService } from './mercado-pago-oauth.service'
import { PaymentStatus } from './providers/payment-provider.interface'
import { isAllowedOrigin } from '../common/is-allowed-origin'

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
  pago?: { id: string; metodo: string; estado: string }
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
  ) {}

  async getSesiones(restauranteId: string): Promise<SesionResumen[]> {
    const sesiones = await this.prisma.sesionMesa.findMany({
      where: { mesa: { restauranteId } },
      include: {
        mesa: { select: { numero: true } },
        pedidos: {
          include: {
            pago: true,
            items: true,
          },
        },
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

      const pago = sesion.pedidos.flatMap((p) => (p.pago ? [p.pago] : []))[0]

      let estado: SesionResumen['estado']
      if (sesion.estado === 'cerrada') {
        estado = 'cerrada'
      } else if (pago && pago.estado === 'pendiente' && pago.metodo === 'mercadopago') {
        estado = 'mp_pendiente'
      } else if (pago && pago.metodo === 'efectivo') {
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
        pago: pago ? { id: pago.id, metodo: pago.metodo, estado: pago.estado } : undefined,
        cerradaEn: sesion.cerradaEn?.toISOString(),
      }
    })
  }

  async solicitarEfectivo(sesionId: string, pedidoId: string, monto: number) {
    const existing = await this.prisma.pago.findFirst({
      where: { pedidoId, metodo: 'efectivo' },
    })
    if (existing) {
      return { pagoId: existing.id, sesionId, estado: 'efectivo_solicitado' }
    }

    const sesion = await this.prisma.sesionMesa.findUnique({
      where: { id: sesionId },
      include: {
        mesa: { select: { id: true, numero: true, restauranteId: true } },
        pedidos: { include: { items: { select: { cantidad: true, precioUnitario: true } } } },
      },
    })
    if (!sesion) throw new NotFoundException('Sesión no encontrada')

    const pago = await this.prisma.pago.create({
      data: {
        pedidoId,
        monto,
        metodo: 'efectivo',
        estado: 'pendiente',
      },
    })

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

    return { pagoId: pago.id, sesionId, estado: 'efectivo_solicitado' }
  }

  async confirmarEfectivo(sesionId: string, mozoId?: string) {
    const fechaCobro = new Date()

    const pedidoConEfectivo = await this.prisma.pedido.findFirst({
      where: { sesionId, pago: { metodo: 'efectivo' } },
      include: { pago: true },
      orderBy: { createdAt: 'desc' },
    })

    if (pedidoConEfectivo?.pago) {
      await this.prisma.$transaction([
        this.prisma.pago.update({
          where: { id: pedidoConEfectivo.pago.id },
          data: { estado: 'aprobado', fechaCobro, ...(mozoId ? { mozoId } : {}) },
        }),
        this.prisma.sesionMesa.update({
          where: { id: sesionId },
          data: { estado: 'cerrada', cerradaEn: fechaCobro },
        }),
      ])
      return { sesionId, estado: 'cerrada' }
    }

    // No hay registro de pago en efectivo — crear uno al confirmar
    const pedidos = await this.prisma.pedido.findMany({
      where: { sesionId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    })

    const ultimo = pedidos[0]
    if (!ultimo) throw new NotFoundException('No se encontraron pedidos para esta sesión')

    const monto = pedidos.reduce(
      (acc, p) =>
        acc + p.items.reduce((s, i) => s + Number(i.precioUnitario) * i.cantidad, 0),
      0,
    )

    await this.prisma.$transaction(async (tx) => {
      await tx.pago.create({
        data: {
          pedidoId: ultimo.id,
          monto,
          metodo: 'efectivo',
          estado: 'aprobado',
          fechaCobro,
          ...(mozoId ? { mozoId } : {}),
        },
      })
      await tx.sesionMesa.update({
        where: { id: sesionId },
        data: { estado: 'cerrada', cerradaEn: fechaCobro },
      })
    })

    return { sesionId, estado: 'cerrada' }
  }

  async crearPreferenciaMercadoPago(
    sesionId: string,
    pedidoId: string,
    monto: number,
    origin?: string,
  ) {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: { mesa: { select: { restauranteId: true } } },
    })
    if (!pedido) throw new NotFoundException('Pedido no encontrado')

    const restauranteId = pedido.mesa.restauranteId
    const accessToken = await this.mpOAuth.getAccessTokenDecrypted(restauranteId)

    await this.prisma.pago.upsert({
      where: { pedidoId },
      update: { metodo: 'mercadopago', estado: 'pendiente', monto },
      create: { pedidoId, metodo: 'mercadopago', estado: 'pendiente', monto },
    })

    const frontendOrigin = this.resolveFrontendOrigin(origin)

    const preference = await this.mpProvider.createPreference({
      restauranteId,
      sesionId,
      pedidoId,
      monto,
      descripcion: `Pedido ${pedidoId}`,
      externalReference: pedidoId,
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

  async procesarWebhookMercadoPago(
    restauranteId: string,
    pedidoId: string,
    query: Record<string, string>,
  ) {
    const accessToken = await this.mpOAuth.getAccessTokenDecrypted(restauranteId)
    const resultado = await this.mpProvider.processWebhook(query, accessToken)
    const estadoInterno = MP_STATUS_MAP[resultado.status]

    const pagoActual = await this.prisma.pago.findUnique({ where: { pedidoId } })
    if (pagoActual?.referenciaExterna === resultado.externalId && pagoActual.estado === estadoInterno) {
      return
    }

    await this.prisma.pago.upsert({
      where: { pedidoId },
      update: {
        estado: estadoInterno,
        referenciaExterna: resultado.externalId,
        ...(estadoInterno === 'aprobado' ? { fechaCobro: new Date() } : {}),
      },
      create: {
        pedidoId,
        monto: 0,
        metodo: 'mercadopago',
        estado: estadoInterno,
        referenciaExterna: resultado.externalId,
      },
    })

    if (estadoInterno === 'aprobado') {
      const pedido = await this.prisma.pedido.findUnique({
        where: { id: pedidoId },
        select: { sesionId: true, mesa: { select: { id: true, numero: true } } },
      })
      if (pedido) {
        await this.prisma.sesionMesa.update({
          where: { id: pedido.sesionId },
          data: { estado: 'cerrada', cerradaEn: new Date() },
        })

        this.gateway.emitSesionCobrada(restauranteId, {
          sesionId: pedido.sesionId,
          mesaId: pedido.mesa.id,
          mesaNumero: pedido.mesa.numero,
        })
      }
    }
  }
}
