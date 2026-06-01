import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { PrismaService } from '../prisma/prisma.service'
import { CryptoService } from '../common/crypto.service'
import { PaymentProvider } from './providers/payment-provider.interface'
import { InitiatePaymentDto } from './dto/initiate-payment.dto'

interface SessionJwt {
  sub: string
  tipo: string
  sesionId: string
  mesaId: string
  restauranteId: string
}

interface MpTokenResponse {
  access_token: string
  refresh_token: string
  user_id: number | string
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
  constructor(
    @Inject('PAYMENT_PROVIDER') private readonly provider: PaymentProvider,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async initiatePayment(authHeader: string | undefined, dto: InitiatePaymentDto) {
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
      throw new UnauthorizedException('Solo clientes pueden iniciar pagos')
    }

    const restaurante = await this.prisma.restaurante.findUnique({
      where: { id: dto.restauranteId },
      select: { mpAccessToken: true },
    })

    if (!restaurante?.mpAccessToken) {
      throw new BadRequestException('El restaurante no tiene Mercado Pago configurado')
    }

    const externalReference = `${dto.sesionId}-${Date.now()}`

    const preference = await this.provider.createPreference({
      sesionId: dto.sesionId,
      monto: dto.monto,
      descripcion: dto.descripcion,
      externalReference,
      accessToken: this.crypto.decrypt(restaurante.mpAccessToken),
    })

    const pago = await this.prisma.pago.create({
      data: {
        pedidoId: dto.pedidoId,
        monto: dto.monto,
        metodo: 'mercadopago',
        estado: 'pendiente',
        referenciaExterna: preference.externalReference,
      },
    })

    return { ...preference, pagoId: pago.id }
  }

  async handleWebhook(payload: unknown) {
    const result = await this.provider.processWebhook(payload)

    if (result.status !== 'APROBADO' || !result.externalReference) {
      return { sesionId: null, estado: result.status }
    }

    const pago = await this.prisma.pago.findFirst({
      where: { referenciaExterna: result.externalReference },
    })

    if (!pago) {
      throw new NotFoundException('Pago no encontrado para esa referencia')
    }

    const pedido = await this.prisma.pedido.findUnique({
      where: { id: pago.pedidoId },
      select: { sesionId: true },
    })

    await this.prisma.$transaction([
      this.prisma.pago.update({
        where: { id: pago.id },
        data: { estado: 'aprobado' },
      }),
      this.prisma.sesionMesa.update({
        where: { id: pedido!.sesionId },
        data: { estado: 'cerrada', cerradaEn: new Date() },
      }),
    ])

    return { sesionId: pedido!.sesionId, estado: 'cerrada' }
  }

  async getStatus(externalId: string) {
    return this.provider.getPaymentStatus(externalId)
  }

  async getMpAuthUrl(restauranteId: string): Promise<{ url: string }> {
    const params = new URLSearchParams({
      client_id: process.env.MP_CLIENT_ID!,
      response_type: 'code',
      platform_id: 'mp',
      redirect_uri: process.env.MP_REDIRECT_URI!,
      state: restauranteId,
    })
    return { url: `https://auth.mercadopago.com/authorization?${params}` }
  }

  async handleMpCallback(
    code: string,
    restauranteId: string,
  ): Promise<{ restauranteId: string; mpUserId: string; conectado: boolean }> {
    const body = new URLSearchParams({
      client_id: process.env.MP_CLIENT_ID!,
      client_secret: process.env.MP_CLIENT_SECRET!,
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.MP_REDIRECT_URI!,
    })

    const response = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })

    if (!response.ok) {
      throw new InternalServerErrorException('MP OAuth falló')
    }

    const tokenData = (await response.json()) as MpTokenResponse

    await this.prisma.restaurante.update({
      where: { id: restauranteId },
      data: {
        mpAccessToken: this.crypto.encrypt(tokenData.access_token),
        mpRefreshToken: tokenData.refresh_token
          ? this.crypto.encrypt(tokenData.refresh_token)
          : null,
        mpUserId: String(tokenData.user_id),
      },
    })

    return { restauranteId, mpUserId: String(tokenData.user_id), conectado: true }
  }

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

    const pago = await this.prisma.pago.create({
      data: {
        pedidoId,
        monto,
        metodo: 'efectivo',
        estado: 'pendiente',
      },
    })

    return { pagoId: pago.id, sesionId, estado: 'efectivo_solicitado' }
  }

  async confirmarEfectivo(sesionId: string) {
    const pedidoConEfectivo = await this.prisma.pedido.findFirst({
      where: { sesionId, pago: { metodo: 'efectivo' } },
      include: { pago: true },
      orderBy: { createdAt: 'desc' },
    })

    if (pedidoConEfectivo?.pago) {
      await this.prisma.$transaction([
        this.prisma.pago.update({
          where: { id: pedidoConEfectivo.pago.id },
          data: { estado: 'aprobado' },
        }),
        this.prisma.sesionMesa.update({
          where: { id: sesionId },
          data: { estado: 'cerrada', cerradaEn: new Date() },
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
        },
      })
      await tx.sesionMesa.update({
        where: { id: sesionId },
        data: { estado: 'cerrada', cerradaEn: new Date() },
      })
    })

    return { sesionId, estado: 'cerrada' }
  }
}
