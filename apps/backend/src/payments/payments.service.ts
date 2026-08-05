import {
  BadRequestException,
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
  pagos: { id: string; comensalId: string | null; metodo: string; estado: string; monto: number }[]
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
  ) {}

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
          comensalId: p.comensalId,
          metodo: p.metodo,
          estado: p.estado,
          monto: Number(p.monto),
        })),
        cerradaEn: sesion.cerradaEn?.toISOString(),
      }
    })
  }

  async solicitarEfectivo(
    sesionId: string,
    comensalId: string | null,
    modo: 'partes_iguales' | 'por_consumo' | null,
  ) {
    if (comensalId !== null) {
      const comensal = await this.prisma.comensal.findUnique({ where: { id: comensalId } })
      if (!comensal || comensal.sesionId !== sesionId) {
        throw new NotFoundException('Comensal no encontrado en esta sesión')
      }
    }

    const existing = await this.prisma.pago.findFirst({
      where: { sesionId, comensalId, metodo: 'efectivo' },
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

    let monto: number
    if (comensalId !== null) {
      let modoReal: 'partes_iguales' | 'por_consumo'
      if (sesion.modoDivision) {
        modoReal = sesion.modoDivision as 'partes_iguales' | 'por_consumo'
      } else {
        if (!modo) {
          throw new BadRequestException(
            'Debe indicarse el modo de división: la sesión aún no lo tiene definido',
          )
        }
        modoReal = modo
        await this.prisma.sesionMesa.update({
          where: { id: sesionId },
          data: { modoDivision: modoReal },
        })
      }
      monto = await this.montoParaComensal(sesionId, comensalId, modoReal)
    } else {
      monto = await this.saldoPendienteSesion(sesionId)
    }

    const pago = await this.prisma.pago.create({
      data: {
        sesionId,
        comensalId,
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

  async confirmarEfectivo(pagoId: string, mozoId?: string) {
    const fechaCobro = new Date()

    const pago = await this.prisma.pago.findUnique({
      where: { id: pagoId },
      include: { sesion: { select: { mesaId: true } } },
    })
    if (!pago || pago.metodo !== 'efectivo') {
      throw new NotFoundException('Pago en efectivo no encontrado')
    }

    return this.runSerializableTransaction(async (tx) => {
      await tx.pago.update({
        where: { id: pagoId },
        data: { estado: 'aprobado', fechaCobro, ...(mozoId ? { mozoId } : {}) },
      })

      const totalSesion = await this.calcularTotalSesion(tx, pago.sesionId)
      const pagosAprobados = await tx.pago.findMany({
        where: { sesionId: pago.sesionId, estado: 'aprobado' },
      })
      const totalCubierto = pagosAprobados.reduce((acc, p) => acc + Number(p.monto), 0)
      const sesionCubierta = totalCubierto >= totalSesion

      if (sesionCubierta) {
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
    })
  }

  async crearPreferenciaMercadoPago(
    sesionId: string,
    comensalId: string,
    modo: 'partes_iguales' | 'por_consumo' | null,
    origin?: string,
  ) {
    const comensal = await this.prisma.comensal.findUnique({ where: { id: comensalId } })
    if (!comensal || comensal.sesionId !== sesionId) {
      throw new NotFoundException('Comensal no encontrado en esta sesión')
    }

    const sesion = await this.prisma.sesionMesa.findUnique({
      where: { id: sesionId },
      include: { mesa: { select: { restauranteId: true } } },
    })
    if (!sesion) throw new NotFoundException('Sesión no encontrada')

    let modoReal: 'partes_iguales' | 'por_consumo'
    if (sesion.modoDivision) {
      modoReal = sesion.modoDivision as 'partes_iguales' | 'por_consumo'
    } else {
      if (!modo) {
        throw new BadRequestException(
          'Debe indicarse el modo de división: la sesión aún no lo tiene definido',
        )
      }
      modoReal = modo
      await this.prisma.sesionMesa.update({
        where: { id: sesionId },
        data: { modoDivision: modoReal },
      })
    }

    const monto = await this.montoParaComensal(sesionId, comensalId, modoReal)

    const restauranteId = sesion.mesa.restauranteId
    const accessToken = await this.mpOAuth.getAccessTokenDecrypted(restauranteId)

    const pago = await this.prisma.pago.upsert({
      where: { sesionId_comensalId: { sesionId, comensalId } },
      update: { metodo: 'mercadopago', estado: 'pendiente', monto },
      create: { sesionId, comensalId, metodo: 'mercadopago', estado: 'pendiente', monto },
    })

    const frontendOrigin = this.resolveFrontendOrigin(origin)

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

  private async montoParaComensal(
    sesionId: string,
    comensalId: string,
    modo: 'partes_iguales' | 'por_consumo',
  ): Promise<number> {
    const partes =
      modo === 'partes_iguales'
        ? await this.divisionService.calcularPartesIguales(sesionId)
        : await this.divisionService.calcularPorConsumo(sesionId)
    const parte = partes.find((p) => p.comensalId === comensalId)
    if (!parte) {
      throw new NotFoundException('No se encontró el monto correspondiente a este comensal')
    }
    return parte.monto
  }

  private async saldoPendienteSesion(sesionId: string): Promise<number> {
    const totalSesion = await this.calcularTotalSesion(this.prisma, sesionId)

    const pagosAprobados = await this.prisma.pago.findMany({
      where: { sesionId, estado: 'aprobado' },
    })
    const totalYaCobrado = pagosAprobados.reduce((acc, p) => acc + Number(p.monto), 0)

    const saldoPendiente = totalSesion - totalYaCobrado
    if (saldoPendiente <= 0) {
      throw new BadRequestException('Esta sesión ya está completamente pagada')
    }
    return saldoPendiente
  }

  private async calcularTotalSesion(client: Prisma.TransactionClient, sesionId: string): Promise<number> {
    const pedidos = await client.pedido.findMany({
      where: { sesionId, estado: { not: 'cancelado' } },
      include: {
        items: { select: { cantidad: true, cantidadEditada: true, precioUnitario: true } },
      },
    })
    return pedidos.reduce(
      (acc, p) =>
        acc +
        p.items.reduce((s, i) => s + Number(i.precioUnitario) * (i.cantidadEditada ?? i.cantidad), 0),
      0,
    )
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

    if (pagoActual.referenciaExterna === resultado.externalId && pagoActual.estado === estadoInterno) {
      return
    }

    const sesionCerrada = await this.runSerializableTransaction(async (tx) => {
      await tx.pago.update({
        where: { id: pagoId },
        data: {
          estado: estadoInterno,
          referenciaExterna: resultado.externalId,
          ...(estadoInterno === 'aprobado' ? { fechaCobro: new Date() } : {}),
        },
      })

      if (estadoInterno !== 'aprobado') return false

      const totalSesion = await this.calcularTotalSesion(tx, pagoActual.sesionId)
      const pagosAprobados = await tx.pago.findMany({
        where: { sesionId: pagoActual.sesionId, estado: 'aprobado' },
      })
      const totalCubierto = pagosAprobados.reduce((acc, p) => acc + Number(p.monto), 0)
      const sesionCubierta = totalCubierto >= totalSesion

      if (sesionCubierta) {
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
    })

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

  private async runSerializableTransaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
        this.logger.warn('Conflicto de transacción serializable detectado, reintentando una vez')
        return this.prisma.$transaction(fn, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        })
      }
      throw err
    }
  }
}
