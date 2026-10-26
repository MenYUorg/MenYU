import { Test } from '@nestjs/testing'
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { MarcaService, MARCA_CON_RESTAURANTES_SELECT, MARCA_DETALLE_SELECT, MARCA_SELECT } from './marca.service'
import { PrismaService } from '../prisma/prisma.service'
import { LogosService } from '../storage/logos.service'
import { AccesoService } from '../auth/supabase/acceso.service'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { accesoDeTest, CUENTAS, MUNDO } from '../test/acceso-de-test'

const MARCA_ID = MUNDO.MARCA_A
const MARCA = { id: MARCA_ID, nombre: 'La Parrilla', slug: 'la-parrilla', activo: true }

const mockPrisma = {
  marca: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  restaurante: {
    findMany: jest.fn(),
  },
}

const mockLogos = {
  subir: jest.fn(),
  eliminar: jest.fn(),
}

const ARCHIVO = { buffer: Buffer.from('logo'), mimetype: 'image/png' } as Express.Multer.File
const LOGO_URL = 'https://proyecto.supabase.co/storage/v1/object/public/logos/marcas/marca-1?v=1700000000000'

/** Quien no es OWNER de la marca A: ROOT no es un bypass. */
const SIN_ACCESO_A_LA_MARCA: Array<[string, UsuarioAutenticado]> = [
  ['ROOT', CUENTAS.ROOT],
  ['el OWNER de otra marca', CUENTAS.OWNER_B],
  ['el GERENTE de una sucursal', CUENTAS.GERENTE],
  ['el MOZO', CUENTAS.MOZO],
]

describe('MarcaService', () => {
  let service: MarcaService

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MarcaService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: LogosService, useValue: mockLogos },
        { provide: AccesoService, useValue: accesoDeTest() },
      ],
    }).compile()

    service = module.get(MarcaService)
    jest.clearAllMocks()
  })

  describe('las respuestas no tienen las columnas de Mercado Pago de las sucursales', () => {
    it.each([
      ['MARCA_CON_RESTAURANTES_SELECT', MARCA_CON_RESTAURANTES_SELECT.restaurantes.select],
      ['MARCA_DETALLE_SELECT', MARCA_DETALLE_SELECT.restaurantes.select],
    ])('%s', (_nombre, select) => {
      expect(Object.keys(select).filter((campo) => campo.startsWith('mp'))).toEqual([])
    })
  })

  // ── findAll ───────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('el OWNER recibe las marcas activas de sus membresías, con sus sucursales', async () => {
      mockPrisma.marca.findMany.mockResolvedValue([MARCA])

      const result = await service.findAll(CUENTAS.OWNER_A)

      expect(mockPrisma.marca.findMany).toHaveBeenCalledWith({
        where: { activo: true, membresias: { some: { usuarioId: CUENTAS.OWNER_A.id, rol: 'OWNER' } } },
        orderBy: { nombre: 'asc' },
        select: MARCA_CON_RESTAURANTES_SELECT,
      })
      expect(result).toEqual([MARCA])
    })

    it.each([
      ['ROOT (no es un bypass)', CUENTAS.ROOT],
      ['el GERENTE', CUENTAS.GERENTE],
      ['un Usuario sin membresías', CUENTAS.SIN_MEMBRESIAS],
    ])('%s recibe 403', async (_caso, cuenta) => {
      await expect(service.findAll(cuenta)).rejects.toThrow(ForbiddenException)

      expect(mockPrisma.marca.findMany).not.toHaveBeenCalled()
    })
  })

  // ── findOne ───────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('el OWNER de la marca la recibe con el select de detalle', async () => {
      mockPrisma.marca.findUnique.mockResolvedValue(MARCA)

      const result = await service.findOne(MARCA_ID, CUENTAS.OWNER_A)

      expect(mockPrisma.marca.findUnique).toHaveBeenCalledWith({ where: { id: MARCA_ID }, select: MARCA_DETALLE_SELECT })
      expect(result).toEqual(MARCA)
    })

    it('lanza 404 si no la encuentra', async () => {
      mockPrisma.marca.findUnique.mockResolvedValue(null)

      await expect(service.findOne(MARCA_ID, CUENTAS.OWNER_A)).rejects.toThrow(NotFoundException)
    })

    it.each(SIN_ACCESO_A_LA_MARCA)('%s recibe 403 sin consultar la marca', async (_caso, cuenta) => {
      await expect(service.findOne(MARCA_ID, cuenta)).rejects.toThrow(ForbiddenException)

      expect(mockPrisma.marca.findUnique).not.toHaveBeenCalled()
    })
  })

  // ── update ────────────────────────────────────────────────────────────

  describe('update', () => {
    it('el OWNER actualiza y recibe la marca sin relaciones', async () => {
      mockPrisma.marca.findFirst.mockResolvedValue(null)
      mockPrisma.marca.update.mockResolvedValue({ ...MARCA, nombre: 'Nuevo Nombre' })

      const result = await service.update(MARCA_ID, { nombre: 'Nuevo Nombre', slug: 'nuevo' }, CUENTAS.OWNER_A)

      expect(mockPrisma.marca.update).toHaveBeenCalledWith({
        where: { id: MARCA_ID },
        data: { nombre: 'Nuevo Nombre', slug: 'nuevo' },
        select: MARCA_SELECT,
      })
      expect(result.nombre).toBe('Nuevo Nombre')
    })

    it('lanza 409 si el nuevo slug ya lo usa otra marca', async () => {
      mockPrisma.marca.findFirst.mockResolvedValue({ ...MARCA, id: 'marca-otra' })

      await expect(service.update(MARCA_ID, { slug: 'slug-en-uso' }, CUENTAS.OWNER_A))
        .rejects.toThrow(ConflictException)

      expect(mockPrisma.marca.findFirst).toHaveBeenCalledWith({ where: { slug: 'slug-en-uso', id: { not: MARCA_ID } } })
      expect(mockPrisma.marca.update).not.toHaveBeenCalled()
    })

    it.each(SIN_ACCESO_A_LA_MARCA)('%s recibe 403 y no se toca nada', async (_caso, cuenta) => {
      await expect(service.update(MARCA_ID, { nombre: 'X' }, cuenta)).rejects.toThrow(ForbiddenException)

      expect(mockPrisma.marca.update).not.toHaveBeenCalled()
    })
  })

  // ── uploadLogo ────────────────────────────────────────────────────────

  describe('uploadLogo', () => {
    it('el OWNER de la marca sube el logo y se guarda la URL', async () => {
      mockLogos.subir.mockResolvedValue(LOGO_URL)
      mockPrisma.marca.update.mockResolvedValue({ id: MARCA_ID, logoUrl: LOGO_URL })

      const result = await service.uploadLogo(MARCA_ID, ARCHIVO, CUENTAS.OWNER_A)

      expect(mockLogos.subir).toHaveBeenCalledWith('marcas', MARCA_ID, ARCHIVO)
      expect(mockPrisma.marca.update).toHaveBeenCalledWith({
        where: { id: MARCA_ID },
        data: { logoUrl: LOGO_URL },
        select: { id: true, logoUrl: true },
      })
      expect(result).toEqual({ id: MARCA_ID, logoUrl: LOGO_URL })
    })

    it.each(SIN_ACCESO_A_LA_MARCA)('%s recibe 403 y no se sube nada', async (_caso, cuenta) => {
      await expect(service.uploadLogo(MARCA_ID, ARCHIVO, cuenta)).rejects.toThrow(ForbiddenException)

      expect(mockLogos.subir).not.toHaveBeenCalled()
      expect(mockPrisma.marca.update).not.toHaveBeenCalled()
    })
  })

  // ── removeLogo ────────────────────────────────────────────────────────

  describe('removeLogo', () => {
    it('el OWNER borra el archivo y deja el logo en null', async () => {
      mockPrisma.marca.findUnique.mockResolvedValue({ logoUrl: LOGO_URL })
      mockPrisma.marca.update.mockResolvedValue({ id: MARCA_ID, logoUrl: null })

      const result = await service.removeLogo(MARCA_ID, CUENTAS.OWNER_A)

      expect(mockLogos.eliminar).toHaveBeenCalledWith('marcas', MARCA_ID)
      expect(mockPrisma.marca.update).toHaveBeenCalledWith({
        where: { id: MARCA_ID },
        data: { logoUrl: null },
        select: { id: true, logoUrl: true },
      })
      expect(result).toEqual({ id: MARCA_ID, logoUrl: null })
    })

    it.each([
      ['no tiene logo', { logoUrl: null }, 'Esta marca no tiene logo'],
      ['no existe', null, 'Marca no encontrada'],
    ])('lanza 404 si la marca %s', async (_caso, fila, mensaje) => {
      mockPrisma.marca.findUnique.mockResolvedValue(fila)

      await expect(service.removeLogo(MARCA_ID, CUENTAS.OWNER_A)).rejects.toThrow(new NotFoundException(mensaje))

      expect(mockLogos.eliminar).not.toHaveBeenCalled()
    })

    it.each(SIN_ACCESO_A_LA_MARCA)('%s recibe 403 y no se borra nada', async (_caso, cuenta) => {
      await expect(service.removeLogo(MARCA_ID, cuenta)).rejects.toThrow(ForbiddenException)

      expect(mockLogos.eliminar).not.toHaveBeenCalled()
    })
  })

  // ── findRestaurantesByMarca y findAllPublicas (públicos) ──────────────

  describe('findRestaurantesByMarca', () => {
    it('pide solo los restaurantes activos de una marca activa (la baja de la marca los oculta aunque cada uno siga activo)', async () => {
      mockPrisma.restaurante.findMany.mockResolvedValue([{ id: 'rest-1', nombre: 'Sucursal Norte', direccion: null }])

      const result = await service.findRestaurantesByMarca('marca-1')

      expect(mockPrisma.restaurante.findMany).toHaveBeenCalledWith({
        where: { marcaId: 'marca-1', activo: true, marca: { activo: true } },
        select: { id: true, nombre: true, direccion: true },
        orderBy: { nombre: 'asc' },
      })
      expect(result).toEqual([{ id: 'rest-1', nombre: 'Sucursal Norte', direccion: null }])
    })

    it('una marca dada de baja no devuelve nada (lista vacía, igual que una marca que no existe)', async () => {
      mockPrisma.restaurante.findMany.mockResolvedValue([])

      await expect(service.findRestaurantesByMarca('marca-de-baja')).resolves.toEqual([])
    })
  })

  describe('findAllPublicas', () => {
    it('devuelve las marcas activas con la cantidad de restaurantes activos', async () => {
      mockPrisma.marca.findMany.mockResolvedValue([{ id: 'm-1', nombre: 'La Parrilla', _count: { restaurantes: 3 } }])

      const result = await service.findAllPublicas()

      expect(result).toEqual([{ id: 'm-1', nombre: 'La Parrilla', restaurantesActivos: 3 }])
    })
  })
})
