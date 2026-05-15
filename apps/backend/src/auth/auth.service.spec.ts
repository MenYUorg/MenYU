import { Test } from '@nestjs/testing'
import { JwtService } from '@nestjs/jwt'
import { UnauthorizedException, ConflictException } from '@nestjs/common'
import { AuthService } from './auth.service'
import { UsersService } from '../users/users.service'
import { PrismaService } from '../prisma/prisma.service'
import * as bcrypt from 'bcryptjs'

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue('hashed_password'),
}))

const mockUsersService = {
  findAdminByEmail: jest.fn(),
  findMozoByEmail: jest.fn(),
  findClienteByEmail: jest.fn(),
  findAdminById: jest.fn(),
  findMozoById: jest.fn(),
  findClienteById: jest.fn(),
  createAdmin: jest.fn(),
  createMozo: jest.fn(),
  createCliente: jest.fn(),
}

const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock.jwt.token'),
}

const mockPrisma = {
  refreshToken: {
    create: jest.fn().mockResolvedValue({}),
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({}),
  },
  marca: { create: jest.fn(), findFirst: jest.fn() },
  restaurante: { create: jest.fn(), findFirst: jest.fn() },
}

const ADMIN = { id: 'admin-1', email: 'admin@test.com', passwordHash: 'hashed', rol: 'ADMIN', nombre: null }
const CLIENTE = { id: 'cli-1', email: 'coty@test.com', passwordHash: 'hashed', nombre: 'Coty' }
const VALID_REFRESH = {
  id: 'rt-1',
  tokenHash: expect.any(String),
  userId: 'cli-1',
  userTipo: 'cliente',
  revokedAt: null,
  expiresAt: new Date(Date.now() + 86400000 * 7),
}

describe('AuthService', () => {
  let service: AuthService

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile()

    service = module.get(AuthService)
    jest.clearAllMocks()
    mockJwtService.sign.mockReturnValue('mock.jwt.token')
    mockPrisma.refreshToken.create.mockResolvedValue({})
  })

  // ── login ─────────────────────────────────────────────────────────────

  describe('login', () => {
    it('devuelve tokens con credenciales válidas de admin', async () => {
      mockUsersService.findAdminByEmail.mockResolvedValue(ADMIN);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true)

      const result = await service.login('admin@test.com', 'password123')

      expect(result).toHaveProperty('accessToken')
      expect(result).toHaveProperty('refreshToken')
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: ADMIN.id, tipo: 'admin' }),
      )
    })

    it('lanza 401 si el usuario no existe', async () => {
      mockUsersService.findAdminByEmail.mockResolvedValue(null)

      mockUsersService.findMozoByEmail.mockResolvedValue(null)
      mockUsersService.findClienteByEmail.mockResolvedValue(null)

      await expect(service.login('noexiste@test.com', 'pass'))
        .rejects.toThrow(UnauthorizedException)
    })

    it('lanza 401 si la contraseña es incorrecta', async () => {
      mockUsersService.findAdminByEmail.mockResolvedValue(ADMIN);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false)

      await expect(service.login('admin@test.com', 'mal_password'))
        .rejects.toThrow(UnauthorizedException)
    })

    it('lanza 401 si es invitado (sin passwordHash)', async () => {
      const guest = { ...CLIENTE, passwordHash: null }
      mockUsersService.findClienteByEmail.mockResolvedValue(guest)

      await expect(service.login('coty@test.com', 'pass'))
        .rejects.toThrow(UnauthorizedException)
    })

    it('devuelve tokens con tipo mozo cuando el mozo se loguea', async () => {
      const MOZO = { id: 'mozo-1', email: 'mozo@test.com', passwordHash: 'hashed', nombre: 'Carlos' }
      mockUsersService.findAdminByEmail.mockResolvedValue(null)
      mockUsersService.findMozoByEmail.mockResolvedValue(MOZO);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true)

      const result = await service.login('mozo@test.com', 'password123')

      expect(result).toHaveProperty('accessToken')
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: MOZO.id, tipo: 'mozo' }),
      )
    })

    it('guarda el refresh token en la DB después del login', async () => {
      mockUsersService.findAdminByEmail.mockResolvedValue(ADMIN);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true)

      await service.login('admin@test.com', 'password')

      expect(mockPrisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: ADMIN.id, userTipo: 'admin' }),
        }),
      )
    })
  })

  // ── register ──────────────────────────────────────────────────────────

  describe('register', () => {
    it('crea el cliente y devuelve tokens', async () => {
      mockUsersService.findClienteByEmail.mockResolvedValue(null)
      mockUsersService.createCliente.mockResolvedValue(CLIENTE)

      const result = await service.register('Coty', 'coty@test.com', 'pass123')

      expect(bcrypt.hash).toHaveBeenCalled()
      expect(mockUsersService.createCliente).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'coty@test.com', nombre: 'Coty' }),
      )
      expect(result).toHaveProperty('accessToken')
      expect(result).toHaveProperty('refreshToken')
    })

    it('lanza 409 si el email ya está registrado', async () => {
      mockUsersService.findClienteByEmail.mockResolvedValue(CLIENTE)

      await expect(service.register('Coty', 'coty@test.com', 'pass'))
        .rejects.toThrow(ConflictException)

      expect(mockUsersService.createCliente).not.toHaveBeenCalled()
    })
  })

  // ── loginAsGuest ──────────────────────────────────────────────────────

  describe('loginAsGuest', () => {
    it('crea un cliente sin contraseña y devuelve tokens', async () => {
      const guest = { id: 'guest-1', nombre: 'Ana', email: null, passwordHash: null }
      mockUsersService.createCliente.mockResolvedValue(guest)

      const result = await service.loginAsGuest('Ana')

      expect(mockUsersService.createCliente).toHaveBeenCalledWith({ nombre: 'Ana' })
      expect(result).toHaveProperty('accessToken')
      expect(result).toHaveProperty('refreshToken')
    })

    it('usa "Invitado" como nombre por defecto si no se pasa ninguno', async () => {
      const guest = { id: 'guest-2', nombre: 'Invitado', email: null, passwordHash: null }
      mockUsersService.createCliente.mockResolvedValue(guest)

      await service.loginAsGuest()

      expect(mockUsersService.createCliente).toHaveBeenCalledWith({ nombre: 'Invitado' })
    })

    it('incluye el nombre en el payload del JWT', async () => {
      const guest = { id: 'guest-3', nombre: 'Visitante', email: null }
      mockUsersService.createCliente.mockResolvedValue(guest)

      await service.loginAsGuest('Visitante')

      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ nombre: 'Visitante', tipo: 'cliente' }),
      )
    })
  })

  // ── refresh ───────────────────────────────────────────────────────────

  describe('refresh', () => {
    it('devuelve tokens nuevos con un refresh token válido', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue(VALID_REFRESH)
      mockPrisma.refreshToken.update.mockResolvedValue({})
      mockUsersService.findClienteById.mockResolvedValue(CLIENTE)

      const result = await service.refresh('raw_token_value')

      expect(mockPrisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { revokedAt: expect.any(Date) } }),
      )
      expect(result).toHaveProperty('accessToken')
      expect(result).toHaveProperty('refreshToken')
    })

    it('lanza 401 si el token no existe en la DB', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue(null)

      await expect(service.refresh('token_invalido'))
        .rejects.toThrow(UnauthorizedException)
    })

    it('lanza 401 si el token fue revocado', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        ...VALID_REFRESH,
        revokedAt: new Date(),
      })

      await expect(service.refresh('token_revocado'))
        .rejects.toThrow(UnauthorizedException)
    })

    it('lanza 401 si el usuario ya no existe en la DB', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue(VALID_REFRESH)
      mockPrisma.refreshToken.update.mockResolvedValue({})
      mockUsersService.findClienteById.mockResolvedValue(null)

      await expect(service.refresh('raw_token_value'))
        .rejects.toThrow(UnauthorizedException)
    })

    it('lanza 401 si el token expiró', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        ...VALID_REFRESH,
        expiresAt: new Date(Date.now() - 1000),
      })

      await expect(service.refresh('token_expirado'))
        .rejects.toThrow(UnauthorizedException)
    })
  })

  // ── logout ────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('revoca el refresh token en la DB', async () => {
      await service.logout('raw_refresh_token')

      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ revokedAt: null }),
          data: { revokedAt: expect.any(Date) },
        }),
      )
    })
  })
})
