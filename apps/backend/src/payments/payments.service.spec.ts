import { Test } from '@nestjs/testing'
import { BadRequestException, ConflictException, ForbiddenException, Logger, NotFoundException } from '@nestjs/common'
import { PaymentsService } from './payments.service'
import { PrismaService } from '../prisma/prisma.service'
import { MenyuGateway } from '../gateway/menyu.gateway'
import { MercadoPagoProvider } from './providers/mercado-pago.provider'
import { AccesoService } from '../auth/supabase/acceso.service'
import { accesoDeTest, CUENTAS, MOZOS, MUNDO } from '../test/acceso-de-test'
import { MercadoPagoOAuthService } from './mercado-pago-oauth.service'
import { DivisionService } from '../comensales/division.service'
import {
  ESTADO_PAGO_APROBADO,
  ESTADO_PAGO_PENDIENTE,
  ESTADO_PAGO_CANCELADO,
} from '../common/estado-pago.constant'

// Mocks de PrismaService/DivisionService con el mismo patrón que sessions.service.spec.ts.
const mockPrisma = {
  sesionMesa: {
    findUnique: jest.fn(),
  },
  pago: {
    findUnique: jest.fn(),
    updateMany: jest.fn(),
  },
  $transaction: jest.fn(),
}

const mockGateway = {
  emitSesionCobrada: jest.fn(),
  emitMozoCalled: jest.fn(),
  emitQuierePagar: jest.fn(),
}

const mockMpProvider = { processWebhook: jest.fn(), createPreference: jest.fn() }
const mockMpOAuth = { getAccessTokenDecrypted: jest.fn() }

const mockDivision = {
  calcularTotalSesion: jest.fn(),
}

// Mock del cliente `tx` que reciben los callbacks de las transacciones.
function createTxMock() {
  return {
    pago: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    sesionMesa: { findUnique: jest.fn(), update: jest.fn() },
    mesa: { update: jest.fn() },
    llamadoMozo: { deleteMany: jest.fn(), create: jest.fn() },
  }
}

describe('PaymentsService', () => {
  let service: PaymentsService

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MenyuGateway, useValue: mockGateway },
        { provide: MercadoPagoProvider, useValue: mockMpProvider },
        { provide: MercadoPagoOAuthService, useValue: mockMpOAuth },
        { provide: DivisionService, useValue: mockDivision },
        { provide: AccesoService, useValue: accesoDeTest() },
      ],
    }).compile()

    service = module.get(PaymentsService)
    jest.clearAllMocks()
  })

  // ── solicitarEfectivo ────────────────────────────────────────────────

  describe('solicitarEfectivo', () => {
    let tx: ReturnType<typeof createTxMock>

    const SESION = {
      id: 'sesion-1',
      cerradaEn: null as Date | null,
      mesa: { id: 'mesa-1', numero: '5', restauranteId: 'rest-1' },
    }

    beforeEach(() => {
      tx = createTxMock()
      mockPrisma.$transaction.mockImplementation((fn: any) => fn(tx))
      tx.sesionMesa.findUnique.mockResolvedValue(SESION)
      tx.pago.findFirst.mockResolvedValue(null)
      tx.pago.findMany.mockResolvedValue([]) // pagos aprobados
      tx.pago.create.mockResolvedValue({ id: 'pago-ef' })
      tx.llamadoMozo.create.mockResolvedValue({ id: 'llamado-1' })
      mockDivision.calcularTotalSesion.mockResolvedValue(1000)
    })

    it('crea el efectivo si no hay uno pendiente: monto = saldo, aviso con el total de la sesión', async () => {
      mockDivision.calcularTotalSesion.mockResolvedValue(1500)
      tx.pago.findMany.mockResolvedValue([{ monto: 500 }]) // ya se cobraron 500

      const result = await service.solicitarEfectivo('sesion-1')

      expect(tx.pago.create).toHaveBeenCalledWith({
        data: { sesionId: 'sesion-1', monto: 1000, metodo: 'efectivo', estado: ESTADO_PAGO_PENDIENTE },
      })
      expect(mockDivision.calcularTotalSesion).toHaveBeenCalledTimes(1)
      expect(mockDivision.calcularTotalSesion).toHaveBeenCalledWith(tx, 'sesion-1')
      expect(mockGateway.emitMozoCalled).toHaveBeenCalled()
      expect(mockGateway.emitQuierePagar).toHaveBeenCalledWith(
        'rest-1',
        expect.objectContaining({ totalAcumulado: 1500 }), // total de la sesión, no el saldo
      )
      expect(result).toEqual({ pagoId: 'pago-ef', sesionId: 'sesion-1', estado: 'efectivo_solicitado' })
    })

    it('si ya hay un efectivo pendiente devuelve ese, sin crear ni avisar de nuevo', async () => {
      tx.pago.findFirst.mockResolvedValue({ id: 'pago-ef' })

      const result = await service.solicitarEfectivo('sesion-1')

      expect(tx.pago.create).not.toHaveBeenCalled()
      expect(tx.llamadoMozo.create).not.toHaveBeenCalled()
      expect(mockDivision.calcularTotalSesion).not.toHaveBeenCalled()
      expect(mockGateway.emitMozoCalled).not.toHaveBeenCalled()
      expect(mockGateway.emitQuierePagar).not.toHaveBeenCalled()
      expect(result).toEqual({ pagoId: 'pago-ef', sesionId: 'sesion-1', estado: 'efectivo_solicitado' })
    })

    it('la deduplicación solo mira efectivo pendiente: uno aprobado o cancelado no impide crear otro', async () => {
      // Con el filtro estado:'pendiente', la base no devuelve el aprobado/cancelado.
      await service.solicitarEfectivo('sesion-1')

      expect(tx.pago.findFirst).toHaveBeenCalledWith({
        where: { sesionId: 'sesion-1', metodo: 'efectivo', estado: ESTADO_PAGO_PENDIENTE },
      })
      expect(tx.pago.create).toHaveBeenCalled()
    })

    it('sesión cerrada → BadRequestException y no crea nada', async () => {
      tx.sesionMesa.findUnique.mockResolvedValue({ ...SESION, cerradaEn: new Date() })

      await expect(service.solicitarEfectivo('sesion-1')).rejects.toThrow(BadRequestException)

      expect(mockDivision.calcularTotalSesion).not.toHaveBeenCalled()
      expect(tx.pago.create).not.toHaveBeenCalled()
      expect(tx.llamadoMozo.create).not.toHaveBeenCalled()
      expect(mockGateway.emitMozoCalled).not.toHaveBeenCalled()
    })

    it('sesión cerrada CON un efectivo pendiente → BadRequestException, no devuelve ese pagoId', async () => {
      tx.sesionMesa.findUnique.mockResolvedValue({ ...SESION, cerradaEn: new Date() })
      tx.pago.findFirst.mockResolvedValue({ id: 'pago-ef' }) // pendiente que quedó de antes

      await expect(service.solicitarEfectivo('sesion-1')).rejects.toThrow('La sesión ya fue cerrada')

      expect(tx.pago.findFirst).not.toHaveBeenCalled() // la sesión se verifica antes de deduplicar
      expect(mockGateway.emitQuierePagar).not.toHaveBeenCalled()
    })

    it('sesión inexistente → NotFoundException', async () => {
      tx.sesionMesa.findUnique.mockResolvedValue(null)

      await expect(service.solicitarEfectivo('sesion-x')).rejects.toThrow(NotFoundException)

      expect(tx.pago.create).not.toHaveBeenCalled()
    })

    it('sesión ya pagada por completo → BadRequestException y no crea nada', async () => {
      tx.pago.findMany.mockResolvedValue([{ monto: 1000 }]) // aprobados = total

      await expect(service.solicitarEfectivo('sesion-1')).rejects.toThrow(
        'Esta sesión ya está completamente pagada',
      )

      expect(tx.pago.create).not.toHaveBeenCalled()
      expect(mockGateway.emitMozoCalled).not.toHaveBeenCalled()
    })
  })

  // ── crearPreferenciaMercadoPago ──────────────────────────────────────

  describe('crearPreferenciaMercadoPago', () => {
    let tx: ReturnType<typeof createTxMock>

    beforeEach(() => {
      tx = createTxMock()
      mockPrisma.$transaction.mockImplementation((fn: any) => fn(tx))
      mockPrisma.sesionMesa.findUnique.mockResolvedValue({ mesa: { restauranteId: 'rest-1' } })
      mockPrisma.pago.updateMany.mockResolvedValue({ count: 1 })
      mockMpOAuth.getAccessTokenDecrypted.mockResolvedValue('token')
      mockMpProvider.createPreference.mockResolvedValue({ id: 'pref-1', initPoint: 'https://mp.test/init' })
      mockDivision.calcularTotalSesion.mockResolvedValue(1000)
      tx.pago.findMany.mockResolvedValue([])
      tx.pago.updateMany.mockResolvedValue({ count: 0 })
      tx.pago.create.mockResolvedValue({ id: 'pago-nuevo' })
    })

    it('cancela los MP pendientes previos y crea una fila nueva con el saldo y external_reference = su id', async () => {
      tx.pago.findMany.mockResolvedValue([{ monto: 400 }]) // ya se cobraron 400

      const result = await service.crearPreferenciaMercadoPago('sesion-1')

      expect(tx.pago.updateMany).toHaveBeenCalledWith({
        where: { sesionId: 'sesion-1', metodo: 'mercadopago', estado: ESTADO_PAGO_PENDIENTE },
        data: { estado: ESTADO_PAGO_CANCELADO },
      })
      expect(tx.pago.create).toHaveBeenCalledWith({
        data: { sesionId: 'sesion-1', monto: 600, metodo: 'mercadopago', estado: ESTADO_PAGO_PENDIENTE },
      })
      // se cancela ANTES de crear la nueva
      expect(tx.pago.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
        tx.pago.create.mock.invocationCallOrder[0],
      )
      expect(mockMpProvider.createPreference).toHaveBeenCalledWith(
        expect.objectContaining({
          restauranteId: 'rest-1',
          sesionId: 'sesion-1',
          pagoId: 'pago-nuevo',
          externalReference: 'pago-nuevo',
          monto: 600,
          accessToken: 'token',
        }),
      )
      expect(result).toEqual({ initPoint: 'https://mp.test/init', preferenceId: 'pref-1' })
    })

    it('nunca reutiliza una fila existente', async () => {
      await service.crearPreferenciaMercadoPago('sesion-1')

      expect(tx.pago.update).not.toHaveBeenCalled()
      expect(tx.pago.findFirst).not.toHaveBeenCalled()
      expect(tx.pago.create).toHaveBeenCalledTimes(1)
    })

    it('si MP falla después de crear la fila, la cancela y propaga el error', async () => {
      mockMpProvider.createPreference.mockRejectedValue(new Error('MP caído'))

      await expect(service.crearPreferenciaMercadoPago('sesion-1')).rejects.toThrow('MP caído')

      expect(mockPrisma.pago.updateMany).toHaveBeenCalledWith({
        where: { id: 'pago-nuevo', estado: ESTADO_PAGO_PENDIENTE },
        data: { estado: ESTADO_PAGO_CANCELADO },
      })
    })

    it('si además falla la cancelación de compensación, el error que sale es el de MP', async () => {
      mockMpProvider.createPreference.mockRejectedValue(new Error('MP caído'))
      mockPrisma.pago.updateMany.mockRejectedValue(new Error('db caída'))

      await expect(service.crearPreferenciaMercadoPago('sesion-1')).rejects.toThrow('MP caído')
    })

    it('restaurante sin Mercado Pago conectado → no se crea ninguna fila', async () => {
      mockMpOAuth.getAccessTokenDecrypted.mockRejectedValue(new Error('sin conectar'))

      await expect(service.crearPreferenciaMercadoPago('sesion-1')).rejects.toThrow('sin conectar')

      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
      expect(mockMpProvider.createPreference).not.toHaveBeenCalled()
    })

    it('sesión inexistente → NotFoundException, sin pedir el token', async () => {
      mockPrisma.sesionMesa.findUnique.mockResolvedValue(null)

      await expect(service.crearPreferenciaMercadoPago('sesion-x')).rejects.toThrow(NotFoundException)

      expect(mockMpOAuth.getAccessTokenDecrypted).not.toHaveBeenCalled()
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    it('sesión ya pagada → rechaza antes de cancelar nada', async () => {
      tx.pago.findMany.mockResolvedValue([{ monto: 1000 }]) // aprobados = total

      await expect(service.crearPreferenciaMercadoPago('sesion-1')).rejects.toThrow(
        'Esta sesión ya está completamente pagada',
      )

      expect(tx.pago.updateMany).not.toHaveBeenCalled()
      expect(tx.pago.create).not.toHaveBeenCalled()
      expect(mockMpProvider.createPreference).not.toHaveBeenCalled()
    })
  })

  // ── confirmarEfectivo ────────────────────────────────────────────────

  describe('confirmarEfectivo', () => {
    let tx: ReturnType<typeof createTxMock>

    // La aprobación es un updateMany condicionado al estado pendiente: con count 0, otro lo cobró antes.
    const APROBACION = { id: 'pago-ef', estado: ESTADO_PAGO_PENDIENTE }

    beforeEach(() => {
      tx = createTxMock()
      mockPrisma.$transaction.mockImplementation((fn: any) => fn(tx))
      tx.pago.updateMany.mockResolvedValue({ count: 1 })
      mockPrisma.pago.findUnique.mockResolvedValue({
        id: 'pago-ef',
        sesionId: 'sesion-1',
        metodo: 'efectivo',
        estado: 'pendiente',
        sesion: { mesaId: 'mesa-1', mesa: { restauranteId: MUNDO.REST_1 } },
      })
    })

    it('cierre por confirmarEfectivo: cancela los pagos pendientes restantes (p. ej. un MP)', async () => {
      mockDivision.calcularTotalSesion.mockResolvedValue(1000)
      tx.pago.findMany.mockResolvedValue([{ monto: 1000 }])

      const result = await service.confirmarEfectivo({ pagoId: 'pago-ef' }, CUENTAS.MOZO)

      expect(tx.pago.updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: APROBACION }))
      expect(tx.pago.updateMany).toHaveBeenNthCalledWith(2, {
        where: { sesionId: 'sesion-1', estado: ESTADO_PAGO_PENDIENTE }, // sin filtro de método
        data: { estado: ESTADO_PAGO_CANCELADO },
      })
      const orden = (fn: jest.Mock, vez = 0) => fn.mock.invocationCallOrder[vez]
      expect(orden(tx.pago.updateMany, 1)).toBeLessThan(orden(tx.sesionMesa.update))
      expect(result).toEqual({ sesionId: 'sesion-1', estado: 'cerrada' })
    })

    it('confirmarEfectivo que no cubre el total: no cancela nada ni cierra la sesión', async () => {
      mockDivision.calcularTotalSesion.mockResolvedValue(2000)
      tx.pago.findMany.mockResolvedValue([{ monto: 1000 }])

      const result = await service.confirmarEfectivo({ pagoId: 'pago-ef' }, CUENTAS.MOZO)

      expect(tx.pago.updateMany).toHaveBeenCalledTimes(1) // solo la aprobación
      expect(tx.sesionMesa.update).not.toHaveBeenCalled()
      expect(result).toEqual({ sesionId: 'sesion-1', estado: 'activa' })
    })

    describe('a nombre de quién queda (#356)', () => {
      beforeEach(() => {
        mockDivision.calcularTotalSesion.mockResolvedValue(2000)
        tx.pago.findMany.mockResolvedValue([{ monto: 1000 }])
      })

      it.each([
        ['ya aprobado (otro mozo lo cobró)', 'aprobado'],
        ['cancelado', 'cancelado'],
      ])('un pago %s no se vuelve a confirmar: 409 y no se le cambia el autor', async (_caso, estado) => {
        mockPrisma.pago.findUnique.mockResolvedValue({
          id: 'pago-ef',
          sesionId: 'sesion-1',
          metodo: 'efectivo',
          estado,
          sesion: { mesaId: 'mesa-1', mesa: { restauranteId: MUNDO.REST_1 } },
        })

        await expect(service.confirmarEfectivo({ pagoId: 'pago-ef' }, CUENTAS.MOZO)).rejects.toThrow(
          new ConflictException('Ese pago ya no está pendiente'),
        )
        expect(mockPrisma.$transaction).not.toHaveBeenCalled()
        expect(tx.pago.updateMany).not.toHaveBeenCalled()
      })

      it('si otro lo cobró entre la lectura y la escritura (o en el reintento de la transacción): 409 y la sesión no se toca', async () => {
        tx.pago.updateMany.mockResolvedValue({ count: 0 })

        await expect(service.confirmarEfectivo({ pagoId: 'pago-ef' }, CUENTAS.MOZO)).rejects.toThrow(
          new ConflictException('Ese pago ya no está pendiente'),
        )
        expect(tx.pago.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: APROBACION }))
        expect(tx.sesionMesa.update).not.toHaveBeenCalled()
        expect(tx.mesa.update).not.toHaveBeenCalled()
      })

      it('el permiso va antes que el estado: el de otra marca recibe 403 aunque el pago ya esté cobrado', async () => {
        mockPrisma.pago.findUnique.mockResolvedValue({
          id: 'pago-ef',
          sesionId: 'sesion-1',
          metodo: 'efectivo',
          estado: 'aprobado',
          sesion: { mesaId: 'mesa-1', mesa: { restauranteId: MUNDO.REST_1 } },
        })

        await expect(service.confirmarEfectivo({ pagoId: 'pago-ef' }, CUENTAS.OWNER_B)).rejects.toThrow(ForbiddenException)
      })

      it('un MOZO lo confirma con su propio Mozo aunque mande el de otro', async () => {
        await service.confirmarEfectivo({ pagoId: 'pago-ef', mozoId: 'mozo-ajeno' }, CUENTAS.MOZO)

        expect(tx.pago.updateMany).toHaveBeenCalledWith({
          where: APROBACION,
          data: { estado: 'aprobado', fechaCobro: expect.any(Date), mozoId: MOZOS.DEL_MOZO.id, usuarioId: CUENTAS.MOZO.id },
        })
      })

      it('el OWNER lo confirma a su nombre, sin mozo', async () => {
        await service.confirmarEfectivo({ pagoId: 'pago-ef' }, CUENTAS.OWNER_A)

        expect(tx.pago.updateMany).toHaveBeenCalledWith({
          where: APROBACION,
          data: expect.objectContaining({ mozoId: null, usuarioId: CUENTAS.OWNER_A.id }),
        })
      })

      it.each([
        ['ROOT (no es un bypass)', CUENTAS.ROOT],
        ['el OWNER de otra marca (antes no se chequeaba la pertenencia)', CUENTAS.OWNER_B],
        ['la COCINA', CUENTAS.COCINA],
      ])('%s no lo confirma (403) y no se abre la transacción', async (_caso, cuenta) => {
        await expect(service.confirmarEfectivo({ pagoId: 'pago-ef' }, cuenta)).rejects.toThrow(ForbiddenException)

        expect(mockPrisma.$transaction).not.toHaveBeenCalled()
      })

      it.each([
        ['no existe', null],
        ['no es en efectivo', { id: 'pago-mp', metodo: 'mercadopago', sesion: { mesaId: 'mesa-1', mesa: { restauranteId: MUNDO.REST_1 } } }],
      ])('un pago que %s: 404', async (_caso, fila) => {
        mockPrisma.pago.findUnique.mockResolvedValue(fila)

        await expect(service.confirmarEfectivo({ pagoId: 'pago-x' }, CUENTAS.MOZO)).rejects.toThrow(NotFoundException)
      })
    })
  })

  // ── procesarWebhookMercadoPago ───────────────────────────────────────

  describe('procesarWebhookMercadoPago', () => {
    const PAGO_ID = 'pago-1'

    let tx: ReturnType<typeof createTxMock>
    let warnSpy: jest.SpyInstance

    beforeEach(() => {
      warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation()
      tx = createTxMock()
      mockPrisma.$transaction.mockImplementation((fn: any) => fn(tx))
      mockMpOAuth.getAccessTokenDecrypted.mockResolvedValue('token')
    })

    afterEach(() => {
      warnSpy.mockRestore()
    })

    // `estado` es lo que ve la lectura de afuera de la transacción; `estadoEnTx` lo que ve
    // la lectura de adentro (distinto cuando alguien lo cambió en el medio).
    function pagoEnBase(estado: string, metodo = 'mercadopago', estadoEnTx = estado) {
      mockPrisma.pago.findUnique.mockResolvedValue({
        id: PAGO_ID,
        sesionId: 'sesion-1',
        metodo,
        estado,
        referenciaExterna: null,
        sesion: { mesaId: 'mesa-1' },
      })
      tx.pago.findUnique.mockResolvedValue({ estado: estadoEnTx })
    }

    function webhook(status: string, externalReference = PAGO_ID) {
      mockMpProvider.processWebhook.mockResolvedValue({
        externalId: 'mo-123',
        status,
        externalReference,
      })
      return service.procesarWebhookMercadoPago('rest-1', PAGO_ID, {})
    }

    it('pendiente → aprobado (camino feliz): actualiza, cierra la sesión y emite el evento', async () => {
      pagoEnBase('pendiente')
      mockDivision.calcularTotalSesion.mockResolvedValue(1000)
      tx.pago.findMany.mockResolvedValue([{ monto: 1000 }])
      mockPrisma.sesionMesa.findUnique.mockResolvedValue({ mesa: { id: 'mesa-1', numero: '5' } })

      await webhook('APROBADO')

      expect(tx.pago.update).toHaveBeenCalledWith({
        where: { id: PAGO_ID },
        data: expect.objectContaining({ estado: ESTADO_PAGO_APROBADO, referenciaExterna: 'mo-123' }),
      })
      expect(tx.sesionMesa.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'sesion-1' }, data: expect.objectContaining({ estado: 'cerrada' }) }),
      )
      expect(mockGateway.emitSesionCobrada).toHaveBeenCalledWith('rest-1', {
        sesionId: 'sesion-1',
        mesaId: 'mesa-1',
        mesaNumero: '5',
      })
      expect(warnSpy).not.toHaveBeenCalled()
    })

    it('rechazado → aprobado se aplica (reintento legítimo del comensal)', async () => {
      pagoEnBase('rechazado')
      mockDivision.calcularTotalSesion.mockResolvedValue(1000)
      tx.pago.findMany.mockResolvedValue([{ monto: 1000 }])
      mockPrisma.sesionMesa.findUnique.mockResolvedValue({ mesa: { id: 'mesa-1', numero: '5' } })

      await webhook('APROBADO')

      expect(tx.pago.update).toHaveBeenCalledWith({
        where: { id: PAGO_ID },
        data: expect.objectContaining({ estado: ESTADO_PAGO_APROBADO, referenciaExterna: 'mo-123' }),
      })
      expect(warnSpy).not.toHaveBeenCalled()
    })

    it('cierre por webhook: cancela los pagos pendientes restantes de la sesión (p. ej. un efectivo)', async () => {
      pagoEnBase('pendiente')
      mockDivision.calcularTotalSesion.mockResolvedValue(1000)
      tx.pago.findMany.mockResolvedValue([{ monto: 1000 }])
      mockPrisma.sesionMesa.findUnique.mockResolvedValue({ mesa: { id: 'mesa-1', numero: '5' } })

      await webhook('APROBADO')

      expect(tx.pago.updateMany).toHaveBeenCalledWith({
        where: { sesionId: 'sesion-1', estado: ESTADO_PAGO_PENDIENTE }, // sin filtro de método
        data: { estado: ESTADO_PAGO_CANCELADO },
      })
      const orden = (fn: jest.Mock) => fn.mock.invocationCallOrder[0]
      expect(orden(tx.pago.update)).toBeLessThan(orden(tx.pago.updateMany))
      expect(orden(tx.pago.updateMany)).toBeLessThan(orden(tx.sesionMesa.update))
    })

    it('webhook que no cubre el total: no cancela nada ni cierra la sesión', async () => {
      pagoEnBase('pendiente')
      mockDivision.calcularTotalSesion.mockResolvedValue(2000)
      tx.pago.findMany.mockResolvedValue([{ monto: 1000 }])

      await webhook('APROBADO')

      expect(tx.pago.updateMany).not.toHaveBeenCalled()
      expect(tx.sesionMesa.update).not.toHaveBeenCalled()
    })

    it('aprobado sobre cancelado → no revive, deja warning de devolución manual', async () => {
      pagoEnBase('cancelado')

      await webhook('APROBADO')

      expect(tx.pago.update).not.toHaveBeenCalled()
      expect(tx.sesionMesa.update).not.toHaveBeenCalled()
      expect(mockGateway.emitSesionCobrada).not.toHaveBeenCalled()
      const mensaje = String(warnSpy.mock.calls[0][0])
      expect(mensaje).toContain('devolución manual pendiente')
      expect(mensaje).toContain('sesionId=sesion-1')
      expect(mensaje).toContain('pagoId=pago-1')
      expect(mensaje).toContain('merchantOrderId=mo-123')
    })

    it('pendiente sobre aprobado → no degrada, deja warning de transición ignorada', async () => {
      pagoEnBase('aprobado')

      await webhook('PENDIENTE')

      expect(tx.pago.update).not.toHaveBeenCalled()
      expect(String(warnSpy.mock.calls[0][0])).toContain('transición ignorada aprobado → pendiente')
    })

    it('pendiente sobre cancelado → sigue cancelado, deja warning de transición ignorada', async () => {
      pagoEnBase('cancelado')

      await webhook('PENDIENTE')

      expect(tx.pago.update).not.toHaveBeenCalled()
      expect(String(warnSpy.mock.calls[0][0])).toContain('transición ignorada cancelado → pendiente')
    })

    it('aprobado sobre aprobado → no-op silencioso (sin escritura y sin warning)', async () => {
      pagoEnBase('aprobado')

      await webhook('APROBADO')

      expect(tx.pago.update).not.toHaveBeenCalled()
      expect(warnSpy).not.toHaveBeenCalled()
    })

    it('carrera: la lectura de afuera ve pendiente pero adentro de la tx ya está cancelado → no revive', async () => {
      pagoEnBase('pendiente', 'mercadopago', 'cancelado') // el mozo cobró la mesa en el medio

      await webhook('APROBADO')

      expect(tx.pago.update).not.toHaveBeenCalled()
      expect(tx.sesionMesa.update).not.toHaveBeenCalled()
      expect(mockGateway.emitSesionCobrada).not.toHaveBeenCalled()
      expect(String(warnSpy.mock.calls[0][0])).toContain('devolución manual pendiente')
    })

    it('externalReference distinto del pagoId → no escribe', async () => {
      pagoEnBase('pendiente')

      await webhook('APROBADO', 'otro-pago')

      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
      expect(tx.pago.update).not.toHaveBeenCalled()
      expect(String(warnSpy.mock.calls[0][0])).toContain('no coincide con pagoId pago-1')
    })

    it('el pago no es de Mercado Pago → no escribe', async () => {
      pagoEnBase('pendiente', 'efectivo')

      await webhook('APROBADO')

      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
      expect(tx.pago.update).not.toHaveBeenCalled()
      expect(String(warnSpy.mock.calls[0][0])).toContain('no es de Mercado Pago')
    })
  })
})
