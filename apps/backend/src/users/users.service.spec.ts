import { Test } from '@nestjs/testing'
import { UsersService } from './users.service'
import { PrismaService } from '../prisma/prisma.service'

const mockPrisma = {
  admin: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  mozo: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  cliente: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
}

describe('UsersService', () => {
  let service: UsersService

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile()

    service = module.get(UsersService)
    jest.clearAllMocks()
  })

  // ── Admin ─────────────────────────────────────────────────────────────

  describe('findAdminByEmail', () => {
    it('devuelve el admin si existe', async () => {
      const admin = { id: '1', email: 'admin@test.com', rol: 'ADMIN' }
      mockPrisma.admin.findUnique.mockResolvedValue(admin)

      const result = await service.findAdminByEmail('admin@test.com')

      expect(mockPrisma.admin.findUnique).toHaveBeenCalledWith({ where: { email: 'admin@test.com' } })
      expect(result).toEqual(admin)
    })

    it('devuelve null si no existe', async () => {
      mockPrisma.admin.findUnique.mockResolvedValue(null)
      const result = await service.findAdminByEmail('noexiste@test.com')
      expect(result).toBeNull()
    })
  })

  describe('findAdminById', () => {
    it('devuelve el admin si existe', async () => {
      const admin = { id: 'abc', email: 'admin@test.com' }
      mockPrisma.admin.findUnique.mockResolvedValue(admin)

      const result = await service.findAdminById('abc')

      expect(mockPrisma.admin.findUnique).toHaveBeenCalledWith({ where: { id: 'abc' } })
      expect(result).toEqual(admin)
    })

    it('devuelve null si no existe', async () => {
      mockPrisma.admin.findUnique.mockResolvedValue(null)
      expect(await service.findAdminById('nope')).toBeNull()
    })
  })

  describe('createAdmin', () => {
    it('crea y devuelve el admin', async () => {
      const data = { email: 'nuevo@test.com', passwordHash: 'hash', rol: 'GERENTE' as const, marcaId: 'rest-1' }
      const created = { id: 'new-id', ...data }
      mockPrisma.admin.create.mockResolvedValue(created)

      const result = await service.createAdmin(data)

      expect(mockPrisma.admin.create).toHaveBeenCalledWith({ data })
      expect(result).toEqual(created)
    })

    it('crea admin ROOT sin restauranteId', async () => {
      const data = { email: 'root@menyu.com', passwordHash: 'hash', rol: 'ROOT' as const }
      const created = { id: 'root-id', ...data, marcaId: null }
      mockPrisma.admin.create.mockResolvedValue(created)

      const result = await service.createAdmin(data)

      expect(mockPrisma.admin.create).toHaveBeenCalledWith({ data })
      expect(result.marcaId).toBeNull()
    })
  })

  // ── Mozo ──────────────────────────────────────────────────────────────

  describe('findMozoByEmail', () => {
    it('devuelve el mozo si existe', async () => {
      const mozo = { id: '2', email: 'mozo@test.com', nombre: 'Juan' }
      mockPrisma.mozo.findFirst.mockResolvedValue(mozo)

      const result = await service.findMozoByEmail('mozo@test.com')

      expect(mockPrisma.mozo.findFirst).toHaveBeenCalledWith({ where: { email: 'mozo@test.com' } })
      expect(result).toEqual(mozo)
    })

    it('devuelve null si no existe', async () => {
      mockPrisma.mozo.findFirst.mockResolvedValue(null)
      expect(await service.findMozoByEmail('x@test.com')).toBeNull()
    })
  })

  describe('findMozoById', () => {
    it('devuelve el mozo si existe', async () => {
      const mozo = { id: 'mozo-1', nombre: 'Ana' }
      mockPrisma.mozo.findUnique.mockResolvedValue(mozo)

      const result = await service.findMozoById('mozo-1')

      expect(mockPrisma.mozo.findUnique).toHaveBeenCalledWith({ where: { id: 'mozo-1' } })
      expect(result).toEqual(mozo)
    })
  })

  describe('createMozo', () => {
    it('crea y devuelve el mozo', async () => {
      const data = { nombre: 'Pedro', email: 'pedro@test.com', passwordHash: 'hash', restauranteId: 'rest-1' }
      const created = { id: 'mozo-new', ...data }
      mockPrisma.mozo.create.mockResolvedValue(created)

      const result = await service.createMozo(data)

      expect(mockPrisma.mozo.create).toHaveBeenCalledWith({ data })
      expect(result).toEqual(created)
    })
  })

  // ── Cliente ───────────────────────────────────────────────────────────

  describe('findClienteByEmail', () => {
    it('devuelve el cliente si existe', async () => {
      const cliente = { id: '3', email: 'coty@test.com' }
      mockPrisma.cliente.findUnique.mockResolvedValue(cliente)

      const result = await service.findClienteByEmail('coty@test.com')

      expect(mockPrisma.cliente.findUnique).toHaveBeenCalledWith({ where: { email: 'coty@test.com' } })
      expect(result).toEqual(cliente)
    })

    it('devuelve null si no existe', async () => {
      mockPrisma.cliente.findUnique.mockResolvedValue(null)
      expect(await service.findClienteByEmail('x@test.com')).toBeNull()
    })
  })

  describe('findClienteById', () => {
    it('devuelve el cliente si existe', async () => {
      const cliente = { id: 'cli-1', nombre: 'Coty' }
      mockPrisma.cliente.findUnique.mockResolvedValue(cliente)

      const result = await service.findClienteById('cli-1')

      expect(mockPrisma.cliente.findUnique).toHaveBeenCalledWith({ where: { id: 'cli-1' } })
      expect(result).toEqual(cliente)
    })
  })

  describe('createCliente', () => {
    it('crea cliente registrado con email y password', async () => {
      const data = { nombre: 'Coty', email: 'coty@test.com', passwordHash: 'hash' }
      const created = { id: 'cli-new', ...data }
      mockPrisma.cliente.create.mockResolvedValue(created)

      const result = await service.createCliente(data)

      expect(mockPrisma.cliente.create).toHaveBeenCalledWith({ data })
      expect(result).toEqual(created)
    })

    it('crea cliente invitado sin email ni password', async () => {
      const data = { nombre: 'Invitado' }
      const created = { id: 'guest-1', nombre: 'Invitado', email: null, passwordHash: null }
      mockPrisma.cliente.create.mockResolvedValue(created)

      const result = await service.createCliente(data)

      expect(mockPrisma.cliente.create).toHaveBeenCalledWith({ data })
      expect(result.passwordHash).toBeNull()
    })
  })
})
