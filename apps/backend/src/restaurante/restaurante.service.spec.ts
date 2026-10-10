import { Test } from '@nestjs/testing'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { RestauranteService, RESTAURANTE_DETAIL_INCLUDE } from './restaurante.service'
import { PrismaService } from '../prisma/prisma.service'
import { JwtPayload } from '../auth/auth.service'

const OWNER: JwtPayload = { sub: 'admin-1', email: 'owner@test.com', tipo: 'admin', rol: 'OWNER' }
const GERENTE: JwtPayload = { sub: 'gerente-1', email: 'gerente@test.com', tipo: 'admin', rol: 'GERENTE' }

const RESTAURANTE = { id: 'rest-1', marcaId: 'marca-1', nombre: 'Sucursal Norte', activo: true }

const mockPrisma = {
  restaurante: {
    findUnique: jest.fn(),
  },
  admin: {
    findUnique: jest.fn(),
  },
  adminRestaurante: {
    findUnique: jest.fn(),
  },
}

describe('RestauranteService', () => {
  let service: RestauranteService

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        RestauranteService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile()

    service = module.get(RestauranteService)
    jest.clearAllMocks()
  })

  // ── findOne ───────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('OWNER de la marca recibe el restaurante pidiendo el include de detalle', async () => {
      mockPrisma.admin.findUnique.mockResolvedValue({ id: 'admin-1', marcaId: 'marca-1' })
      mockPrisma.restaurante.findUnique.mockResolvedValue(RESTAURANTE)

      const result = await service.findOne('rest-1', OWNER)

      expect(mockPrisma.restaurante.findUnique).toHaveBeenCalledWith({
        where: { id: 'rest-1' },
        include: RESTAURANTE_DETAIL_INCLUDE,
      })
      expect(result).toEqual(RESTAURANTE)
    })

    it('OWNER lanza 403 si el restaurante es de otra marca', async () => {
      mockPrisma.admin.findUnique.mockResolvedValue({ id: 'admin-1', marcaId: 'marca-otra' })
      mockPrisma.restaurante.findUnique.mockResolvedValue(RESTAURANTE)

      await expect(service.findOne('rest-1', OWNER))
        .rejects.toThrow(ForbiddenException)

      expect(mockPrisma.restaurante.findUnique).not.toHaveBeenCalledWith(
        expect.objectContaining({ include: expect.anything() }),
      )
    })

    it('GERENTE asignado recibe el restaurante pidiendo el include de detalle', async () => {
      mockPrisma.adminRestaurante.findUnique.mockResolvedValue({ id: 'asignacion-1' })
      mockPrisma.restaurante.findUnique.mockResolvedValue(RESTAURANTE)

      const result = await service.findOne('rest-1', GERENTE)

      expect(mockPrisma.adminRestaurante.findUnique).toHaveBeenCalledWith({
        where: { adminId_restauranteId: { adminId: 'gerente-1', restauranteId: 'rest-1' } },
      })
      expect(mockPrisma.restaurante.findUnique).toHaveBeenCalledWith({
        where: { id: 'rest-1' },
        include: RESTAURANTE_DETAIL_INCLUDE,
      })
      expect(result).toEqual(RESTAURANTE)
    })

    it('GERENTE lanza 403 si no está asignado al restaurante', async () => {
      mockPrisma.adminRestaurante.findUnique.mockResolvedValue(null)

      await expect(service.findOne('rest-1', GERENTE))
        .rejects.toThrow(ForbiddenException)

      expect(mockPrisma.restaurante.findUnique).not.toHaveBeenCalled()
    })

    it('lanza 404 si el restaurante está inactivo', async () => {
      mockPrisma.adminRestaurante.findUnique.mockResolvedValue({ id: 'asignacion-1' })
      mockPrisma.restaurante.findUnique.mockResolvedValue({ ...RESTAURANTE, activo: false })

      await expect(service.findOne('rest-1', GERENTE))
        .rejects.toThrow(NotFoundException)
    })
  })
})
