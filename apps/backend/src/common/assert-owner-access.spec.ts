import { ForbiddenException } from '@nestjs/common'
import {
  assertOwnerDeMarca,
  assertOwnerDeRestaurante,
  assertOwnerOGerenteDeRestaurante,
} from './assert-owner-access'
import { PrismaService } from '../prisma/prisma.service'
import { JwtPayload } from '../auth/auth.service'

const OWNER: JwtPayload = { sub: 'admin-1', email: 'owner@test.com', tipo: 'admin', rol: 'OWNER' }
const GERENTE: JwtPayload = { sub: 'gerente-1', email: 'gerente@test.com', tipo: 'admin', rol: 'GERENTE' }
const ROOT: JwtPayload = { sub: 'root-1', email: 'root@menyu.com', tipo: 'admin', rol: 'ROOT' }
const MOZO: JwtPayload = { sub: 'mozo-1', tipo: 'mozo', restauranteId: 'rest-1' }

const RESTAURANTE = { id: 'rest-1', marcaId: 'marca-1', activo: true, logoUrl: null }

const mockPrisma = {
  admin: { findUnique: jest.fn() },
  restaurante: { findUnique: jest.fn() },
  adminRestaurante: { findUnique: jest.fn() },
}
const prisma = mockPrisma as unknown as PrismaService

describe('assertOwnerDeMarca', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('deja pasar al OWNER de esa marca', async () => {
    mockPrisma.admin.findUnique.mockResolvedValue({ marcaId: 'marca-1' })

    await expect(assertOwnerDeMarca(prisma, 'marca-1', OWNER)).resolves.toBeUndefined()
  })

  it('lanza 403 si el OWNER es de otra marca', async () => {
    mockPrisma.admin.findUnique.mockResolvedValue({ marcaId: 'marca-otra' })

    await expect(assertOwnerDeMarca(prisma, 'marca-1', OWNER)).rejects.toThrow(ForbiddenException)
  })

  it('lanza 403 si el OWNER no tiene marca asignada', async () => {
    mockPrisma.admin.findUnique.mockResolvedValue({ marcaId: null })

    await expect(assertOwnerDeMarca(prisma, 'marca-1', OWNER)).rejects.toThrow(ForbiddenException)
  })

  it('lanza 403 si el admin ya no existe', async () => {
    mockPrisma.admin.findUnique.mockResolvedValue(null)

    await expect(assertOwnerDeMarca(prisma, 'marca-1', OWNER)).rejects.toThrow(ForbiddenException)
  })

  it.each([
    ['ROOT', ROOT],
    ['GERENTE', GERENTE],
    ['un mozo', MOZO],
  ])('lanza 403 a %s sin consultar la base (no hay bypass)', async (_nombre, user) => {
    await expect(assertOwnerDeMarca(prisma, 'marca-1', user)).rejects.toThrow(ForbiddenException)

    expect(mockPrisma.admin.findUnique).not.toHaveBeenCalled()
  })
})

describe('assertOwnerDeRestaurante', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('deja pasar al OWNER de la marca del restaurante y lo devuelve', async () => {
    mockPrisma.admin.findUnique.mockResolvedValue({ marcaId: 'marca-1' })
    mockPrisma.restaurante.findUnique.mockResolvedValue(RESTAURANTE)

    const result = await assertOwnerDeRestaurante(prisma, 'rest-1', OWNER)

    expect(result).toEqual(RESTAURANTE)
  })

  it('lanza 403 si el restaurante es de otra marca', async () => {
    mockPrisma.admin.findUnique.mockResolvedValue({ marcaId: 'marca-otra' })
    mockPrisma.restaurante.findUnique.mockResolvedValue(RESTAURANTE)

    await expect(assertOwnerDeRestaurante(prisma, 'rest-1', OWNER)).rejects.toThrow(ForbiddenException)
  })

  it('lanza 403 si el restaurante no existe', async () => {
    mockPrisma.admin.findUnique.mockResolvedValue({ marcaId: 'marca-1' })
    mockPrisma.restaurante.findUnique.mockResolvedValue(null)

    await expect(assertOwnerDeRestaurante(prisma, 'rest-1', OWNER)).rejects.toThrow(ForbiddenException)
  })

  it.each([
    ['ROOT', ROOT],
    ['GERENTE', GERENTE],
    ['un mozo', MOZO],
  ])('lanza 403 a %s sin consultar la base (no hay bypass)', async (_nombre, user) => {
    await expect(assertOwnerDeRestaurante(prisma, 'rest-1', user)).rejects.toThrow(ForbiddenException)

    expect(mockPrisma.admin.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.restaurante.findUnique).not.toHaveBeenCalled()
  })
})

describe('assertOwnerOGerenteDeRestaurante', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('OWNER', () => {
    it('deja pasar al OWNER de la marca del restaurante', async () => {
      mockPrisma.admin.findUnique.mockResolvedValue({ marcaId: 'marca-1' })
      mockPrisma.restaurante.findUnique.mockResolvedValue({ marcaId: 'marca-1' })

      await expect(assertOwnerOGerenteDeRestaurante(prisma, 'rest-1', OWNER)).resolves.toBeUndefined()
    })

    it('lanza 403 si el restaurante es de otra marca', async () => {
      mockPrisma.admin.findUnique.mockResolvedValue({ marcaId: 'marca-otra' })
      mockPrisma.restaurante.findUnique.mockResolvedValue({ marcaId: 'marca-1' })

      await expect(assertOwnerOGerenteDeRestaurante(prisma, 'rest-1', OWNER)).rejects.toThrow(
        ForbiddenException,
      )
    })

    it('lanza 403 si el restaurante no existe o el OWNER no tiene marca', async () => {
      mockPrisma.admin.findUnique.mockResolvedValue({ marcaId: 'marca-1' })
      mockPrisma.restaurante.findUnique.mockResolvedValue(null)
      await expect(assertOwnerOGerenteDeRestaurante(prisma, 'rest-1', OWNER)).rejects.toThrow(
        ForbiddenException,
      )

      mockPrisma.admin.findUnique.mockResolvedValue({ marcaId: null })
      mockPrisma.restaurante.findUnique.mockResolvedValue({ marcaId: 'marca-1' })
      await expect(assertOwnerOGerenteDeRestaurante(prisma, 'rest-1', OWNER)).rejects.toThrow(
        ForbiddenException,
      )
    })
  })

  describe('GERENTE', () => {
    it('deja pasar al GERENTE asignado a ese restaurante', async () => {
      mockPrisma.adminRestaurante.findUnique.mockResolvedValue({ adminId: 'gerente-1' })

      await expect(assertOwnerOGerenteDeRestaurante(prisma, 'rest-1', GERENTE)).resolves.toBeUndefined()
      expect(mockPrisma.adminRestaurante.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { adminId_restauranteId: { adminId: 'gerente-1', restauranteId: 'rest-1' } },
        }),
      )
    })

    it('lanza 403 si no está asignado a ese restaurante', async () => {
      mockPrisma.adminRestaurante.findUnique.mockResolvedValue(null)

      await expect(assertOwnerOGerenteDeRestaurante(prisma, 'rest-2', GERENTE)).rejects.toThrow(
        ForbiddenException,
      )
    })

    it('no consulta marcas ni restaurantes', async () => {
      mockPrisma.adminRestaurante.findUnique.mockResolvedValue({ adminId: 'gerente-1' })

      await assertOwnerOGerenteDeRestaurante(prisma, 'rest-1', GERENTE)

      expect(mockPrisma.admin.findUnique).not.toHaveBeenCalled()
      expect(mockPrisma.restaurante.findUnique).not.toHaveBeenCalled()
    })
  })

  it.each([
    ['ROOT', ROOT],
    ['un mozo', MOZO],
  ])('lanza 403 a %s sin consultar la base (no hay bypass)', async (_nombre, user) => {
    await expect(assertOwnerOGerenteDeRestaurante(prisma, 'rest-1', user)).rejects.toThrow(ForbiddenException)

    expect(mockPrisma.admin.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.restaurante.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.adminRestaurante.findUnique).not.toHaveBeenCalled()
  })
})
