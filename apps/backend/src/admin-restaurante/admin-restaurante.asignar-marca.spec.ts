import { ForbiddenException } from '@nestjs/common'
import { JwtPayload } from '../auth/auth.service'
import { PrismaService } from '../prisma/prisma.service'
import { AdminRestauranteService } from './admin-restaurante.service'

// Un gerente solo puede tener restaurantes de su propia marca: si no, un OWNER podría darle
// a su gerente acceso a un restaurante de otra marca.

const OWNER: JwtPayload = { sub: 'owner-1', tipo: 'admin', rol: 'OWNER' }
const OWNER_DB = { id: 'owner-1', rol: 'OWNER', marcaId: 'marca-1' }
const GERENTE_DB = { id: 'gerente-1', rol: 'GERENTE', marcaId: 'marca-1' }

describe('AdminRestauranteService.asignar: marca del restaurante', () => {
  const prisma = {
    admin: { findUnique: jest.fn() },
    restaurante: { findUnique: jest.fn() },
    adminRestaurante: { findUnique: jest.fn(), create: jest.fn() },
  }
  const service = new AdminRestauranteService(prisma as unknown as PrismaService)

  beforeEach(() => {
    jest.resetAllMocks()
    prisma.admin.findUnique.mockImplementation(({ where }) =>
      Promise.resolve(where.id === OWNER.sub ? OWNER_DB : GERENTE_DB),
    )
    prisma.adminRestaurante.findUnique.mockResolvedValue(null)
  })

  it('un OWNER no puede asignar a su gerente un restaurante de otra marca (403) y no se crea la asignación', async () => {
    // Arrange
    prisma.restaurante.findUnique.mockResolvedValue({ id: 'rest-ajeno', activo: true, marcaId: 'marca-2' })

    // Act
    const asignacion = service.asignar('gerente-1', 'rest-ajeno', OWNER)

    // Assert
    await expect(asignacion).rejects.toThrow(ForbiddenException)
    expect(prisma.adminRestaurante.create).not.toHaveBeenCalled()
  })

  it('un restaurante de la misma marca se sigue asignando', async () => {
    // Arrange
    prisma.restaurante.findUnique.mockResolvedValue({ id: 'rest-propio', activo: true, marcaId: 'marca-1' })
    prisma.adminRestaurante.create.mockResolvedValue({ adminId: 'gerente-1', restauranteId: 'rest-propio' })

    // Act
    const asignacion = await service.asignar('gerente-1', 'rest-propio', OWNER)

    // Assert
    expect(asignacion).toEqual({ adminId: 'gerente-1', restauranteId: 'rest-propio' })
    expect(prisma.adminRestaurante.create).toHaveBeenCalledWith({ data: { adminId: 'gerente-1', restauranteId: 'rest-propio' } })
  })
})
