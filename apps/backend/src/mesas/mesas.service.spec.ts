import { Test } from '@nestjs/testing'
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { MesasService } from './mesas.service'
import { PrismaService } from '../prisma/prisma.service'
import { JwtPayload } from '../auth/auth.service'

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mock_qr_image'),
}))

jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomUUID: jest.fn().mockReturnValue('nuevo-uuid-generado'),
}))

const ROOT: JwtPayload = { sub: 'root-1', tipo: 'admin', rol: 'ROOT' }
const OWNER: JwtPayload = { sub: 'admin-1', tipo: 'admin', rol: 'OWNER' }

const RESTAURANTE = { id: 'rest-1', activo: true }
const ADMIN = { id: 'admin-1', restauranteId: 'rest-1' }
const MESA = { id: 'mesa-1', numero: '1', qrToken: 'token-abc', estado: 'libre', restauranteId: 'rest-1', activo: true }

const mockPrisma = {
  mesa: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  restaurante: { findUnique: jest.fn() },
  admin: { findUnique: jest.fn() },
}

describe('MesasService', () => {
  let service: MesasService

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MesasService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile()

    service = module.get(MesasService)
    jest.clearAllMocks()
  })

  // ── create ─────────────────────────────────────────────────────────────

  describe('create', () => {
    it('crea la mesa con qrToken generado y devuelve imagen QR', async () => {
      mockPrisma.restaurante.findUnique.mockResolvedValue(RESTAURANTE)
      mockPrisma.mesa.findFirst.mockResolvedValue(null)
      mockPrisma.mesa.create.mockResolvedValue({ ...MESA, qrToken: 'nuevo-uuid-generado' })

      const result = await service.create({ numero: '1', restauranteId: 'rest-1' })

      expect(mockPrisma.mesa.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ qrToken: 'nuevo-uuid-generado' }) }),
      )
      expect(result).toHaveProperty('qrImage', 'data:image/png;base64,mock_qr_image')
    })

    it('lanza 409 si el número de mesa ya existe en ese restaurante', async () => {
      mockPrisma.restaurante.findUnique.mockResolvedValue(RESTAURANTE)
      mockPrisma.mesa.findFirst.mockResolvedValue(MESA)

      await expect(service.create({ numero: '1', restauranteId: 'rest-1' }))
        .rejects.toThrow(ConflictException)

      expect(mockPrisma.mesa.create).not.toHaveBeenCalled()
    })

    it('lanza 404 si el restaurante no existe', async () => {
      mockPrisma.restaurante.findUnique.mockResolvedValue(null)

      await expect(service.create({ numero: '1', restauranteId: 'no-existe' }))
        .rejects.toThrow(NotFoundException)
    })
  })

  // ── findAll ────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('ROOT puede listar mesas de cualquier restaurante', async () => {
      mockPrisma.mesa.findMany.mockResolvedValue([MESA])

      const result = await service.findAll('rest-1', ROOT)

      expect(mockPrisma.mesa.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { restauranteId: 'rest-1', activo: true } }),
      )
      expect(result[0]).toHaveProperty('qrImage')
    })

    it('OWNER solo puede listar mesas de su restaurante', async () => {
      mockPrisma.admin.findUnique.mockResolvedValue(ADMIN)
      mockPrisma.mesa.findMany.mockResolvedValue([MESA])

      const result = await service.findAll('rest-1', OWNER)

      expect(result).toHaveLength(1)
    })

    it('OWNER lanza 403 si intenta listar mesas de otro restaurante', async () => {
      mockPrisma.admin.findUnique.mockResolvedValue(ADMIN)

      await expect(service.findAll('rest-otro', OWNER))
        .rejects.toThrow(ForbiddenException)
    })
  })

  // ── findOne ────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('devuelve la mesa con imagen QR', async () => {
      mockPrisma.mesa.findUnique.mockResolvedValue(MESA)
      mockPrisma.admin.findUnique.mockResolvedValue(ADMIN)

      const result = await service.findOne('mesa-1', OWNER)

      expect(result).toMatchObject({ id: 'mesa-1', numero: '1' })
      expect(result).toHaveProperty('qrImage')
    })

    it('lanza 404 si la mesa no existe', async () => {
      mockPrisma.mesa.findUnique.mockResolvedValue(null)

      await expect(service.findOne('no-existe', ROOT))
        .rejects.toThrow(NotFoundException)
    })

    it('lanza 404 si la mesa está inactiva', async () => {
      mockPrisma.mesa.findUnique.mockResolvedValue({ ...MESA, activo: false })

      await expect(service.findOne('mesa-1', ROOT))
        .rejects.toThrow(NotFoundException)
    })
  })

  // ── update ─────────────────────────────────────────────────────────────

  describe('update', () => {
    it('actualiza el número y devuelve imagen QR actualizada', async () => {
      mockPrisma.mesa.findUnique.mockResolvedValue(MESA)
      mockPrisma.admin.findUnique.mockResolvedValue(ADMIN)
      mockPrisma.mesa.findFirst.mockResolvedValue(null)
      mockPrisma.mesa.update.mockResolvedValue({ ...MESA, numero: '2' })

      const result = await service.update('mesa-1', { numero: '2' }, OWNER)

      expect(mockPrisma.mesa.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { numero: '2' } }),
      )
      expect(result).toHaveProperty('qrImage')
    })

    it('lanza 409 si el nuevo número ya lo usa otra mesa del mismo restaurante', async () => {
      mockPrisma.mesa.findUnique.mockResolvedValue(MESA)
      mockPrisma.admin.findUnique.mockResolvedValue(ADMIN)
      mockPrisma.mesa.findFirst.mockResolvedValue({ ...MESA, id: 'mesa-otra' })

      await expect(service.update('mesa-1', { numero: '2' }, OWNER))
        .rejects.toThrow(ConflictException)
    })

    it('actualiza el estado', async () => {
      mockPrisma.mesa.findUnique.mockResolvedValue(MESA)
      mockPrisma.admin.findUnique.mockResolvedValue(ADMIN)
      mockPrisma.mesa.update.mockResolvedValue({ ...MESA, estado: 'ocupada' })

      const result = await service.update('mesa-1', { estado: 'ocupada' }, ROOT)

      expect(result.estado).toBe('ocupada')
    })
  })

  // ── remove ─────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('hace soft delete (activo: false)', async () => {
      mockPrisma.mesa.findUnique.mockResolvedValue(MESA)
      mockPrisma.admin.findUnique.mockResolvedValue(ADMIN)
      mockPrisma.mesa.update.mockResolvedValue({ ...MESA, activo: false })

      await service.remove('mesa-1', OWNER)

      expect(mockPrisma.mesa.update).toHaveBeenCalledWith({
        where: { id: 'mesa-1' },
        data: { activo: false },
      })
    })

    it('lanza 404 si la mesa no existe', async () => {
      mockPrisma.mesa.findUnique.mockResolvedValue(null)

      await expect(service.remove('no-existe', ROOT))
        .rejects.toThrow(NotFoundException)
    })
  })

  // ── regenerarQr ────────────────────────────────────────────────────────

  describe('regenerarQr', () => {
    it('genera un nuevo token UUID y devuelve nueva imagen QR', async () => {
      mockPrisma.mesa.findUnique.mockResolvedValue(MESA)
      mockPrisma.admin.findUnique.mockResolvedValue(ADMIN)
      mockPrisma.mesa.update.mockResolvedValue({ ...MESA, qrToken: 'nuevo-uuid-generado' })

      const result = await service.regenerarQr('mesa-1', OWNER)

      expect(mockPrisma.mesa.update).toHaveBeenCalledWith({
        where: { id: 'mesa-1' },
        data: { qrToken: 'nuevo-uuid-generado' },
      })
      expect(result).toHaveProperty('qrImage', 'data:image/png;base64,mock_qr_image')
      expect(result.qrToken).toBe('nuevo-uuid-generado')
    })

    it('lanza 403 si OWNER intenta regenerar QR de mesa de otro restaurante', async () => {
      mockPrisma.mesa.findUnique.mockResolvedValue({ ...MESA, restauranteId: 'rest-otro' })
      mockPrisma.admin.findUnique.mockResolvedValue(ADMIN)

      await expect(service.regenerarQr('mesa-1', OWNER))
        .rejects.toThrow(ForbiddenException)
    })
  })
})
