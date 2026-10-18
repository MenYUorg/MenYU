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

    describe('la mesa se resuelve antes de crear al cliente invitado', () => {
      it('tableCode inexistente → no se crea ningún cliente invitado', async () => {
        mockPrisma.mesa.findFirst.mockResolvedValue(null)

        await expect(service.open({ tableCode: 'qr-no-existe' })).rejects.toThrow(NotFoundException)

        expect(mockUsers.createCliente).not.toHaveBeenCalled()
      })

      it('pin inexistente → no se crea ningún cliente invitado', async () => {
        mockPrisma.mesa.findFirst.mockResolvedValue(null)

        await expect(service.open({ restauranteId: 'rest-1', pin: '9999' })).rejects.toThrow(NotFoundException)

        expect(mockUsers.createCliente).not.toHaveBeenCalled()
      })

      it('con un JWT, una mesa inexistente tampoco consulta al cliente', async () => {
        mockPrisma.mesa.findFirst.mockResolvedValue(null)

        await expect(service.open({ tableCode: 'qr-no-existe' }, 'Bearer valid.jwt.token')).rejects.toThrow(NotFoundException)

        expect(mockJwt.verify).not.toHaveBeenCalled()
        expect(mockUsers.findClienteById).not.toHaveBeenCalled()
      })

      it('QR de otro restaurante → no se crea ningún cliente invitado ni se mira la sesión', async () => {
        mockPrisma.mesa.findFirst.mockResolvedValue(MESA_ABIERTA)

        await expect(service.open({ tableCode: 'qr-abc', restauranteId: 'otro-rest' })).rejects.toThrow(ConflictException)

        expect(mockUsers.createCliente).not.toHaveBeenCalled()
        expect(mockPrisma.sesionMesa.findFirst).not.toHaveBeenCalled()
        expect(mockPrisma.sesionMesa.create).not.toHaveBeenCalled()
      })
    })

    describe('restauranteId junto con tableCode (D11)', () => {
      it('QR de una mesa de otro restaurante → 409 con un mensaje claro', async () => {
        mockPrisma.mesa.findFirst.mockResolvedValue(MESA_ABIERTA)

        await expect(service.open({ tableCode: 'qr-abc', restauranteId: 'otro-rest' }))
          .rejects.toThrow('Ese QR no es de este restaurante')
      })

      it('QR de una mesa del mismo restaurante → abre la sesión', async () => {
        mockPrisma.mesa.findFirst.mockResolvedValue(MESA_ABIERTA)
        mockPrisma.sesionMesa.findFirst.mockResolvedValue(SESION_ACTIVA)
        mockPrisma.sesionMesaCliente.findUnique.mockResolvedValue(null)
        mockPrisma.sesionMesaCliente.count.mockResolvedValue(1)
        mockPrisma.sesionMesaCliente.create.mockResolvedValue({})

        const result = await service.open({ tableCode: 'qr-abc', restauranteId: 'rest-1' })

        expect(result.sesionId).toBe('sesion-1')
        expect(result.restauranteId).toBe('rest-1')
      })

      it('sin restauranteId el QR se resuelve igual que antes (cualquier restaurante)', async () => {
        mockPrisma.mesa.findFirst.mockResolvedValue({ ...MESA_ABIERTA, restauranteId: 'cualquiera' })
        mockPrisma.sesionMesa.findFirst.mockResolvedValue(SESION_ACTIVA)
        mockPrisma.sesionMesaCliente.findUnique.mockResolvedValue({ id: 'smc-1' })

        const result = await service.open({ tableCode: 'qr-abc' })

        expect(result.restauranteId).toBe('cualquiera')
      })

      it('el QR se busca solo por su código y que la mesa esté activa (la comparación con el restaurante es aparte)', async () => {
        mockPrisma.mesa.findFirst.mockResolvedValue(null)

        await expect(service.open({ tableCode: 'qr-abc', restauranteId: 'rest-1' })).rejects.toThrow(NotFoundException)

        expect(mockPrisma.mesa.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({ where: { qrToken: 'qr-abc', activo: true } }),
        )
      })

      it('el PIN se busca dentro del restaurante indicado', async () => {
        mockPrisma.mesa.findFirst.mockResolvedValue(null)

        await expect(service.open({ restauranteId: 'rest-1', pin: '1234' })).rejects.toThrow(NotFoundException)

        expect(mockPrisma.mesa.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({ where: { restauranteId: 'rest-1', pin: '1234', activo: true } }),
        )
      })

      it('un PIN de otro restaurante no encuentra la mesa (no se crea el invitado)', async () => {
        mockPrisma.mesa.findFirst.mockResolvedValue(null)

        await expect(service.open({ restauranteId: 'otro-rest', pin: '1234' })).rejects.toThrow('Mesa no encontrada')

        expect(mockUsers.createCliente).not.toHaveBeenCalled()
      })
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

    // Fecha fija: la ventana de 10 min de registrarCobro se evalúa contra new Date().
    const AHORA = new Date('2026-10-12T15:00:00.000Z')
    const hace = (min: number) => new Date(AHORA.getTime() - min * 60_000)
    const pagoMp = (id: string, monto: number, createdAt: Date) => ({
      id,
      monto,
      metodo: 'mercadopago',
      estado: ESTADO_PAGO_PENDIENTE,
      createdAt,
    })

    let tx: ReturnType<typeof createTxMock>

    beforeEach(() => {
      // Solo Date es falso: el resto de los timers (y las promesas) siguen reales.
      jest.useFakeTimers({
        now: AHORA,
        doNotFake: [
          'nextTick', 'setImmediate', 'setTimeout', 'clearTimeout',
          'setInterval', 'clearInterval', 'queueMicrotask',
        ],
      })
      mockPrisma.sesionMesa.findUnique.mockResolvedValue(SESION_PARA_COBRO)
      tx = createTxMock()
      mockPrisma.$transaction.mockImplementation((fn: any) => fn(tx))
      // Por defecto no hay efectivo pendiente: se crea una fila nueva.
      tx.pago.findFirst.mockResolvedValue(null)
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('MP pendiente reciente y no viene el flag → 409, ningún pago se modifica', async () => {
      mockDivision.calcularTotalSesion.mockResolvedValue(1000)
      tx.pago.findMany
        .mockResolvedValueOnce([]) // aprobados previos: saldoPendiente > 0, sigue el flujo
        .mockResolvedValueOnce([pagoMp('pago-mp1', 300, hace(3))]) // MP pendientes

      let error: unknown
      try {
        await service.registrarCobro('sesion-1', DTO_BASE, USER_MOZO)
      } catch (e) {
        error = e
      }
      expect(error).toBeInstanceOf(ConflictException)
      expect((error as Error).message).toBe(
        'Un comensal inició un pago por MercadoPago de $300.00 hace 3 minutos. Si cobrás la mesa, ese pago se cancela.',
      )

      expect(tx.pago.updateMany).not.toHaveBeenCalled()
      expect(tx.pago.update).not.toHaveBeenCalled()
      expect(tx.pago.create).not.toHaveBeenCalled()
      expect(tx.sesionMesa.update).not.toHaveBeenCalled()
    })

    it('MP pendiente reciente y viene el flag → queda cancelado y el cobro se registra', async () => {
      mockDivision.calcularTotalSesion.mockResolvedValue(1000)
      tx.pago.findMany
        .mockResolvedValueOnce([]) // aprobados previos
        .mockResolvedValueOnce([pagoMp('pago-mp1', 300, hace(3))]) // MP pendientes
        .mockResolvedValueOnce([{ id: 'pago-nuevo', monto: 1000 }]) // aprobados post-insert
      tx.pago.updateMany.mockResolvedValue({ count: 1 })
      tx.pago.create.mockResolvedValue({ id: 'pago-nuevo' })

      const dto = { ...DTO_BASE, confirmarCancelacionPagosPendientes: true }
      const result = await service.registrarCobro('sesion-1', dto, USER_MOZO)

      expect(tx.pago.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['pago-mp1'] } },
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

    it('sin MP pendientes → comportamiento igual que antes (sin cancelación)', async () => {
      mockDivision.calcularTotalSesion.mockResolvedValue(1000)
      tx.pago.findMany
        .mockResolvedValueOnce([]) // aprobados previos
        .mockResolvedValueOnce([]) // sin MP pendientes
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
        .mockResolvedValueOnce([]) // sin MP pendientes
        .mockResolvedValueOnce([{ id: 'pago-nuevo', monto: 700 }]) // aprobados post-insert: no cubre el total
      tx.pago.create.mockResolvedValue({ id: 'pago-nuevo' })

      const result = await service.registrarCobro('sesion-1', DTO_BASE, USER_MOZO)

      expect(tx.sesionMesa.update).not.toHaveBeenCalled()
      expect(tx.mesa.update).not.toHaveBeenCalled()
      expect(mockGateway.emitSesionCobrada).not.toHaveBeenCalled()
      expect(result).toEqual({ ok: true })
    })

    it('saldoPendiente <= 0 sin MP pendientes → BadRequestException', async () => {
      mockDivision.calcularTotalSesion.mockResolvedValue(1000)
      tx.pago.findMany.mockResolvedValueOnce([{ id: 'pago-viejo', monto: 1000 }]) // aprobados previos: ya cubre todo

      await expect(service.registrarCobro('sesion-1', DTO_BASE, USER_MOZO)).rejects.toThrow(
        'Esta sesión ya está completamente pagada',
      )
      expect(tx.pago.create).not.toHaveBeenCalled()
      expect(tx.pago.update).not.toHaveBeenCalled()
    })

    it('MP pendiente reciente Y la sesión ya está totalmente pagada, sin flag → el mozo ve "ya está pagada", no el 409 de confirmar cancelación', async () => {
      // El chequeo de saldo va antes que el de MP pendientes: ni siquiera se
      // llega a consultarlos en este escenario.
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

    it('dos MP pendientes recientes sin flag → 409 con texto plural y total sumado', async () => {
      mockDivision.calcularTotalSesion.mockResolvedValue(1000)
      tx.pago.findMany
        .mockResolvedValueOnce([]) // aprobados previos
        .mockResolvedValueOnce([
          pagoMp('pago-mp1', 300, hace(7)),
          pagoMp('pago-mp2', 200, hace(3)),
        ])

      let error: unknown
      try {
        await service.registrarCobro('sesion-1', DTO_BASE, USER_MOZO)
      } catch (e) {
        error = e
      }
      expect(error).toBeInstanceOf(ConflictException)
      expect((error as Error).message).toBe(
        'Hay 2 pagos por MercadoPago sin terminar por un total de $500.00 (el más reciente hace 3 minutos). Si cobrás la mesa, se cancelan.',
      )
      expect(tx.pago.updateMany).not.toHaveBeenCalled()
    })

    it('varios MP pendientes recientes en cualquier orden → el 409 toma como "más reciente" al de menos minutos', async () => {
      // Arrange: el más reciente (1 min) viene primero en la lista y el más viejo (8 min) en el medio.
      mockDivision.calcularTotalSesion.mockResolvedValue(1000)
      tx.pago.findMany
        .mockResolvedValueOnce([]) // aprobados previos
        .mockResolvedValueOnce([
          pagoMp('pago-mp1', 100, hace(1)),
          pagoMp('pago-mp2', 150, hace(8)),
          pagoMp('pago-mp3', 250, hace(4)),
        ])

      // Act
      let error: unknown
      try {
        await service.registrarCobro('sesion-1', DTO_BASE, USER_MOZO)
      } catch (e) {
        error = e
      }

      // Assert
      expect(error).toBeInstanceOf(ConflictException)
      expect((error as Error).message).toBe(
        'Hay 3 pagos por MercadoPago sin terminar por un total de $500.00 (el más reciente hace 1 minuto). Si cobrás la mesa, se cancelan.',
      )
      expect(tx.pago.updateMany).not.toHaveBeenCalled()
    })

    it('MP pendiente viejo (11 min) sin flag → se cancela sin aviso y el cobro se registra', async () => {
      mockDivision.calcularTotalSesion.mockResolvedValue(1000)
      tx.pago.findMany
        .mockResolvedValueOnce([]) // aprobados previos
        .mockResolvedValueOnce([pagoMp('pago-mp1', 300, hace(11))])
        .mockResolvedValueOnce([{ id: 'pago-nuevo', monto: 1000 }])
      tx.pago.updateMany.mockResolvedValue({ count: 1 })
      tx.pago.create.mockResolvedValue({ id: 'pago-nuevo' })

      const result = await service.registrarCobro('sesion-1', DTO_BASE, USER_MOZO)

      expect(tx.pago.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['pago-mp1'] } },
        data: { estado: ESTADO_PAGO_CANCELADO },
      })
      expect(result).toEqual({ ok: true })
    })

    it('MP pendiente reciente + MP pendiente viejo + flag → se cancelan ambos', async () => {
      mockDivision.calcularTotalSesion.mockResolvedValue(1000)
      tx.pago.findMany
        .mockResolvedValueOnce([]) // aprobados previos
        .mockResolvedValueOnce([
          pagoMp('pago-mp1', 300, hace(3)),
          pagoMp('pago-mp2', 200, hace(11)),
        ])
        .mockResolvedValueOnce([{ id: 'pago-nuevo', monto: 1000 }])
      tx.pago.updateMany.mockResolvedValue({ count: 2 })
      tx.pago.create.mockResolvedValue({ id: 'pago-nuevo' })

      const dto = { ...DTO_BASE, confirmarCancelacionPagosPendientes: true }
      await service.registrarCobro('sesion-1', dto, USER_MOZO)

      expect(tx.pago.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['pago-mp1', 'pago-mp2'] } },
        data: { estado: ESTADO_PAGO_CANCELADO },
      })
    })

    it('frontera de la ventana: a 9 min 59 s el MP es reciente → 409, nada se cancela', async () => {
      mockDivision.calcularTotalSesion.mockResolvedValue(1000)
      tx.pago.findMany
        .mockResolvedValueOnce([]) // aprobados previos
        .mockResolvedValueOnce([pagoMp('pago-mp1', 300, new Date(AHORA.getTime() - (10 * 60_000 - 1000)))])

      await expect(service.registrarCobro('sesion-1', DTO_BASE, USER_MOZO)).rejects.toThrow(ConflictException)
      expect(tx.pago.updateMany).not.toHaveBeenCalled()
    })

    it('frontera de la ventana: a 10 min 0 s el MP es viejo → se cancela sin aviso', async () => {
      mockDivision.calcularTotalSesion.mockResolvedValue(1000)
      tx.pago.findMany
        .mockResolvedValueOnce([]) // aprobados previos
        .mockResolvedValueOnce([pagoMp('pago-mp1', 300, new Date(AHORA.getTime() - 10 * 60_000))])
        .mockResolvedValueOnce([{ id: 'pago-nuevo', monto: 1000 }])
      tx.pago.updateMany.mockResolvedValue({ count: 1 })
      tx.pago.create.mockResolvedValue({ id: 'pago-nuevo' })

      await service.registrarCobro('sesion-1', DTO_BASE, USER_MOZO)

      expect(tx.pago.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['pago-mp1'] } },
        data: { estado: ESTADO_PAGO_CANCELADO },
      })
    })

    it('efectivo pendiente → sin 409, sin cancelaciones, se reutiliza esa fila', async () => {
      mockDivision.calcularTotalSesion.mockResolvedValue(1000)
      tx.pago.findMany
        .mockResolvedValueOnce([]) // aprobados previos
        .mockResolvedValueOnce([]) // sin MP pendientes
        .mockResolvedValueOnce([{ id: 'pago-ef', monto: 1000 }]) // aprobados post-update
      tx.pago.findFirst.mockResolvedValue({ id: 'pago-ef' })

      const result = await service.registrarCobro('sesion-1', DTO_BASE, USER_MOZO)

      expect(tx.pago.updateMany).not.toHaveBeenCalled()
      expect(tx.pago.create).not.toHaveBeenCalled()
      expect(tx.pago.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pago-ef' },
          data: expect.objectContaining({
            estado: ESTADO_PAGO_APROBADO,
            monto: 1000,
            metodo: 'efectivo',
          }),
        }),
      )
      expect(result).toEqual({ ok: true })
    })

    it('el paso 4 solo busca efectivo pendiente: no toma un MP ni la fila recién cancelada', async () => {
      mockDivision.calcularTotalSesion.mockResolvedValue(1000)
      tx.pago.findMany
        .mockResolvedValueOnce([]) // aprobados previos
        .mockResolvedValueOnce([pagoMp('pago-mp1', 300, hace(11))])
        .mockResolvedValueOnce([{ id: 'pago-nuevo', monto: 1000 }])
      tx.pago.updateMany.mockResolvedValue({ count: 1 })
      tx.pago.create.mockResolvedValue({ id: 'pago-nuevo' })

      await service.registrarCobro('sesion-1', DTO_BASE, USER_MOZO)

      expect(tx.pago.findMany).toHaveBeenNthCalledWith(2, {
        where: { sesionId: 'sesion-1', metodo: 'mercadopago', estado: ESTADO_PAGO_PENDIENTE },
      })
      expect(tx.pago.findFirst).toHaveBeenCalledWith({
        where: { sesionId: 'sesion-1', metodo: 'efectivo', estado: ESTADO_PAGO_PENDIENTE },
      })
      expect(tx.pago.update).not.toHaveBeenCalled() // el MP cancelado no se reutiliza
      expect(tx.pago.create).toHaveBeenCalled() // el cobro del mozo crea su propia fila
    })

    it('ninguna consulta de registrarCobro usa comensalId', async () => {
      mockDivision.calcularTotalSesion.mockResolvedValue(1000)
      tx.pago.findMany
        .mockResolvedValueOnce([]) // aprobados previos
        .mockResolvedValueOnce([pagoMp('pago-mp1', 300, hace(11))])
        .mockResolvedValueOnce([{ id: 'pago-nuevo', monto: 1000 }])
      tx.pago.updateMany.mockResolvedValue({ count: 1 })
      tx.pago.create.mockResolvedValue({ id: 'pago-nuevo' })

      await service.registrarCobro('sesion-1', DTO_BASE, USER_MOZO)

      const consultas = [
        ...tx.pago.findMany.mock.calls,
        ...tx.pago.findFirst.mock.calls,
        ...tx.pago.updateMany.mock.calls,
        ...tx.pago.create.mock.calls,
      ]
      expect(JSON.stringify(consultas)).not.toContain('comensalId')
    })
  })
})
