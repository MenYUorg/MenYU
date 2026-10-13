import { Test } from '@nestjs/testing'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { RestauranteService, RESTAURANTE_DETAIL_INCLUDE } from './restaurante.service'
import { PrismaService } from '../prisma/prisma.service'
import { LogosService } from '../storage/logos.service'
import { JwtPayload } from '../auth/auth.service'

const OWNER: JwtPayload = { sub: 'admin-1', email: 'owner@test.com', tipo: 'admin', rol: 'OWNER' }
const GERENTE: JwtPayload = { sub: 'gerente-1', email: 'gerente@test.com', tipo: 'admin', rol: 'GERENTE' }
const ROOT: JwtPayload = { sub: 'root-1', email: 'root@menyu.com', tipo: 'admin', rol: 'ROOT' }

const RESTAURANTE = { id: 'rest-1', marcaId: 'marca-1', nombre: 'Sucursal Norte', activo: true, logoUrl: null }
const LOGO_URL = 'https://proyecto.supabase.co/storage/v1/object/public/logos/restaurantes/rest-1?v=1700000000000'
const ARCHIVO = { buffer: Buffer.from('logo'), mimetype: 'image/png' } as Express.Multer.File

const mockPrisma = {
  restaurante: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  admin: {
    findUnique: jest.fn(),
  },
  adminRestaurante: {
    findUnique: jest.fn(),
  },
}

const mockLogos = {
  subir: jest.fn(),
  eliminar: jest.fn(),
}

describe('RestauranteService', () => {
  let service: RestauranteService

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        RestauranteService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: LogosService, useValue: mockLogos },
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

  // ── update ────────────────────────────────────────────────────────────

  describe('update — dirección (solo el OWNER de la marca)', () => {
    it('el OWNER de la marca guarda la dirección', async () => {
      mockPrisma.admin.findUnique.mockResolvedValue({ id: 'admin-1', marcaId: 'marca-1' })
      mockPrisma.restaurante.findUnique.mockResolvedValue(RESTAURANTE)
      mockPrisma.restaurante.update.mockResolvedValue({ ...RESTAURANTE, direccion: 'Colón 123' })

      await service.update('rest-1', { direccion: 'Colón 123' }, OWNER)

      expect(mockPrisma.restaurante.update).toHaveBeenCalledWith({
        where: { id: 'rest-1' },
        data: { direccion: 'Colón 123' },
      })
    })

    it('un OWNER de otra marca recibe 403', async () => {
      mockPrisma.admin.findUnique.mockResolvedValue({ id: 'admin-2', marcaId: 'marca-otra' })
      mockPrisma.restaurante.findUnique.mockResolvedValue(RESTAURANTE)

      await expect(service.update('rest-1', { direccion: 'Colón 123' }, OWNER))
        .rejects.toThrow(ForbiddenException)

      expect(mockPrisma.restaurante.update).not.toHaveBeenCalled()
    })

    it('un GERENTE asignado recibe 403 si intenta cambiar la dirección', async () => {
      mockPrisma.adminRestaurante.findUnique.mockResolvedValue({ id: 'asignacion-1' })
      mockPrisma.restaurante.findUnique.mockResolvedValue(RESTAURANTE)

      await expect(service.update('rest-1', { direccion: 'Colón 123' }, GERENTE))
        .rejects.toThrow(ForbiddenException)

      expect(mockPrisma.restaurante.update).not.toHaveBeenCalled()
    })

    it('ROOT recibe 403 si intenta cambiar la dirección', async () => {
      await expect(service.update('rest-1', { direccion: 'Colón 123' }, ROOT))
        .rejects.toThrow(ForbiddenException)

      expect(mockPrisma.restaurante.update).not.toHaveBeenCalled()
    })

    it('un GERENTE asignado sigue pudiendo cambiar el modo de sesión', async () => {
      mockPrisma.adminRestaurante.findUnique.mockResolvedValue({ id: 'asignacion-1' })
      mockPrisma.restaurante.findUnique.mockResolvedValue(RESTAURANTE)
      mockPrisma.restaurante.update.mockResolvedValue({ ...RESTAURANTE, modoSesion: 'seguro' })

      await service.update('rest-1', { modoSesion: 'seguro' }, GERENTE)

      expect(mockPrisma.restaurante.update).toHaveBeenCalledWith({
        where: { id: 'rest-1' },
        data: { modoSesion: 'seguro' },
      })
    })
  })

  // ── uploadLogo ────────────────────────────────────────────────────────

  describe('uploadLogo', () => {
    it('el OWNER de la marca sube el logo y se guarda la URL', async () => {
      mockPrisma.admin.findUnique.mockResolvedValue({ id: 'admin-1', marcaId: 'marca-1' })
      mockPrisma.restaurante.findUnique.mockResolvedValue(RESTAURANTE)
      mockLogos.subir.mockResolvedValue(LOGO_URL)
      mockPrisma.restaurante.update.mockResolvedValue({ id: 'rest-1', logoUrl: LOGO_URL })

      const result = await service.uploadLogo('rest-1', ARCHIVO, OWNER)

      expect(mockLogos.subir).toHaveBeenCalledWith('restaurantes', 'rest-1', ARCHIVO)
      expect(mockPrisma.restaurante.update).toHaveBeenCalledWith({
        where: { id: 'rest-1' },
        data: { logoUrl: LOGO_URL },
        select: { id: true, logoUrl: true },
      })
      expect(result).toEqual({ id: 'rest-1', logoUrl: LOGO_URL })
    })

    it('un OWNER de otra marca recibe 403 y no se sube nada', async () => {
      mockPrisma.admin.findUnique.mockResolvedValue({ id: 'admin-2', marcaId: 'marca-otra' })
      mockPrisma.restaurante.findUnique.mockResolvedValue(RESTAURANTE)

      await expect(service.uploadLogo('rest-1', ARCHIVO, OWNER))
        .rejects.toThrow(ForbiddenException)

      expect(mockLogos.subir).not.toHaveBeenCalled()
    })

    it.each([
      ['ROOT', ROOT],
      ['GERENTE', GERENTE],
    ])('%s recibe 403 y no se sube nada', async (_nombre, user) => {
      await expect(service.uploadLogo('rest-1', ARCHIVO, user))
        .rejects.toThrow(ForbiddenException)

      expect(mockLogos.subir).not.toHaveBeenCalled()
      expect(mockPrisma.restaurante.update).not.toHaveBeenCalled()
    })

    it('lanza 404 si el restaurante está inactivo', async () => {
      mockPrisma.admin.findUnique.mockResolvedValue({ id: 'admin-1', marcaId: 'marca-1' })
      mockPrisma.restaurante.findUnique.mockResolvedValue({ ...RESTAURANTE, activo: false })

      await expect(service.uploadLogo('rest-1', ARCHIVO, OWNER))
        .rejects.toThrow(NotFoundException)

      expect(mockLogos.subir).not.toHaveBeenCalled()
    })
  })

  // ── removeLogo ────────────────────────────────────────────────────────

  describe('removeLogo', () => {
    it('el OWNER borra el archivo y deja el logo en null', async () => {
      mockPrisma.admin.findUnique.mockResolvedValue({ id: 'admin-1', marcaId: 'marca-1' })
      mockPrisma.restaurante.findUnique.mockResolvedValue({ ...RESTAURANTE, logoUrl: LOGO_URL })
      mockPrisma.restaurante.update.mockResolvedValue({ id: 'rest-1', logoUrl: null })

      const result = await service.removeLogo('rest-1', OWNER)

      expect(mockLogos.eliminar).toHaveBeenCalledWith('restaurantes', 'rest-1')
      expect(mockPrisma.restaurante.update).toHaveBeenCalledWith({
        where: { id: 'rest-1' },
        data: { logoUrl: null },
        select: { id: true, logoUrl: true },
      })
      expect(result).toEqual({ id: 'rest-1', logoUrl: null })
    })

    it('lanza 404 si el restaurante no tiene logo propio', async () => {
      mockPrisma.admin.findUnique.mockResolvedValue({ id: 'admin-1', marcaId: 'marca-1' })
      mockPrisma.restaurante.findUnique.mockResolvedValue({ ...RESTAURANTE, logoUrl: null })

      await expect(service.removeLogo('rest-1', OWNER))
        .rejects.toThrow(NotFoundException)

      expect(mockLogos.eliminar).not.toHaveBeenCalled()
    })

    it('un OWNER de otra marca recibe 403 y no se borra nada', async () => {
      mockPrisma.admin.findUnique.mockResolvedValue({ id: 'admin-2', marcaId: 'marca-otra' })
      mockPrisma.restaurante.findUnique.mockResolvedValue({ ...RESTAURANTE, logoUrl: LOGO_URL })

      await expect(service.removeLogo('rest-1', OWNER))
        .rejects.toThrow(ForbiddenException)

      expect(mockLogos.eliminar).not.toHaveBeenCalled()
    })

    it.each([
      ['ROOT', ROOT],
      ['GERENTE', GERENTE],
    ])('%s recibe 403 y no se borra nada', async (_nombre, user) => {
      await expect(service.removeLogo('rest-1', user))
        .rejects.toThrow(ForbiddenException)

      expect(mockLogos.eliminar).not.toHaveBeenCalled()
    })
  })
})
