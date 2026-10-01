import { Test } from '@nestjs/testing'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'
import { PaymentsService } from './payments.service'
import { PrismaService } from '../prisma/prisma.service'
import { MenyuGateway } from '../gateway/menyu.gateway'
import { MercadoPagoProvider } from './providers/mercado-pago.provider'
import { MercadoPagoOAuthService } from './mercado-pago-oauth.service'
import { DivisionService } from '../comensales/division.service'
import { ComensalesService } from '../comensales/comensales.service'
import { JwtPayload } from '../auth/auth.service'
import {
  ESTADO_PAGO_APROBADO,
  ESTADO_PAGO_PENDIENTE,
  ESTADO_PAGO_CANCELADO,
} from '../common/estado-pago.constant'

// Fixture reusado en la Tarea 5: mocks de PrismaService/DivisionService/
// ComensalesService con el mismo patrón que sessions.service.spec.ts.
const mockPrisma = {
  sesionMesa: {
    findUnique: jest.fn(),
  },
  pago: {
    findMany: jest.fn(),
  },
  admin: {
    findUnique: jest.fn(),
  },
  restaurante: {
    findUnique: jest.fn(),
  },
  adminRestaurante: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
}

const mockGateway = {
  emitSesionCobrada: jest.fn(),
  emitMozoCalled: jest.fn(),
  emitQuierePagar: jest.fn(),
}

const mockMpProvider = {}
const mockMpOAuth = {}

const mockDivision = {
  obtenerSaldo: jest.fn(),
  calcularPartesIguales: jest.fn(),
  calcularPorConsumo: jest.fn(),
  calcularTotalSesion: jest.fn(),
}

const mockComensales = {
  listarComensales: jest.fn(),
}

// Mock del cliente `tx` que recibe el callback de runSerializableTransaction.
function createTxMock() {
  return {
    comensal: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    pago: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    sesionMesa: { update: jest.fn() },
    mesa: { update: jest.fn() },
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
        { provide: ComensalesService, useValue: mockComensales },
      ],
    }).compile()

    service = module.get(PaymentsService)
    jest.clearAllMocks()
  })

  describe('estadoComensales', () => {
    const SESION_BASE = {
      modoDivision: null as 'partes_iguales' | 'por_consumo' | null,
      cantidadComensales: null as number | null,
      mesa: {
        restauranteId: 'rest-1',
        restaurante: { divisionPagosHabilitada: true },
      },
    }

    const USER_MOZO: JwtPayload = { sub: 'mozo-1', tipo: 'mozo', restauranteId: 'rest-1' }
    const USER_MOZO_OTRO_RESTO: JwtPayload = { sub: 'mozo-2', tipo: 'mozo', restauranteId: 'rest-2' }

    const SALDO_BASE = { totalSesion: 1000, totalCobrado: 0, saldoPendiente: 1000 }

    beforeEach(() => {
      mockDivision.obtenerSaldo.mockResolvedValue(SALDO_BASE)
      mockPrisma.pago.findMany.mockResolvedValue([])
    })

    it('sesión inexistente → NotFoundException', async () => {
      mockPrisma.sesionMesa.findUnique.mockResolvedValue(null)

      await expect(service.estadoComensales('sesion-1', USER_MOZO)).rejects.toThrow(
        NotFoundException,
      )
    })

    it('sesión de otro restaurante → ForbiddenException', async () => {
      mockPrisma.sesionMesa.findUnique.mockResolvedValue(SESION_BASE) // mesa.restauranteId: 'rest-1'
      mockComensales.listarComensales.mockResolvedValue([])

      await expect(
        service.estadoComensales('sesion-1', USER_MOZO_OTRO_RESTO),
      ).rejects.toThrow(ForbiddenException)
    })

    it('modoDivision null → todos los comensales con monto null, sin llamar a calcularPartesIguales ni calcularPorConsumo', async () => {
      mockPrisma.sesionMesa.findUnique.mockResolvedValue(SESION_BASE)
      mockComensales.listarComensales.mockResolvedValue([
        { id: 'c1', nombre: 'Ana' },
        { id: 'c2', nombre: 'Beto' },
      ])

      const result = await service.estadoComensales('sesion-1', USER_MOZO)

      expect(result.comensales).toEqual([
        { comensalId: 'c1', nombre: 'Ana', monto: null, estadoPago: null, pagoId: null },
        { comensalId: 'c2', nombre: 'Beto', monto: null, estadoPago: null, pagoId: null },
      ])
      expect(mockDivision.calcularPartesIguales).not.toHaveBeenCalled()
      expect(mockDivision.calcularPorConsumo).not.toHaveBeenCalled()
    })

    it('partes_iguales con comensales reales y slots virtuales: reales con su monto de partes, virtuales con parteBase', async () => {
      mockPrisma.sesionMesa.findUnique.mockResolvedValue({
        ...SESION_BASE,
        modoDivision: 'partes_iguales',
        cantidadComensales: 4,
      })
      mockComensales.listarComensales.mockResolvedValue([
        { id: 'c1', nombre: 'Ana' },
        { id: 'c2', nombre: 'Beto' },
      ])
      mockDivision.calcularPartesIguales.mockResolvedValue({
        divisionPagosHabilitada: true,
        divisor: 4,
        parteBase: 250,
        partes: [
          { comensalId: 'c1', nombre: 'Ana', montoCentavos: 30000, monto: 300 }, // se lleva el resto
          { comensalId: 'c2', nombre: 'Beto', montoCentavos: 25000, monto: 250 },
        ],
      })

      const result = await service.estadoComensales('sesion-1', USER_MOZO)

      expect(result.comensales).toEqual([
        { comensalId: 'c1', nombre: 'Ana', monto: 300, estadoPago: null, pagoId: null },
        { comensalId: 'c2', nombre: 'Beto', monto: 250, estadoPago: null, pagoId: null },
        { comensalId: null, nombre: 'Invitado 3', monto: 250, estadoPago: null, pagoId: null },
        { comensalId: null, nombre: 'Invitado 4', monto: 250, estadoPago: null, pagoId: null },
      ])
    })

    it('partes_iguales con CERO comensales reales → los slots virtuales quedan con monto null', async () => {
      mockPrisma.sesionMesa.findUnique.mockResolvedValue({
        ...SESION_BASE,
        modoDivision: 'partes_iguales',
        cantidadComensales: 2,
      })
      mockComensales.listarComensales.mockResolvedValue([])
      // No importa que DivisionService devuelva un parteBase acá: sin comensales
      // reales, estadoComensales no puede saber cuál virtual se va a llevar el
      // resto al materializarse, así que el guard de longitud>0 debe ganar.
      mockDivision.calcularPartesIguales.mockResolvedValue({
        divisionPagosHabilitada: true,
        divisor: 2,
        parteBase: 500,
        partes: [],
      })

      const result = await service.estadoComensales('sesion-1', USER_MOZO)

      expect(result.comensales).toEqual([
        { comensalId: null, nombre: 'Invitado 1', monto: null, estadoPago: null, pagoId: null },
        { comensalId: null, nombre: 'Invitado 2', monto: null, estadoPago: null, pagoId: null },
      ])
    })

    it('por_consumo → los slots virtuales quedan con monto 0', async () => {
      mockPrisma.sesionMesa.findUnique.mockResolvedValue({
        ...SESION_BASE,
        modoDivision: 'por_consumo',
        cantidadComensales: 3,
      })
      mockComensales.listarComensales.mockResolvedValue([{ id: 'c1', nombre: 'Ana' }])
      mockDivision.calcularPorConsumo.mockResolvedValue({
        divisionPagosHabilitada: true,
        divisor: 3,
        partes: [{ comensalId: 'c1', nombre: 'Ana', montoCentavos: 50000, monto: 500 }],
        huerfanos: { items: [], totalCentavos: 0, total: 0 },
      })

      const result = await service.estadoComensales('sesion-1', USER_MOZO)

      expect(result.comensales).toEqual([
        { comensalId: 'c1', nombre: 'Ana', monto: 500, estadoPago: null, pagoId: null },
        { comensalId: null, nombre: 'Invitado 2', monto: 0, estadoPago: null, pagoId: null },
        { comensalId: null, nombre: 'Invitado 3', monto: 0, estadoPago: null, pagoId: null },
      ])
    })

    it('cantidadComensales null → ningún slot virtual', async () => {
      mockPrisma.sesionMesa.findUnique.mockResolvedValue({ ...SESION_BASE, cantidadComensales: null })
      mockComensales.listarComensales.mockResolvedValue([
        { id: 'c1', nombre: 'Ana' },
        { id: 'c2', nombre: 'Beto' },
      ])

      const result = await service.estadoComensales('sesion-1', USER_MOZO)

      expect(result.comensales).toHaveLength(2)
      expect(result.comensales.every((c) => c.comensalId !== null)).toBe(true)
    })

    it('cantidadComensales menor que los comensales reales → ningún slot virtual', async () => {
      mockPrisma.sesionMesa.findUnique.mockResolvedValue({ ...SESION_BASE, cantidadComensales: 1 })
      mockComensales.listarComensales.mockResolvedValue([
        { id: 'c1', nombre: 'Ana' },
        { id: 'c2', nombre: 'Beto' },
      ])

      const result = await service.estadoComensales('sesion-1', USER_MOZO)

      expect(result.comensales).toHaveLength(2)
      expect(result.comensales.every((c) => c.comensalId !== null)).toBe(true)
    })

    it('numeración: 2 comensales reales y cantidadComensales 4 → los virtuales son "Invitado 3" e "Invitado 4"', async () => {
      mockPrisma.sesionMesa.findUnique.mockResolvedValue({ ...SESION_BASE, cantidadComensales: 4 })
      mockComensales.listarComensales.mockResolvedValue([
        { id: 'c1', nombre: 'Ana' },
        { id: 'c2', nombre: 'Beto' },
      ])

      const result = await service.estadoComensales('sesion-1', USER_MOZO)

      const nombresVirtuales = result.comensales.filter((c) => c.comensalId === null).map((c) => c.nombre)
      expect(nombresVirtuales).toEqual(['Invitado 3', 'Invitado 4'])
    })

    it('comensal con pago cancelado → estadoPago "cancelado" y el monto se calcula igual que si nunca hubiera pagado', async () => {
      mockPrisma.sesionMesa.findUnique.mockResolvedValue({
        ...SESION_BASE,
        modoDivision: 'partes_iguales',
        cantidadComensales: 1,
      })
      mockComensales.listarComensales.mockResolvedValue([{ id: 'c1', nombre: 'Ana' }])
      mockDivision.calcularPartesIguales.mockResolvedValue({
        divisionPagosHabilitada: true,
        divisor: 1,
        parteBase: 500,
        partes: [{ comensalId: 'c1', nombre: 'Ana', montoCentavos: 50000, monto: 500 }],
      })
      mockPrisma.pago.findMany.mockResolvedValue([
        { id: 'pago-1', comensalId: 'c1', estado: 'cancelado', monto: 500 },
      ])

      const result = await service.estadoComensales('sesion-1', USER_MOZO)

      expect(result.comensales).toEqual([
        { comensalId: 'c1', nombre: 'Ana', monto: 500, estadoPago: 'cancelado', pagoId: 'pago-1' },
      ])
    })

    it('hayPagosPendientes: true solo si hay un pago en "pendiente"', async () => {
      mockPrisma.sesionMesa.findUnique.mockResolvedValue(SESION_BASE)
      mockComensales.listarComensales.mockResolvedValue([{ id: 'c1', nombre: 'Ana' }])
      mockPrisma.pago.findMany.mockResolvedValue([
        { id: 'pago-1', comensalId: 'c1', estado: 'pendiente', monto: 500 },
      ])

      const result = await service.estadoComensales('sesion-1', USER_MOZO)

      expect(result.hayPagosPendientes).toBe(true)
    })

    it('hayPagosPendientes: false si los únicos pagos están "aprobado" o "cancelado"', async () => {
      mockPrisma.sesionMesa.findUnique.mockResolvedValue(SESION_BASE)
      mockComensales.listarComensales.mockResolvedValue([
        { id: 'c1', nombre: 'Ana' },
        { id: 'c2', nombre: 'Beto' },
      ])
      mockPrisma.pago.findMany.mockResolvedValue([
        { id: 'pago-1', comensalId: 'c1', estado: 'aprobado', monto: 500 },
        { id: 'pago-2', comensalId: 'c2', estado: 'cancelado', monto: 300 },
      ])

      const result = await service.estadoComensales('sesion-1', USER_MOZO)

      expect(result.hayPagosPendientes).toBe(false)
    })
  })

  // ── cobrarComensal ───────────────────────────────────────────────────

  describe('cobrarComensal', () => {
    const SESION_COBRO_BASE = {
      cerradaEn: null as Date | null,
      modoDivision: 'partes_iguales' as 'partes_iguales' | 'por_consumo' | null,
      cantidadComensales: 4,
      mesaId: 'mesa-1',
      mesa: { numero: '5', restauranteId: 'rest-1' },
    }

    const USER_MOZO: JwtPayload = { sub: 'mozo-1', tipo: 'mozo', restauranteId: 'rest-1' }
    const USER_MOZO_OTRO_RESTO: JwtPayload = { sub: 'mozo-2', tipo: 'mozo', restauranteId: 'rest-2' }

    const DTO_REAL = { comensalId: 'c1', metodoPago: 'efectivo' as const }
    const DTO_VIRTUAL = { comensalId: null, indiceSlot: 3, metodoPago: 'efectivo' as const }

    let tx: ReturnType<typeof createTxMock>

    beforeEach(() => {
      tx = createTxMock()
      mockPrisma.$transaction.mockImplementation((fn: any) => fn(tx))
      mockDivision.calcularTotalSesion.mockResolvedValue(1000)
      tx.pago.findMany.mockResolvedValue([])
    })

    it('sesión inexistente → NotFoundException', async () => {
      mockPrisma.sesionMesa.findUnique.mockResolvedValue(null)

      await expect(service.cobrarComensal('sesion-1', DTO_REAL, USER_MOZO)).rejects.toThrow(
        NotFoundException,
      )
    })

    it('sesión ya cerrada → BadRequestException', async () => {
      mockPrisma.sesionMesa.findUnique.mockResolvedValue({ ...SESION_COBRO_BASE, cerradaEn: new Date() })

      await expect(service.cobrarComensal('sesion-1', DTO_REAL, USER_MOZO)).rejects.toThrow(
        'La sesión ya fue cerrada',
      )
    })

    it('sesión de otro restaurante → ForbiddenException', async () => {
      mockPrisma.sesionMesa.findUnique.mockResolvedValue(SESION_COBRO_BASE)

      await expect(
        service.cobrarComensal('sesion-1', DTO_REAL, USER_MOZO_OTRO_RESTO),
      ).rejects.toThrow(ForbiddenException)
    })

    it('modoDivision null → BadRequestException con mensaje accionable', async () => {
      mockPrisma.sesionMesa.findUnique.mockResolvedValue({ ...SESION_COBRO_BASE, modoDivision: null })

      await expect(service.cobrarComensal('sesion-1', DTO_REAL, USER_MOZO)).rejects.toThrow(
        'La sesión todavía no tiene definido cómo se divide la cuenta. Podés cobrar la mesa completa.',
      )
    })

    it('comensal real inexistente o de otra sesión → NotFoundException', async () => {
      mockPrisma.sesionMesa.findUnique.mockResolvedValue(SESION_COBRO_BASE)
      tx.comensal.findUnique.mockResolvedValue(null)

      await expect(service.cobrarComensal('sesion-1', DTO_REAL, USER_MOZO)).rejects.toThrow(
        NotFoundException,
      )
    })

    it('monto 0 → BadRequestException, sin tocar ningún pago', async () => {
      mockPrisma.sesionMesa.findUnique.mockResolvedValue(SESION_COBRO_BASE)
      tx.comensal.findUnique.mockResolvedValue({ id: 'c1', sesionId: 'sesion-1' })
      mockDivision.calcularPartesIguales.mockResolvedValue({
        divisionPagosHabilitada: true,
        divisor: 4,
        parteBase: 0,
        partes: [{ comensalId: 'c1', nombre: 'Ana', montoCentavos: 0, monto: 0 }],
      })

      await expect(service.cobrarComensal('sesion-1', DTO_REAL, USER_MOZO)).rejects.toThrow(
        BadRequestException,
      )
      expect(tx.pago.update).not.toHaveBeenCalled()
      expect(tx.pago.create).not.toHaveBeenCalled()
    })

    it('el comensal no aparece en el resultado de la división → InternalServerErrorException (bug interno, no monto 0 legítimo)', async () => {
      mockPrisma.sesionMesa.findUnique.mockResolvedValue(SESION_COBRO_BASE)
      tx.comensal.findUnique.mockResolvedValue({ id: 'c1', sesionId: 'sesion-1' })
      mockDivision.calcularPartesIguales.mockResolvedValue({
        divisionPagosHabilitada: true,
        divisor: 4,
        parteBase: 0,
        partes: [], // 'c1' no aparece
      })

      await expect(service.cobrarComensal('sesion-1', DTO_REAL, USER_MOZO)).rejects.toThrow(
        InternalServerErrorException,
      )
    })

    it('pago existente en "aprobado" → ConflictException, no lo pisa', async () => {
      mockPrisma.sesionMesa.findUnique.mockResolvedValue(SESION_COBRO_BASE)
      tx.comensal.findUnique.mockResolvedValue({ id: 'c1', sesionId: 'sesion-1' })
      mockDivision.calcularPartesIguales.mockResolvedValue({
        divisionPagosHabilitada: true,
        divisor: 4,
        parteBase: 250,
        partes: [{ comensalId: 'c1', nombre: 'Ana', montoCentavos: 25000, monto: 250 }],
      })
      tx.pago.findUnique.mockResolvedValue({ id: 'pago-1', estado: ESTADO_PAGO_APROBADO, monto: 250 })

      await expect(service.cobrarComensal('sesion-1', DTO_REAL, USER_MOZO)).rejects.toThrow(
        ConflictException,
      )
      expect(tx.pago.update).not.toHaveBeenCalled()
      expect(tx.pago.create).not.toHaveBeenCalled()
    })

    it('pago existente "pendiente" → se reactiva con update y limpia referenciaExterna', async () => {
      mockPrisma.sesionMesa.findUnique.mockResolvedValue(SESION_COBRO_BASE)
      tx.comensal.findUnique.mockResolvedValue({ id: 'c1', sesionId: 'sesion-1' })
      mockDivision.calcularPartesIguales.mockResolvedValue({
        divisionPagosHabilitada: true,
        divisor: 4,
        parteBase: 250,
        partes: [{ comensalId: 'c1', nombre: 'Ana', montoCentavos: 25000, monto: 250 }],
      })
      tx.pago.findUnique.mockResolvedValue({
        id: 'pago-1',
        estado: ESTADO_PAGO_PENDIENTE,
        monto: 250,
        referenciaExterna: 'mp-123',
      })

      await service.cobrarComensal('sesion-1', DTO_REAL, USER_MOZO)

      expect(tx.pago.update).toHaveBeenCalledWith({
        where: { id: 'pago-1' },
        data: expect.objectContaining({
          estado: ESTADO_PAGO_APROBADO,
          monto: 250,
          metodo: 'efectivo',
          referenciaExterna: null,
        }),
      })
      expect(tx.pago.create).not.toHaveBeenCalled()
    })

    it('pago existente "cancelado" → se reactiva con update igual que uno pendiente (reusa la misma fila, no crea otra)', async () => {
      mockPrisma.sesionMesa.findUnique.mockResolvedValue(SESION_COBRO_BASE)
      tx.comensal.findUnique.mockResolvedValue({ id: 'c1', sesionId: 'sesion-1' })
      mockDivision.calcularPartesIguales.mockResolvedValue({
        divisionPagosHabilitada: true,
        divisor: 4,
        parteBase: 250,
        partes: [{ comensalId: 'c1', nombre: 'Ana', montoCentavos: 25000, monto: 250 }],
      })
      tx.pago.findUnique.mockResolvedValue({ id: 'pago-1', estado: ESTADO_PAGO_CANCELADO, monto: 250 })

      await service.cobrarComensal('sesion-1', DTO_REAL, USER_MOZO)

      expect(tx.pago.update).toHaveBeenCalledWith({
        where: { id: 'pago-1' },
        data: expect.objectContaining({ estado: ESTADO_PAGO_APROBADO, monto: 250 }),
      })
      expect(tx.pago.create).not.toHaveBeenCalled()
    })

    it('sin pago existente → crea uno nuevo ya aprobado', async () => {
      mockPrisma.sesionMesa.findUnique.mockResolvedValue(SESION_COBRO_BASE)
      tx.comensal.findUnique.mockResolvedValue({ id: 'c1', sesionId: 'sesion-1' })
      mockDivision.calcularPartesIguales.mockResolvedValue({
        divisionPagosHabilitada: true,
        divisor: 4,
        parteBase: 250,
        partes: [{ comensalId: 'c1', nombre: 'Ana', montoCentavos: 25000, monto: 250 }],
      })
      tx.pago.findUnique.mockResolvedValue(null)
      tx.pago.create.mockResolvedValue({ id: 'pago-nuevo' })

      await service.cobrarComensal('sesion-1', DTO_REAL, USER_MOZO)

      expect(tx.pago.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sesionId: 'sesion-1',
          comensalId: 'c1',
          monto: 250,
          metodo: 'efectivo',
          estado: ESTADO_PAGO_APROBADO,
        }),
      })
      expect(tx.pago.update).not.toHaveBeenCalled()
    })

    it('modoDivision por_consumo → usa calcularPorConsumo en vez de calcularPartesIguales', async () => {
      mockPrisma.sesionMesa.findUnique.mockResolvedValue({ ...SESION_COBRO_BASE, modoDivision: 'por_consumo' })
      tx.comensal.findUnique.mockResolvedValue({ id: 'c1', sesionId: 'sesion-1' })
      mockDivision.calcularPorConsumo.mockResolvedValue({
        divisionPagosHabilitada: true,
        divisor: 4,
        partes: [{ comensalId: 'c1', nombre: 'Ana', montoCentavos: 25000, monto: 250 }],
        huerfanos: { items: [], totalCentavos: 0, total: 0 },
      })
      tx.pago.findUnique.mockResolvedValue(null)
      tx.pago.create.mockResolvedValue({ id: 'pago-nuevo' })

      await service.cobrarComensal('sesion-1', DTO_REAL, USER_MOZO)

      expect(mockDivision.calcularPorConsumo).toHaveBeenCalledWith('sesion-1', tx)
      expect(mockDivision.calcularPartesIguales).not.toHaveBeenCalled()
    })

    it('slot virtual válido → materializa el Comensal con nombre "Invitado N"', async () => {
      tx.comensal.findMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]) // 2 reales → virtuales válidos: {3, 4}
      mockPrisma.sesionMesa.findUnique.mockResolvedValue(SESION_COBRO_BASE) // cantidadComensales: 4
      tx.comensal.findUnique.mockResolvedValue(null) // sin colisión de nombre
      tx.comensal.create.mockResolvedValue({ id: 'c-nuevo' })
      mockDivision.calcularPartesIguales.mockResolvedValue({
        divisionPagosHabilitada: true,
        divisor: 4,
        parteBase: 250,
        partes: [{ comensalId: 'c-nuevo', nombre: 'Invitado 3', montoCentavos: 25000, monto: 250 }],
      })
      tx.pago.findUnique.mockResolvedValue(null)
      tx.pago.create.mockResolvedValue({ id: 'pago-nuevo' })

      await service.cobrarComensal('sesion-1', DTO_VIRTUAL, USER_MOZO) // indiceSlot: 3

      expect(tx.comensal.create).toHaveBeenCalledWith({
        data: { sesionId: 'sesion-1', nombre: 'Invitado 3', nombreNormalizado: 'invitado 3' },
      })
    })

    it('slot virtual con índice fuera de rango (alguien se registró en el medio) → ConflictException, no crea el comensal', async () => {
      mockPrisma.sesionMesa.findUnique.mockResolvedValue(SESION_COBRO_BASE) // cantidadComensales: 4
      tx.comensal.findMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }]) // ya hay 3 reales: solo el 4 sigue siendo virtual

      await expect(
        service.cobrarComensal('sesion-1', DTO_VIRTUAL, USER_MOZO), // pide indiceSlot 3
      ).rejects.toThrow(ConflictException)
      expect(tx.comensal.create).not.toHaveBeenCalled()
    })

    it('slot virtual con colisión de nombre ya existente → ConflictException, no crea el comensal', async () => {
      mockPrisma.sesionMesa.findUnique.mockResolvedValue(SESION_COBRO_BASE)
      tx.comensal.findMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }])
      tx.comensal.findUnique.mockResolvedValue({ id: 'c-otro', nombre: 'Invitado 3' }) // colisión

      await expect(service.cobrarComensal('sesion-1', DTO_VIRTUAL, USER_MOZO)).rejects.toThrow(
        ConflictException,
      )
      expect(tx.comensal.create).not.toHaveBeenCalled()
    })

    it('cierra la sesión y emite emitSesionCobrada cuando totalCubierto >= totalSesion', async () => {
      mockPrisma.sesionMesa.findUnique.mockResolvedValue(SESION_COBRO_BASE)
      tx.comensal.findUnique.mockResolvedValue({ id: 'c1', sesionId: 'sesion-1' })
      mockDivision.calcularPartesIguales.mockResolvedValue({
        divisionPagosHabilitada: true,
        divisor: 4,
        parteBase: 1000,
        partes: [{ comensalId: 'c1', nombre: 'Ana', montoCentavos: 100000, monto: 1000 }],
      })
      tx.pago.findUnique.mockResolvedValue(null)
      tx.pago.create.mockResolvedValue({ id: 'pago-nuevo' })
      tx.pago.findMany.mockResolvedValue([{ id: 'pago-nuevo', monto: 1000 }]) // cubre totalSesion (1000)

      const result = await service.cobrarComensal('sesion-1', DTO_REAL, USER_MOZO)

      expect(tx.sesionMesa.update).toHaveBeenCalledWith({
        where: { id: 'sesion-1' },
        data: { estado: 'cerrada', cerradaEn: expect.any(Date) },
      })
      expect(tx.mesa.update).toHaveBeenCalledWith({ where: { id: 'mesa-1' }, data: { estado: 'libre' } })
      expect(mockGateway.emitSesionCobrada).toHaveBeenCalledWith('rest-1', {
        sesionId: 'sesion-1',
        mesaId: 'mesa-1',
        mesaNumero: '5',
      })
      expect(result).toEqual({ ok: true })
    })

    it('no cierra la sesión ni emite el evento si el pago no cubre el total', async () => {
      mockPrisma.sesionMesa.findUnique.mockResolvedValue(SESION_COBRO_BASE)
      tx.comensal.findUnique.mockResolvedValue({ id: 'c1', sesionId: 'sesion-1' })
      mockDivision.calcularPartesIguales.mockResolvedValue({
        divisionPagosHabilitada: true,
        divisor: 4,
        parteBase: 250,
        partes: [{ comensalId: 'c1', nombre: 'Ana', montoCentavos: 25000, monto: 250 }],
      })
      tx.pago.findUnique.mockResolvedValue(null)
      tx.pago.create.mockResolvedValue({ id: 'pago-nuevo' })
      tx.pago.findMany.mockResolvedValue([{ id: 'pago-nuevo', monto: 250 }]) // totalSesion mock = 1000, no cubre

      const result = await service.cobrarComensal('sesion-1', DTO_REAL, USER_MOZO)

      expect(tx.sesionMesa.update).not.toHaveBeenCalled()
      expect(tx.mesa.update).not.toHaveBeenCalled()
      expect(mockGateway.emitSesionCobrada).not.toHaveBeenCalled()
      expect(result).toEqual({ ok: true })
    })
  })
})
