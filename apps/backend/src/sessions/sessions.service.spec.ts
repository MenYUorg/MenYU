import { Test } from '@nestjs/testing'
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { SessionsService } from './sessions.service'
import { PrismaService } from '../prisma/prisma.service'
import { UsersService } from '../users/users.service'
import { MenyuGateway } from '../gateway/menyu.gateway'

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
})
