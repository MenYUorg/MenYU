import { Test } from '@nestjs/testing'
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { MarcaService } from './marca.service'
import { PrismaService } from '../prisma/prisma.service'
import { JwtPayload } from '../auth/auth.service'

const ROOT: JwtPayload = { sub: 'root-1', email: 'root@menyu.com', tipo: 'admin', rol: 'ROOT' }
const OWNER: JwtPayload = { sub: 'admin-1', email: 'owner@test.com', tipo: 'admin', rol: 'OWNER' }

const MARCA = { id: 'marca-1', nombre: 'La Parrilla', slug: 'la-parrilla', activo: true }
const RESTAURANTE = { id: 'rest-1', marcaId: 'marca-1', nombre: 'Sucursal Norte' }
const ADMIN_WITH_REST = { id: 'admin-1', restaurante: RESTAURANTE }

const mockPrisma = {
  marca: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  admin: {
    findUnique: jest.fn(),
  },
}

describe('MarcaService', () => {
  let service: MarcaService

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MarcaService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile()

    service = module.get(MarcaService)
    jest.clearAllMocks()
  })

  // ── create ────────────────────────────────────────────────────────────

  describe('create', () => {
    it('crea y devuelve la marca', async () => {
      mockPrisma.marca.findUnique.mockResolvedValue(null)
      mockPrisma.marca.create.mockResolvedValue(MARCA)

      const result = await service.create({ nombre: 'La Parrilla', slug: 'la-parrilla' })

      expect(mockPrisma.marca.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { nombre: 'La Parrilla', slug: 'la-parrilla' } }),
      )
      expect(result).toEqual(MARCA)
    })

    it('lanza 409 si el slug ya existe', async () => {
      mockPrisma.marca.findUnique.mockResolvedValue(MARCA)

      await expect(service.create({ nombre: 'Otra', slug: 'la-parrilla' }))
        .rejects.toThrow(ConflictException)

      expect(mockPrisma.marca.create).not.toHaveBeenCalled()
    })
  })

  // ── findAll ───────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('ROOT devuelve todas las marcas activas', async () => {
      const marcas = [MARCA, { ...MARCA, id: 'marca-2', slug: 'otro' }]
      mockPrisma.marca.findMany.mockResolvedValue(marcas)

      const result = await service.findAll(ROOT)

      expect(mockPrisma.marca.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ activo: true }) }),
      )
      expect(result).toHaveLength(2)
    })

    it('OWNER solo ve su propia marca', async () => {
      mockPrisma.admin.findUnique.mockResolvedValue(ADMIN_WITH_REST)
      mockPrisma.marca.findMany.mockResolvedValue([MARCA])

      const result = await service.findAll(OWNER)

      expect(mockPrisma.marca.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'marca-1' }) }),
      )
      expect(result).toHaveLength(1)
    })
  })

  // ── findOne ───────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('devuelve la marca con sus relaciones', async () => {
      mockPrisma.marca.findUnique.mockResolvedValue(MARCA)

      const result = await service.findOne('marca-1', ROOT)

      expect(mockPrisma.marca.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'marca-1' } }),
      )
      expect(result).toEqual(MARCA)
    })

    it('lanza 404 si la marca no existe', async () => {
      mockPrisma.marca.findUnique.mockResolvedValue(null)

      await expect(service.findOne('no-existe', ROOT))
        .rejects.toThrow(NotFoundException)
    })

    it('lanza 404 si la marca está inactiva', async () => {
      mockPrisma.marca.findUnique.mockResolvedValue({ ...MARCA, activo: false })

      await expect(service.findOne('marca-1', ROOT))
        .rejects.toThrow(NotFoundException)
    })

    it('OWNER lanza 403 si intenta acceder a otra marca', async () => {
      mockPrisma.admin.findUnique.mockResolvedValue(ADMIN_WITH_REST)

      await expect(service.findOne('marca-otra', OWNER))
        .rejects.toThrow(ForbiddenException)

      expect(mockPrisma.marca.findUnique).not.toHaveBeenCalled()
    })
  })

  // ── update ────────────────────────────────────────────────────────────

  describe('update', () => {
    it('actualiza y devuelve la marca', async () => {
      const updated = { ...MARCA, nombre: 'Nuevo Nombre' }
      mockPrisma.marca.findUnique.mockResolvedValue(MARCA)
      mockPrisma.marca.findFirst.mockResolvedValue(null)
      mockPrisma.marca.update.mockResolvedValue(updated)

      const result = await service.update('marca-1', { nombre: 'Nuevo Nombre' }, ROOT)

      expect(mockPrisma.marca.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'marca-1' } }),
      )
      expect(result.nombre).toBe('Nuevo Nombre')
    })

    it('lanza 409 si el nuevo slug ya lo usa otra marca', async () => {
      mockPrisma.marca.findUnique.mockResolvedValue(MARCA)
      mockPrisma.marca.findFirst.mockResolvedValue({ ...MARCA, id: 'marca-otra' })

      await expect(service.update('marca-1', { slug: 'slug-en-uso' }, ROOT))
        .rejects.toThrow(ConflictException)

      expect(mockPrisma.marca.update).not.toHaveBeenCalled()
    })

    it('lanza 404 si la marca no existe', async () => {
      mockPrisma.marca.findUnique.mockResolvedValue(null)

      await expect(service.update('no-existe', { nombre: 'X' }, ROOT))
        .rejects.toThrow(NotFoundException)
    })
  })

  // ── remove ────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('hace soft delete (activo: false)', async () => {
      mockPrisma.marca.findUnique.mockResolvedValue(MARCA)
      mockPrisma.marca.update.mockResolvedValue({ ...MARCA, activo: false })

      await service.remove('marca-1')

      expect(mockPrisma.marca.update).toHaveBeenCalledWith({
        where: { id: 'marca-1' },
        data: { activo: false },
      })
    })

    it('lanza 404 si la marca no existe', async () => {
      mockPrisma.marca.findUnique.mockResolvedValue(null)

      await expect(service.remove('no-existe'))
        .rejects.toThrow(NotFoundException)

      expect(mockPrisma.marca.update).not.toHaveBeenCalled()
    })
  })
})
