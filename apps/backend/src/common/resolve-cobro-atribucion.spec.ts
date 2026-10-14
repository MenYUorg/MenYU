import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { JwtPayload } from '../auth/auth.service'
import { resolveCobroAtribucion } from './resolve-cobro-atribucion'

const mockPrisma = {
  mozo: { findUnique: jest.fn() },
}
const prisma = mockPrisma as unknown as PrismaService

const USER_MOZO: JwtPayload = { sub: 'mozo-1', tipo: 'mozo', restauranteId: 'rest-1' }
const USER_ADMIN: JwtPayload = { sub: 'admin-1', tipo: 'admin', rol: 'GERENTE' }

describe('resolveCobroAtribucion', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('mozo sin mozoId → { mozoId: su sub, adminId: null }', async () => {
    await expect(resolveCobroAtribucion(prisma, USER_MOZO, 'rest-1')).resolves.toEqual({
      mozoId: 'mozo-1',
      adminId: null,
    })
  })

  it('mozo que manda un mozoId ajeno → se guarda el propio y no se consulta la base', async () => {
    await expect(
      resolveCobroAtribucion(prisma, USER_MOZO, 'rest-1', 'mozo-ajeno'),
    ).resolves.toEqual({ mozoId: 'mozo-1', adminId: null })
    expect(mockPrisma.mozo.findUnique).not.toHaveBeenCalled()
  })

  it.each([undefined, null, ''])(
    'admin sin mozoId (%p) → { mozoId: null, adminId: su sub }',
    async (mozoIdBody) => {
      await expect(
        resolveCobroAtribucion(prisma, USER_ADMIN, 'rest-1', mozoIdBody),
      ).resolves.toEqual({ mozoId: null, adminId: 'admin-1' })
      expect(mockPrisma.mozo.findUnique).not.toHaveBeenCalled()
    },
  )

  it('admin con mozoId del restaurante → se guardan los dos', async () => {
    mockPrisma.mozo.findUnique.mockResolvedValue({ restauranteId: 'rest-1' })

    await expect(
      resolveCobroAtribucion(prisma, USER_ADMIN, 'rest-1', 'mozo-7'),
    ).resolves.toEqual({ mozoId: 'mozo-7', adminId: 'admin-1' })
    expect(mockPrisma.mozo.findUnique).toHaveBeenCalledWith({
      where: { id: 'mozo-7' },
      select: { restauranteId: true },
    })
  })

  it('admin con mozoId inexistente → BadRequestException', async () => {
    mockPrisma.mozo.findUnique.mockResolvedValue(null)

    await expect(
      resolveCobroAtribucion(prisma, USER_ADMIN, 'rest-1', 'no-existe'),
    ).rejects.toThrow(BadRequestException)
  })

  it('admin con mozoId de otro restaurante → ForbiddenException', async () => {
    mockPrisma.mozo.findUnique.mockResolvedValue({ restauranteId: 'rest-2' })

    await expect(
      resolveCobroAtribucion(prisma, USER_ADMIN, 'rest-1', 'mozo-de-rest-2'),
    ).rejects.toThrow(ForbiddenException)
  })
})
