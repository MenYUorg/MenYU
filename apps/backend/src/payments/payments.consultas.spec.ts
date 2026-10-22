import { ForbiddenException, Logger, NotFoundException } from '@nestjs/common'
import { DivisionService } from '../comensales/division.service'
import { AccesoService } from '../auth/supabase/acceso.service'
import { MenyuGateway } from '../gateway/menyu.gateway'
import { PrismaService } from '../prisma/prisma.service'
import { MercadoPagoOAuthService } from './mercado-pago-oauth.service'
import { PaymentsService } from './payments.service'
import { MercadoPagoProvider } from './providers/mercado-pago.provider'

// Sesiones para caja, el aviso de "pedir la cuenta", las back_urls de Mercado Pago según el Origin y los
// webhooks que no cambian nada. El resto de PaymentsService está en payments.service.spec.
const prisma = {
  sesionMesa: { findMany: jest.fn(), findUnique: jest.fn() },
  llamadoMozo: { deleteMany: jest.fn(), create: jest.fn() },
  pago: { findUnique: jest.fn(), updateMany: jest.fn() },
  $transaction: jest.fn(),
}
const gateway = { emitMozoCalled: jest.fn(), emitQuierePagar: jest.fn(), emitSesionCobrada: jest.fn() }
const mpProvider = { createPreference: jest.fn(), processWebhook: jest.fn() }
const mpOAuth = { getAccessTokenDecrypted: jest.fn() }
const division = { calcularTotalSesion: jest.fn() }

function crearTx() {
  return {
    pago: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'pago-mp' }) },
  }
}

describe('PaymentsService: caja, cuenta, back_urls y webhooks sin cambios', () => {
  const entorno = process.env
  let service: PaymentsService
  let tx: ReturnType<typeof crearTx>

  beforeEach(() => {
    jest.clearAllMocks()
    tx = crearTx()
    prisma.$transaction.mockImplementation((fn: (cliente: typeof tx) => unknown) => fn(tx))
    service = new PaymentsService(
      prisma as unknown as PrismaService,
      gateway as unknown as MenyuGateway,
      mpProvider as unknown as MercadoPagoProvider,
      mpOAuth as unknown as MercadoPagoOAuthService,
      division as unknown as DivisionService,
      {} as AccesoService,
    )
  })

  afterEach(() => {
    process.env = entorno
  })

  describe('getSesiones (caja)', () => {
    const sesion = (estado: string, pagos: object[]) => ({
      id: `ses-${estado}-${pagos.length}`,
      estado,
      cerradaEn: estado === 'cerrada' ? new Date('2026-10-18T22:00:00Z') : null,
      mesa: { numero: '4' },
      pedidos: [{ id: 'ped-1', estado: 'entregado', items: [{ precioUnitario: '1000.00', cantidad: 2 }, { precioUnitario: '250.00', cantidad: 1 }] }],
      pagos,
    })

    it('las últimas 100 sesiones del restaurante, con totales por pedido y los pagos', async () => {
      // Arrange
      prisma.sesionMesa.findMany.mockResolvedValue([sesion('cerrada', [{ id: 'p1', metodo: 'efectivo', estado: 'aprobado', monto: '2250.00' }])])

      // Act
      const [resumen] = await service.getSesiones('rest-1')

      // Assert
      expect(prisma.sesionMesa.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { mesa: { restauranteId: 'rest-1' } }, orderBy: { iniciadaEn: 'desc' }, take: 100 }),
      )
      expect(resumen).toEqual({
        sesionId: 'ses-cerrada-1',
        mesaNumero: '4',
        estado: 'cerrada',
        total: 2250,
        pedidos: [{ id: 'ped-1', total: 2250, estado: 'entregado' }],
        pagos: [{ id: 'p1', metodo: 'efectivo', estado: 'aprobado', monto: 2250 }],
        cerradaEn: '2026-10-18T22:00:00.000Z',
      })
    })

    it.each([
      ['con un MP pendiente está "mp_pendiente"', [{ id: 'p', metodo: 'mercadopago', estado: 'pendiente', monto: 1 }], 'mp_pendiente'],
      ['con un efectivo sin aprobar está "efectivo_solicitado"', [{ id: 'p', metodo: 'efectivo', estado: 'pendiente', monto: 1 }], 'efectivo_solicitado'],
      ['sin pagos pendientes está "activa"', [{ id: 'p', metodo: 'efectivo', estado: 'aprobado', monto: 1 }], 'activa'],
      ['un MP rechazado no la deja pendiente', [{ id: 'p', metodo: 'mercadopago', estado: 'rechazado', monto: 1 }], 'activa'],
    ])('una sesión abierta %s', async (_, pagos, estado) => {
      prisma.sesionMesa.findMany.mockResolvedValue([sesion('activa', pagos)])

      const [resumen] = await service.getSesiones('rest-1')

      expect(resumen.estado).toBe(estado)
      expect(resumen.cerradaEn).toBeUndefined()
    })
  })

  describe('avisarMozoPedidoDeCuenta', () => {
    it('reemplaza el llamado pendiente por uno de "pedir_cuenta" y avisa al mozo con el total', async () => {
      // Arrange
      prisma.sesionMesa.findUnique.mockResolvedValue({
        id: 'ses-1',
        mesa: { id: 'mesa-1', numero: '4', restauranteId: 'rest-1', restaurante: { activo: true, marca: { activo: true } } },
        pedidos: [{ items: [{ cantidad: 2, precioUnitario: '1000.00' }] }, { items: [{ cantidad: 1, precioUnitario: '500.00' }] }],
      })
      prisma.llamadoMozo.create.mockResolvedValue({ id: 'll-1' })

      // Act
      const resultado = await service.avisarMozoPedidoDeCuenta('ses-1')

      // Assert
      expect(resultado).toEqual({ sesionId: 'ses-1', estado: 'mozo_llamado' })
      expect(prisma.llamadoMozo.deleteMany).toHaveBeenCalledWith({ where: { sesionId: 'ses-1', estado: 'pendiente' } })
      expect(prisma.llamadoMozo.create).toHaveBeenCalledWith({ data: { sesionId: 'ses-1', motivo: 'pedir_cuenta' } })
      expect(gateway.emitMozoCalled).toHaveBeenCalledWith('rest-1', { llamadoId: 'll-1', sesionId: 'ses-1', mesaNumero: '4', motivo: 'pedir_cuenta' })
      expect(gateway.emitQuierePagar).toHaveBeenCalledWith('rest-1', { sesionId: 'ses-1', mesaId: 'mesa-1', mesaNumero: '4', totalAcumulado: 2500 })
    })

    it('si la sesión no existe responde 404 y no toca los llamados', async () => {
      prisma.sesionMesa.findUnique.mockResolvedValue(null)

      await expect(service.avisarMozoPedidoDeCuenta('ses-x')).rejects.toThrow(new NotFoundException('Sesión no encontrada'))
      expect(prisma.llamadoMozo.deleteMany).not.toHaveBeenCalled()
      expect(gateway.emitMozoCalled).not.toHaveBeenCalled()
    })

    // Igual que `solicitarEfectivo`: con la baja nadie puede atender el llamado (entrega 4.7).
    it.each([
      ['el restaurante', { activo: false }],
      ['su marca', { marca: { activo: false } }],
    ])('con %s dado de baja responde 403 y no toca los llamados', async (_quien, cambios) => {
      prisma.sesionMesa.findUnique.mockResolvedValue({
        id: 'ses-1',
        mesa: { id: 'mesa-1', numero: '4', restauranteId: 'rest-1', restaurante: { activo: true, marca: { activo: true }, ...cambios } },
        pedidos: [],
      })

      await expect(service.avisarMozoPedidoDeCuenta('ses-1')).rejects.toThrow(
        new ForbiddenException('Este restaurante no está disponible'),
      )
      expect(prisma.llamadoMozo.deleteMany).not.toHaveBeenCalled()
      expect(prisma.llamadoMozo.create).not.toHaveBeenCalled()
      expect(gateway.emitMozoCalled).not.toHaveBeenCalled()
    })
  })

  describe('crearPreferenciaMercadoPago: back_urls según el Origin', () => {
    beforeEach(() => {
      process.env = { ...entorno, CORS_ORIGINS: 'https://menyu-cliente.vercel.app', CORS_ORIGIN_PATTERNS: '' }
      prisma.sesionMesa.findUnique.mockResolvedValue({ mesa: { restauranteId: 'rest-1' } })
      mpOAuth.getAccessTokenDecrypted.mockResolvedValue('token')
      division.calcularTotalSesion.mockResolvedValue(1000)
      mpProvider.createPreference.mockResolvedValue({ id: 'pref-1', initPoint: 'https://mp.test/init' })
    })

    const backUrls = () => {
      const { successUrl, failureUrl, pendingUrl } = mpProvider.createPreference.mock.calls[0][0]
      return { successUrl, failureUrl, pendingUrl }
    }

    it('con un Origin permitido (sin la barra final) arma las tres back_urls de la app', async () => {
      const resultado = await service.crearPreferenciaMercadoPago('ses-1', 'https://menyu-cliente.vercel.app/')

      expect(resultado).toEqual({ initPoint: 'https://mp.test/init', preferenceId: 'pref-1' })
      expect(backUrls()).toEqual({
        successUrl: 'https://menyu-cliente.vercel.app/pago/exitoso',
        failureUrl: 'https://menyu-cliente.vercel.app/pago/fallido',
        pendingUrl: 'https://menyu-cliente.vercel.app/pago/pendiente',
      })
    })

    it.each([
      ['sin Origin', undefined],
      ['con un Origin que no está en la lista de CORS', 'https://otro-sitio.example'],
    ])('%s no manda back_urls (el provider usa FRONTEND_URL)', async (_, origin) => {
      const debug = jest.spyOn(Logger.prototype, 'debug').mockImplementation()

      await service.crearPreferenciaMercadoPago('ses-1', origin)

      expect(backUrls()).toEqual({ successUrl: undefined, failureUrl: undefined, pendingUrl: undefined })
      expect(debug).toHaveBeenCalledWith(expect.stringContaining('uso fallback FRONTEND_URL'))
      debug.mockRestore()
    })
  })

  describe('procesarWebhookMercadoPago: notificaciones que no cambian nada', () => {
    beforeEach(() => {
      mpOAuth.getAccessTokenDecrypted.mockResolvedValue('token')
    })

    it('si el pago no existe, avisa en el log y no escribe', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation()
      mpProvider.processWebhook.mockResolvedValue({ externalId: 'mo-1', status: 'APROBADO', externalReference: 'pago-x' })
      prisma.pago.findUnique.mockResolvedValue(null)

      await expect(service.procesarWebhookMercadoPago('rest-1', 'pago-x', {})).resolves.toBeUndefined()

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('pago pago-x no encontrado'))
      expect(prisma.$transaction).not.toHaveBeenCalled()
      warn.mockRestore()
    })

    it('la misma notificación repetida (misma orden y mismo estado) no escribe ni avisa', async () => {
      mpProvider.processWebhook.mockResolvedValue({ externalId: 'mo-1', status: 'APROBADO', externalReference: 'pago-1' })
      prisma.pago.findUnique.mockResolvedValue({
        id: 'pago-1',
        sesionId: 'ses-1',
        metodo: 'mercadopago',
        estado: 'aprobado',
        referenciaExterna: 'mo-1',
        sesion: { mesaId: 'mesa-1' },
      })

      await service.procesarWebhookMercadoPago('rest-1', 'pago-1', {})

      expect(prisma.$transaction).not.toHaveBeenCalled()
      expect(gateway.emitSesionCobrada).not.toHaveBeenCalled()
    })
  })
})
