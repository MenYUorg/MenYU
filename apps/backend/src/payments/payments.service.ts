import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { MenyuGateway } from '../gateway/menyu.gateway'
import { MercadoPagoProvider } from './providers/mercado-pago.provider'
import { MercadoPagoOAuthService } from './mercado-pago-oauth.service'
import { DivisionService } from '../comensales/division.service'
import { ComensalesService } from '../comensales/comensales.service'
import { PaymentStatus } from './providers/payment-provider.interface'
import { isAllowedOrigin } from '../common/is-allowed-origin'
import { runSerializableTransaction } from '../common/run-serializable-transaction'
import { assertStaffAccess } from '../common/assert-staff-access'
import { ESTADO_PAGO_PENDIENTE, ESTADO_PAGO_APROBADO } from '../common/estado-pago.constant'
import { JwtPayload } from '../auth/auth.service'
import { CobrarComensalDto } from './dto/cobrar-comensal.dto'

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

export interface EstadoComensalDto {
  comensalId: string | null
  nombre: string
  monto: number | null
  estadoPago: string | null
  pagoId: string | null
}

export interface EstadoComensalesResult {
  modoDivision: 'partes_iguales' | 'por_consumo' | null
  divisionPagosHabilitada: boolean
  cantidadComensales: number | null
  totalSesion: number
  totalCobrado: number
  saldoPendiente: number
  comensales: EstadoComensalDto[]
  hayPagosPendientes: boolean
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
    private readonly comensalesService: ComensalesService,
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

  async estadoComensales(sesionId: string, user: JwtPayload): Promise<EstadoComensalesResult> {
    const sesion = await this.prisma.sesionMesa.findUnique({
      where: { id: sesionId },
      select: {
        modoDivision: true,
        cantidadComensales: true,
        mesa: {
          select: {
            restauranteId: true,
            restaurante: { select: { divisionPagosHabilitada: true } },
          },
        },
      },
    })
    if (!sesion) throw new NotFoundException('Sesión no encontrada')

    await assertStaffAccess(this.prisma, sesion.mesa.restauranteId, user)

    const { totalSesion, totalCobrado, saldoPendiente } = await this.divisionService.obtenerSaldo(sesionId)
    const comensalesReales = await this.comensalesService.listarComensales(sesionId)

    const montosPorComensal = new Map<string, number>()
    // Monto de cualquier slot virtual (Invitado N) si se materializa y cobra. Solo se
    // puede afirmar cuando ya hay ≥1 comensal real: el resto de centavos de la
    // división siempre cae en comensales[0] (el más antiguo por createdAt), que en
    // ese caso ya está fijo. Con 0 comensales reales no sabemos cuál virtual será "el
    // primero" al materializarse, así que no estimamos (null) en vez de mostrar un
    // número que la Tarea 5 después no replique.
    let montoBaseVirtual: number | null = null

    if (sesion.modoDivision === 'partes_iguales') {
      const resultado = await this.divisionService.calcularPartesIguales(sesionId)
      resultado.partes.forEach((p) => montosPorComensal.set(p.comensalId, p.monto))
      if (comensalesReales.length > 0) {
        montoBaseVirtual = resultado.parteBase
      }
    } else if (sesion.modoDivision === 'por_consumo') {
      const resultado = await this.divisionService.calcularPorConsumo(sesionId)
      resultado.partes.forEach((p) => montosPorComensal.set(p.comensalId, p.monto))
      montoBaseVirtual = 0 // un slot virtual no existe: no puede tener ítems etiquetados
    }

    const pagosComensales = await this.prisma.pago.findMany({
      where: { sesionId, comensalId: { not: null } },
    })
    const pagoPorComensal = new Map(pagosComensales.map((p) => [p.comensalId as string, p]))

    const comensales: EstadoComensalDto[] = comensalesReales.map((c) => {
      const pago = pagoPorComensal.get(c.id)
      return {
        comensalId: c.id,
        nombre: c.nombre,
        monto: montosPorComensal.get(c.id) ?? null,
        estadoPago: pago?.estado ?? null,
        pagoId: pago?.id ?? null,
      }
    })

    // Slots virtuales: nunca se persisten, solo completan la respuesta hasta
    // cantidadComensales.
    const cantidadDeclarada = sesion.cantidadComensales ?? 0
    const faltantes = Math.max(0, cantidadDeclarada - comensalesReales.length)
    for (let i = 0; i < faltantes; i++) {
      comensales.push({
        comensalId: null,
        nombre: `Invitado ${comensalesReales.length + i + 1}`,
        monto: montoBaseVirtual,
        estadoPago: null,
        pagoId: null,
      })
    }

    const hayPagosPendientes = pagosComensales.some((p) => p.estado === ESTADO_PAGO_PENDIENTE)

    return {
      modoDivision: sesion.modoDivision as 'partes_iguales' | 'por_consumo' | null,
      divisionPagosHabilitada: sesion.mesa.restaurante.divisionPagosHabilitada,
      cantidadComensales: sesion.cantidadComensales,
      totalSesion,
      totalCobrado,
      saldoPendiente,
      comensales,
      hayPagosPendientes,
    }
  }

  async cobrarComensal(sesionId: string, dto: CobrarComensalDto, user: JwtPayload) {
    const sesion = await this.prisma.sesionMesa.findUnique({
      where: { id: sesionId },
      select: {
        cerradaEn: true,
        modoDivision: true,
        cantidadComensales: true,
        mesaId: true,
        mesa: { select: { numero: true, restauranteId: true } },
      },
    })
    if (!sesion) throw new NotFoundException('Sesión no encontrada')
    if (sesion.cerradaEn !== null) throw new BadRequestException('La sesión ya fue cerrada')

    await assertStaffAccess(this.prisma, sesion.mesa.restauranteId, user)

    if (sesion.modoDivision === null) {
      throw new BadRequestException(
        'La sesión todavía no tiene definido cómo se divide la cuenta. Podés cobrar la mesa completa.',
      )
    }
    const modoDivision = sesion.modoDivision

    const fechaCobro = new Date()

    const sesionCerrada = await runSerializableTransaction(this.prisma, async (tx) => {
      let comensalId: string

      if (dto.comensalId === null) {
        // Materializar el slot virtual: revalidar que el índice sigue vacío
        // (nadie se registró como comensal real en el medio, corriendo el rango).
        const comensalesActuales = await tx.comensal.findMany({
          where: { sesionId },
          orderBy: { createdAt: 'asc' },
        })
        const primerIndiceVirtual = comensalesActuales.length + 1
        const ultimoIndiceVirtual = sesion.cantidadComensales ?? 0
        const indiceSlot = dto.indiceSlot!
        if (indiceSlot < primerIndiceVirtual || indiceSlot > ultimoIndiceVirtual) {
          throw new ConflictException(
            'La lista de comensales cambió: ese lugar ya no es un slot vacío. Volvé a consultar el estado antes de cobrar.',
          )
        }

        const nombre = `Invitado ${indiceSlot}`
        const nombreNormalizado = nombre.trim().toLowerCase()
        const colision = await tx.comensal.findUnique({
          where: { sesionId_nombreNormalizado: { sesionId, nombreNormalizado } },
        })
        if (colision) {
          throw new ConflictException(
            `Ya existe un comensal llamado "${nombre}" en esta sesión. Volvé a consultar el estado antes de cobrar.`,
          )
        }

        const nuevoComensal = await tx.comensal.create({
          data: { sesionId, nombre, nombreNormalizado },
        })
        comensalId = nuevoComensal.id
      } else {
        const comensal = await tx.comensal.findUnique({ where: { id: dto.comensalId } })
        if (!comensal || comensal.sesionId !== sesionId) {
          throw new NotFoundException('Comensal no encontrado en esta sesión')
        }
        comensalId = comensal.id
      }

      // Monto real DESPUÉS de materializar, con la misma tx: nunca el estimado
      // que mostró GET /payments/sesiones/:sesionId/comensales.
      const resultado =
        modoDivision === 'partes_iguales'
          ? await this.divisionService.calcularPartesIguales(sesionId, tx)
          : await this.divisionService.calcularPorConsumo(sesionId, tx)
      const parte = resultado.partes.find((p) => p.comensalId === comensalId)

      if (!parte) {
        this.logger.error(
          `cobrarComensal: comensalId ${comensalId} no aparece en el resultado de ${modoDivision} para la sesión ${sesionId}`,
        )
        throw new InternalServerErrorException(
          'Ocurrió un error inesperado calculando el monto de este comensal.',
        )
      }
      if (parte.monto === 0) {
        throw new BadRequestException(
          'Este comensal no tiene ítems asignados: no hay nada que cobrarle todavía.',
        )
      }

      const pagoExistente = await tx.pago.findUnique({
        where: { sesionId_comensalId: { sesionId, comensalId } },
      })
      if (pagoExistente?.estado === ESTADO_PAGO_APROBADO) {
        throw new ConflictException('Este comensal ya tiene un pago aprobado.')
      }

      if (pagoExistente) {
        await tx.pago.update({
          where: { id: pagoExistente.id },
          data: {
            estado: ESTADO_PAGO_APROBADO,
            monto: parte.monto,
            metodo: dto.metodoPago,
            mozoId: dto.mozoId || null,
            referenciaExterna: null,
            fechaCobro,
          },
        })
      } else {
        await tx.pago.create({
          data: {
            sesionId,
            comensalId,
            monto: parte.monto,
            metodo: dto.metodoPago,
            estado: ESTADO_PAGO_APROBADO,
            mozoId: dto.mozoId || null,
            fechaCobro,
          },
        })
      }

      const totalSesion = await this.divisionService.calcularTotalSesion(tx, sesionId)
      const pagosAprobados = await tx.pago.findMany({
        where: { sesionId, estado: ESTADO_PAGO_APROBADO },
      })
      const totalCubierto = pagosAprobados.reduce((acc, p) => acc + Number(p.monto), 0)

      if (totalCubierto >= totalSesion) {
        await tx.sesionMesa.update({
          where: { id: sesionId },
          data: { estado: 'cerrada', cerradaEn: fechaCobro },
        })
        await tx.mesa.update({ where: { id: sesion.mesaId }, data: { estado: 'libre' } })
        return true
      }
      return false
    }, 'cobrarComensal')

    if (sesionCerrada) {
      this.gateway.emitSesionCobrada(sesion.mesa.restauranteId, {
        sesionId,
        mesaId: sesion.mesaId,
        mesaNumero: sesion.mesa.numero,
      })
    }

    return { ok: true }
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

    const { sesion, pago, llamado } = await this.prisma.$transaction(async (tx) => {
      const sesion = await tx.sesionMesa.findUnique({
        where: { id: sesionId },
        include: {
          mesa: { select: { id: true, numero: true, restauranteId: true } },
          pedidos: { include: { items: { select: { cantidad: true, precioUnitario: true } } } },
        },
      })
      if (!sesion) throw new NotFoundException('Sesión no encontrada')

      let monto: number
      if (comensalId !== null) {
        const modoReal = await this.resolverModoDivision(tx, sesionId, sesion.modoDivision, modo)
        monto = await this.montoParaComensal(sesionId, comensalId, modoReal)
      } else {
        monto = await this.saldoPendienteSesion(sesionId)
      }

      await this.assertSinPagoEnConflicto(tx, sesionId, comensalId)

      const pago = await tx.pago.create({
        data: {
          sesionId,
          comensalId,
          monto,
          metodo: 'efectivo',
          estado: 'pendiente',
        },
      })

      // Reemplazar cualquier llamado pendiente y crear uno con motivo pedir_cuenta
      await tx.llamadoMozo.deleteMany({
        where: { sesionId, estado: 'pendiente' },
      })
      const llamado = await tx.llamadoMozo.create({
        data: { sesionId, motivo: 'pedir_cuenta' },
      })

      return { sesion, pago, llamado }
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

  async avisarMozoPedidoDeCuenta(sesionId: string) {
    const sesion = await this.prisma.sesionMesa.findUnique({
      where: { id: sesionId },
      include: {
        mesa: { select: { id: true, numero: true, restauranteId: true } },
        pedidos: { include: { items: { select: { cantidad: true, precioUnitario: true } } } },
      },
    })
    if (!sesion) throw new NotFoundException('Sesión no encontrada')

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

  async confirmarEfectivo(pagoId: string, mozoId?: string) {
    const fechaCobro = new Date()

    const pago = await this.prisma.pago.findUnique({
      where: { id: pagoId },
      include: { sesion: { select: { mesaId: true } } },
    })
    if (!pago || pago.metodo !== 'efectivo') {
      throw new NotFoundException('Pago en efectivo no encontrado')
    }

    return runSerializableTransaction(this.prisma, async (tx) => {
      await tx.pago.update({
        where: { id: pagoId },
        data: { estado: 'aprobado', fechaCobro, ...(mozoId ? { mozoId } : {}) },
      })

      const totalSesion = await this.divisionService.calcularTotalSesion(tx, pago.sesionId)
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
    }, 'confirmarEfectivo')
  }

  async crearPreferenciaMercadoPago(
    sesionId: string,
    comensalId: string | null,
    modo: 'partes_iguales' | 'por_consumo' | null,
    origin?: string,
  ) {
    if (comensalId !== null) {
      const comensal = await this.prisma.comensal.findUnique({ where: { id: comensalId } })
      if (!comensal || comensal.sesionId !== sesionId) {
        throw new NotFoundException('Comensal no encontrado en esta sesión')
      }
    }

    // Fase 1: todo lo transaccional — sin I/O externa adentro.
    const { pago, monto, restauranteId } = await this.prisma.$transaction(async (tx) => {
      const sesion = await tx.sesionMesa.findUnique({
        where: { id: sesionId },
        include: { mesa: { select: { restauranteId: true } } },
      })
      if (!sesion) throw new NotFoundException('Sesión no encontrada')

      let monto: number
      if (comensalId !== null) {
        const modoReal = await this.resolverModoDivision(tx, sesionId, sesion.modoDivision, modo)
        monto = await this.montoParaComensal(sesionId, comensalId, modoReal)
      } else {
        monto = await this.saldoPendienteSesion(sesionId)
      }

      await this.assertSinPagoEnConflicto(tx, sesionId, comensalId)

      // La unique compuesta (sesionId, comensalId) no aplica con comensalId
      // null — Postgres trata cada NULL como distinto — así que el slot de
      // "mesa completa" se busca y actualiza a mano en vez de con upsert.
      const pago =
        comensalId !== null
          ? await tx.pago.upsert({
              where: { sesionId_comensalId: { sesionId, comensalId } },
              update: { metodo: 'mercadopago', estado: 'pendiente', monto },
              create: { sesionId, comensalId, metodo: 'mercadopago', estado: 'pendiente', monto },
            })
          : await (async () => {
              const existente = await tx.pago.findFirst({ where: { sesionId, comensalId: null } })
              return existente
                ? tx.pago.update({
                    where: { id: existente.id },
                    data: { metodo: 'mercadopago', estado: 'pendiente', monto },
                  })
                : tx.pago.create({
                    data: { sesionId, comensalId: null, metodo: 'mercadopago', estado: 'pendiente', monto },
                  })
            })()

      return { pago, monto, restauranteId: sesion.mesa.restauranteId }
    })

    // Fase 2: I/O externa (Mercado Pago), fuera de la transacción.
    // Si esto falla, el Pago ya quedó 'pendiente' sin preferencia asociada —
    // comportamiento preexistente, no introducido acá (ya pasaba antes de partir el método en dos fases).
    const accessToken = await this.mpOAuth.getAccessTokenDecrypted(restauranteId)
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

  private async resolverModoDivision(
    tx: Prisma.TransactionClient,
    sesionId: string,
    modoDivisionActual: string | null,
    modoPedido: 'partes_iguales' | 'por_consumo' | null,
  ): Promise<'partes_iguales' | 'por_consumo'> {
    if (modoDivisionActual) {
      return modoDivisionActual as 'partes_iguales' | 'por_consumo'
    }
    if (!modoPedido) {
      throw new BadRequestException(
        'Debe indicarse el modo de división: la sesión aún no lo tiene definido',
      )
    }

    const { count } = await tx.sesionMesa.updateMany({
      where: { id: sesionId, modoDivision: null },
      data: { modoDivision: modoPedido },
    })
    if (count === 0) {
      // Otra transacción concurrente lo fijó primero: usar ese valor, no el que pedimos nosotros.
      const actual = await tx.sesionMesa.findUniqueOrThrow({
        where: { id: sesionId },
        select: { modoDivision: true },
      })
      return actual.modoDivision as 'partes_iguales' | 'por_consumo'
    }
    return modoPedido
  }

  private async montoParaComensal(
    sesionId: string,
    comensalId: string,
    modo: 'partes_iguales' | 'por_consumo',
  ): Promise<number> {
    const resultado =
      modo === 'partes_iguales'
        ? await this.divisionService.calcularPartesIguales(sesionId)
        : await this.divisionService.calcularPorConsumo(sesionId)
    const parte = resultado.partes.find((p) => p.comensalId === comensalId)
    if (!parte) {
      throw new NotFoundException('No se encontró el monto correspondiente a este comensal')
    }
    return parte.monto
  }

  private async saldoPendienteSesion(sesionId: string): Promise<number> {
    const totalSesion = await this.divisionService.calcularTotalSesion(this.prisma, sesionId)

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

  // Un pago de "mesa completa" (comensalId null) y uno individual no pueden
  // quedar pendientes en simultáneo: si los dos se aprueban después, la sesión
  // cobra de más. Se bloquea el que se crea segundo mientras el otro siga
  // "reciente". Ventanas distintas por método: un checkout de Mercado Pago se
  // resuelve en minutos, pero un efectivo pendiente espera legítimamente a que
  // el mozo se acerque, y en una mesa llena eso supera los 5 minutos.
  private static readonly VENTANA_CONFLICTO_MP_MS = 5 * 60 * 1000
  private static readonly VENTANA_CONFLICTO_EFECTIVO_MS = 30 * 60 * 1000

  private async assertSinPagoEnConflicto(
    tx: Prisma.TransactionClient,
    sesionId: string,
    comensalId: string | null,
  ): Promise<void> {
    const ahora = Date.now()
    const desdeMp = new Date(ahora - PaymentsService.VENTANA_CONFLICTO_MP_MS)
    const desdeEfectivo = new Date(ahora - PaymentsService.VENTANA_CONFLICTO_EFECTIVO_MS)

    const conflicto = await tx.pago.findFirst({
      where: {
        sesionId,
        estado: 'pendiente',
        comensalId: comensalId === null ? { not: null } : null,
        OR: [
          { metodo: 'mercadopago', createdAt: { gte: desdeMp } },
          { metodo: 'efectivo', createdAt: { gte: desdeEfectivo } },
        ],
      },
    })

    if (!conflicto) return

    if (comensalId === null) {
      throw new ConflictException(
        'Hay un pago individual en curso en esta mesa. Esperá unos minutos a que se resuelva antes de pagar toda la cuenta.',
      )
    }
    throw new ConflictException(
      'Alguien está pagando toda la cuenta en este momento. Esperá unos minutos a que se resuelva antes de pagar tu parte.',
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

    const sesionCerrada = await runSerializableTransaction(this.prisma, async (tx) => {
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
