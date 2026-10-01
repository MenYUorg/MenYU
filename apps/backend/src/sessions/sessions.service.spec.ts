import { Test } from '@nestjs/testing'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { SessionsService } from './sessions.service'
import { PrismaService } from '../prisma/prisma.service'
import { UsersService } from '../users/users.service'
import { MenyuGateway } from '../gateway/menyu.gateway'
import { DivisionService } from '../comensales/division.service'
import { JwtPayload } from '../auth/auth.service'
import {
  ESTADO_PAGO_APROBADO,
  ESTADO_PAGO_PENDIENTE,
  ESTADO_PAGO_CANCELADO,
} from '../common/estado-pago.constant'

const mockPrisma = {
  sesionMesa: {
    findFirst:  jest.fn(),
    findUnique: jest.fn(),
    create:     jest.fn(),
    update:     jest.fn(),
  },
  sesionMesaCliente: {
    findUnique: jest.fn(),
    count:      jest.fn(),
    create:     jest.fn(),
  },
  mesa: {
    findFirst:  jest.fn(),
    findUnique: jest.fn(),
    update:     jest.fn(),
  },
  pedidoItem: {
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

const mockUsers = {
  findClienteById: jest.fn(),
  createCliente: jest.fn(),
}

const mockJwt = {
  verify: jest.fn(),
  sign: jest.fn(),
}

const mockGateway = {
  emitSesionCerrada: jest.fn(),
  emitSesionCobrada: jest.fn(),
}

const mockDivision = {
  calcularTotalSesion: jest.fn(),
}

// Mock del cliente `tx` que recibe el callback de runSerializableTransaction.
// Cada test de registrarCobro fija explícitamente qué devuelve cada llamada.
function createTxMock() {
  return {
    pago: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    sesionMesa: { update: jest.fn() },
    mesa: { update: jest.fn() },
  }
}

const MESA_ABIERTA = {
  id: 'mesa-1',
  restauranteId: 'rest-1',
  restaurante: { modoSesion: 'abierto' },
}

const MESA_SEGURA = { ...MESA_ABIERTA, restaurante: { modoSesion: 'seguro' } }

const SESION_ACTIVA = {
  id: 'sesion-1',
  mesaId: 'mesa-1',
  codigoSesion: '042',
  estado: 'activa',
}

const CLIENTE = { id: 'cli-1', nombre: 'Cliente Test' }
const INVITADO = { id: 'guest-1', nombre: 'Invitado' }

describe('SessionsService', () => {
  let service: SessionsService

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        SessionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: UsersService, useValue: mockUsers },
        { provide: JwtService,   useValue: mockJwt     },
        { provide: MenyuGateway, useValue: mockGateway },
        { provide: DivisionService, useValue: mockDivision },
      ],
    }).compile()

    service = module.get(SessionsService)
    jest.clearAllMocks()
    mockJwt.sign.mockReturnValue('mock.session.jwt')
    mockUsers.createCliente.mockResolvedValue(INVITADO)
  })

  // ── generateCodigoSesion ──────────────────────────────────────────────

  describe('generateCodigoSesion', () => {
    it('genera un string de exactamente 3 caracteres', () => {
      for (let i = 0; i < 200; i++) {
        expect((service as any).generateCodigoSesion()).toHaveLength(3)
      }
    })

    it('el valor está entre "001" y "999" — nunca "000"', () => {
      for (let i = 0; i < 500; i++) {
        const codigo = (service as any).generateCodigoSesion()
        const num = parseInt(codigo, 10)
        expect(num).toBeGreaterThanOrEqual(1)
        expect(num).toBeLessThanOrEqual(999)
      }
    })

    it('tiene padding con ceros — "001" no "1"', () => {
      // floor(0 * 999) + 1 = 1 → padStart(3, '0') = '001'
      jest.spyOn(Math, 'random').mockReturnValue(0)
      expect((service as any).generateCodigoSesion()).toBe('001')
      jest.spyOn(Math, 'random').mockRestore()
    })
  })

  // ── resolveClienteId ─────────────────────────────────────────────────

  describe('resolveClienteId', () => {
    it('JWT válido y cliente en BD → devuelve el clienteId del JWT', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'cli-1', tipo: 'cliente' })
      mockUsers.findClienteById.mockResolvedValue(CLIENTE)

      const id = await (service as any).resolveClienteId('Bearer valid.jwt.token')

      expect(id).toBe('cli-1')
      expect(mockUsers.createCliente).not.toHaveBeenCalled()
    })

    it('JWT válido pero cliente no existe en BD → crea invitado', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'cli-inexistente', tipo: 'cliente' })
      mockUsers.findClienteById.mockResolvedValue(null)

      const id = await (service as any).resolveClienteId('Bearer valid.jwt.token')

      expect(mockUsers.createCliente).toHaveBeenCalledWith({ nombre: 'Invitado' })
      expect(id).toBe('guest-1')
    })

    it('JWT expirado → crea invitado', async () => {
      mockJwt.verify.mockImplementation(() => { throw new Error('jwt expired') })

      const id = await (service as any).resolveClienteId('Bearer expired.token')

      expect(mockUsers.createCliente).toHaveBeenCalledWith({ nombre: 'Invitado' })
      expect(id).toBe('guest-1')
    })

    it('JWT malformado → crea invitado', async () => {
      mockJwt.verify.mockImplementation(() => { throw new Error('invalid token') })

      const id = await (service as any).resolveClienteId('Bearer not-a-jwt')

      expect(mockUsers.createCliente).toHaveBeenCalledWith({ nombre: 'Invitado' })
      expect(id).toBe('guest-1')
    })

    it('sin header → crea invitado', async () => {
      const id = await (service as any).resolveClienteId(undefined)

      expect(mockUsers.createCliente).toHaveBeenCalledWith({ nombre: 'Invitado' })
      expect(id).toBe('guest-1')
    })
  })

  // ── open ──────────────────────────────────────────────────────────────

  describe('open', () => {
    it('sin tableCode ni pin+restaurantId → lanza BadRequestException', async () => {
      await expect(service.open({})).rejects.toThrow(BadRequestException)
    })

    it('tableCode inexistente → lanza NotFoundException', async () => {
      mockPrisma.mesa.findFirst.mockResolvedValue(null)

      await expect(service.open({ tableCode: 'qr-no-existe' }))
        .rejects.toThrow(NotFoundException)
    })

    it('pin inexistente para ese restaurante → lanza NotFoundException', async () => {
      mockPrisma.mesa.findFirst.mockResolvedValue(null)

      await expect(service.open({ restauranteId: 'rest-1', pin: '9999' }))
        .rejects.toThrow(NotFoundException)
    })

    it('mesa sin sesión activa → crea SesionMesa con participante orden:1, devuelve esAnfitrion: true', async () => {
      mockPrisma.mesa.findFirst.mockResolvedValue(MESA_ABIERTA)
      mockPrisma.sesionMesa.findFirst.mockResolvedValue(null)
      mockPrisma.sesionMesa.create.mockResolvedValue({ id: 'nueva-sesion', codigoSesion: '007' })
      mockPrisma.$transaction.mockResolvedValue([
        { id: 'nueva-sesion', codigoSesion: '007' },
        { id: 'mesa-1', estado: 'ocupada' },
      ])

      const result = await service.open({ tableCode: 'qr-abc' })

      expect(mockPrisma.sesionMesa.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            participantes: { create: { clienteId: INVITADO.id, orden: 1 } },
          }),
        }),
      )
      expect(result.esAnfitrion).toBe(true)
      expect(result.sesionId).toBe('nueva-sesion')
    })

    it('sesión activa en modo "abierto" → devuelve mismo sesionId, esAnfitrion: false', async () => {
      mockPrisma.mesa.findFirst.mockResolvedValue(MESA_ABIERTA)
      mockPrisma.sesionMesa.findFirst.mockResolvedValue(SESION_ACTIVA)
      mockPrisma.sesionMesaCliente.findUnique.mockResolvedValue(null)
      mockPrisma.sesionMesaCliente.count.mockResolvedValue(1)
      mockPrisma.sesionMesaCliente.create.mockResolvedValue({})

      const result = await service.open({ tableCode: 'qr-abc' })

      expect(result.sesionId).toBe('sesion-1')
      expect(result.esAnfitrion).toBe(false)
      expect(mockPrisma.sesionMesa.create).not.toHaveBeenCalled()
    })

    it('modo "seguro" sin codigoSesion → ForbiddenException con mensaje correcto', async () => {
      mockPrisma.mesa.findFirst.mockResolvedValue(MESA_SEGURA)
      mockPrisma.sesionMesa.findFirst.mockResolvedValue(SESION_ACTIVA)

      await expect(service.open({ tableCode: 'qr-abc' }))
        .rejects.toThrow('Esta mesa requiere código de sesión para unirse')
    })

    it('modo "seguro" con código incorrecto → lanza ForbiddenException', async () => {
      mockPrisma.mesa.findFirst.mockResolvedValue(MESA_SEGURA)
      mockPrisma.sesionMesa.findFirst.mockResolvedValue(SESION_ACTIVA)

      await expect(service.open({ tableCode: 'qr-abc', codigoSesion: '999' }))
        .rejects.toThrow(ForbiddenException)
    })

    it('modo "seguro" con código correcto → devuelve mismo sesionId, esAnfitrion: false', async () => {
      mockPrisma.mesa.findFirst.mockResolvedValue(MESA_SEGURA)
      mockPrisma.sesionMesa.findFirst.mockResolvedValue(SESION_ACTIVA)
      mockPrisma.sesionMesaCliente.findUnique.mockResolvedValue(null)
      mockPrisma.sesionMesaCliente.count.mockResolvedValue(1)
      mockPrisma.sesionMesaCliente.create.mockResolvedValue({})

      const result = await service.open({ tableCode: 'qr-abc', codigoSesion: '042' })

      expect(result.sesionId).toBe('sesion-1')
      expect(result.esAnfitrion).toBe(false)
    })

    it('cliente que ya participa → no duplica SesionMesaCliente (idempotente)', async () => {
      mockPrisma.mesa.findFirst.mockResolvedValue(MESA_ABIERTA)
      mockPrisma.sesionMesa.findFirst.mockResolvedValue(SESION_ACTIVA)
      mockPrisma.sesionMesaCliente.findUnique.mockResolvedValue({ id: 'smc-1', clienteId: 'guest-1' })

      await service.open({ tableCode: 'qr-abc' })

      expect(mockPrisma.sesionMesaCliente.create).not.toHaveBeenCalled()
    })

    it('JWT válido en header → reutiliza clienteId existente, no crea invitado', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'cli-1', tipo: 'cliente' })
      mockUsers.findClienteById.mockResolvedValue(CLIENTE)
      mockPrisma.mesa.findFirst.mockResolvedValue(MESA_ABIERTA)
      mockPrisma.sesionMesa.findFirst.mockResolvedValue(null)
      mockPrisma.sesionMesa.create.mockResolvedValue({ id: 'nueva-sesion', codigoSesion: '042' })
      mockPrisma.$transaction.mockResolvedValue([
        { id: 'nueva-sesion', codigoSesion: '042' },
        { id: 'mesa-1', estado: 'ocupada' },
      ])

      const result = await service.open({ tableCode: 'qr-abc' }, 'Bearer valid.jwt.token')

      expect(mockUsers.createCliente).not.toHaveBeenCalled()
      expect(result.clienteId).toBe('cli-1')
    })
  })

  // ── registrarCobro ───────────────────────────────────────────────────

  describe('registrarCobro', () => {
    const SESION_PARA_COBRO = {
      id: 'sesion-1',
      cerradaEn: null,
      mesaId: 'mesa-1',
      mesa: { id: 'mesa-1', numero: '5', restauranteId: 'rest-1' },
    }

    const USER_MOZO: JwtPayload = { sub: 'mozo-1', tipo: 'mozo', restauranteId: 'rest-1' }

    const DTO_BASE = { metodoPago: 'efectivo' as const }

    let tx: ReturnType<typeof createTxMock>

    beforeEach(() => {
      mockPrisma.sesionMesa.findUnique.mockResolvedValue(SESION_PARA_COBRO)
      tx = createTxMock()
      mockPrisma.$transaction.mockImplementation((fn: any) => fn(tx))
      // Por defecto no hay pago manual pendiente: se crea uno nuevo.
      tx.pago.findFirst.mockResolvedValue(null)
    })

    it('hay pagos pendientes de comensales y no viene el flag → 409, ningún pago se modifica', async () => {
      mockDivision.calcularTotalSesion.mockResolvedValue(1000)
      tx.pago.findMany
        .mockResolvedValueOnce([]) // aprobados previos: saldoPendiente > 0, sigue el flujo
        .mockResolvedValueOnce([
          { id: 'pago-c1', monto: 300 },
          { id: 'pago-c2', monto: 200 },
        ]) // pendientes

      let error: unknown
      try {
        await service.registrarCobro('sesion-1', DTO_BASE, USER_MOZO)
      } catch (e) {
        error = e
      }
      expect(error).toBeInstanceOf(ConflictException)
      expect((error as Error).message).toBe(
        'Hay 2 pago(s) pendiente(s) de comensales por un total de $500.00. Confirmá la cancelación para cobrar toda la mesa.',
      )

      expect(tx.pago.updateMany).not.toHaveBeenCalled()
      expect(tx.pago.update).not.toHaveBeenCalled()
      expect(tx.pago.create).not.toHaveBeenCalled()
      expect(tx.sesionMesa.update).not.toHaveBeenCalled()
    })

    it('hay pendientes y viene el flag → quedan en cancelado y el cobro se registra', async () => {
      mockDivision.calcularTotalSesion.mockResolvedValue(1000)
      tx.pago.findMany
        .mockResolvedValueOnce([]) // aprobados previos
        .mockResolvedValueOnce([{ id: 'pago-c1', monto: 300 }]) // pendientes de comensales
        .mockResolvedValueOnce([{ id: 'pago-nuevo', monto: 1000 }]) // aprobados post-insert
      tx.pago.updateMany.mockResolvedValue({ count: 1 })
      tx.pago.create.mockResolvedValue({ id: 'pago-nuevo' })

      const dto = { ...DTO_BASE, confirmarCancelacionPagosPendientes: true }
      const result = await service.registrarCobro('sesion-1', dto, USER_MOZO)

      expect(tx.pago.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['pago-c1'] } },
        data: { estado: ESTADO_PAGO_CANCELADO },
      })
      expect(tx.pago.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ monto: 1000, estado: ESTADO_PAGO_APROBADO }),
        }),
      )
      expect(tx.sesionMesa.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'sesion-1' } }),
      )
      expect(mockGateway.emitSesionCobrada).toHaveBeenCalled()
      expect(result).toEqual({ ok: true })
    })

    it('no hay pendientes → comportamiento igual que antes (sin cancelación)', async () => {
      mockDivision.calcularTotalSesion.mockResolvedValue(1000)
      tx.pago.findMany
        .mockResolvedValueOnce([]) // aprobados previos
        .mockResolvedValueOnce([]) // sin pendientes de comensales
        .mockResolvedValueOnce([{ id: 'pago-nuevo', monto: 1000 }]) // aprobados post-insert
      tx.pago.create.mockResolvedValue({ id: 'pago-nuevo' })

      const result = await service.registrarCobro('sesion-1', DTO_BASE, USER_MOZO)

      expect(tx.pago.updateMany).not.toHaveBeenCalled()
      expect(tx.sesionMesa.update).toHaveBeenCalled()
      expect(result).toEqual({ ok: true })
    })

    it('la sesión se cierra solo cuando totalCubierto >= totalSesion', async () => {
      mockDivision.calcularTotalSesion.mockResolvedValue(1000)
      tx.pago.findMany
        .mockResolvedValueOnce([]) // aprobados previos
        .mockResolvedValueOnce([]) // sin pendientes de comensales
        .mockResolvedValueOnce([{ id: 'pago-nuevo', monto: 700 }]) // aprobados post-insert: no cubre el total
      tx.pago.create.mockResolvedValue({ id: 'pago-nuevo' })

      const result = await service.registrarCobro('sesion-1', DTO_BASE, USER_MOZO)

      expect(tx.sesionMesa.update).not.toHaveBeenCalled()
      expect(tx.mesa.update).not.toHaveBeenCalled()
      expect(mockGateway.emitSesionCobrada).not.toHaveBeenCalled()
      expect(result).toEqual({ ok: true })
    })

    it('saldoPendiente <= 0 sin pendientes de comensales → BadRequestException', async () => {
      mockDivision.calcularTotalSesion.mockResolvedValue(1000)
      tx.pago.findMany.mockResolvedValueOnce([{ id: 'pago-viejo', monto: 1000 }]) // aprobados previos: ya cubre todo

      await expect(service.registrarCobro('sesion-1', DTO_BASE, USER_MOZO)).rejects.toThrow(
        'Esta sesión ya está completamente pagada',
      )
      expect(tx.pago.create).not.toHaveBeenCalled()
      expect(tx.pago.update).not.toHaveBeenCalled()
    })

    it('hay pendientes de comensales Y la sesión ya está totalmente pagada, sin flag → el mozo ve "ya está pagada", no el 409 de confirmar cancelación', async () => {
      // El chequeo de saldo va antes que el de pendientes: ni siquiera se
      // llega a consultar pagos pendientes de comensales en este escenario.
      mockDivision.calcularTotalSesion.mockResolvedValue(1000)
      tx.pago.findMany.mockResolvedValueOnce([{ id: 'pago-viejo', monto: 1000 }]) // aprobados previos: ya cubre todo

      let error: unknown
      try {
        await service.registrarCobro('sesion-1', DTO_BASE, USER_MOZO)
      } catch (e) {
        error = e
      }
      expect(error).toBeInstanceOf(BadRequestException)
      expect((error as Error).message).toBe('Esta sesión ya está completamente pagada')
      expect(tx.pago.findMany).toHaveBeenCalledTimes(1)
    })
  })
})
