import { Test } from '@nestjs/testing'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import {
  RestauranteService,
  RESTAURANTE_CON_MARCA_SELECT,
  RESTAURANTE_DETALLE_SELECT,
} from './restaurante.service'
import { RESTAURANTE_SELECT } from './restaurante.select'
import { PrismaService } from '../prisma/prisma.service'
import { LogosService } from '../storage/logos.service'
import { AccesoService } from '../auth/supabase/acceso.service'
import { accesoDeTest, CUENTAS, MUNDO } from '../test/acceso-de-test'

const REST = MUNDO.REST_1
const RESTAURANTE = { id: REST, marcaId: MUNDO.MARCA_A, nombre: 'Sucursal Norte', activo: true, logoUrl: null }
const LOGO_URL = 'https://proyecto.supabase.co/storage/v1/object/public/logos/restaurantes/rest-1?v=1700000000000'
const ARCHIVO = { buffer: Buffer.from('logo'), mimetype: 'image/png' } as Express.Multer.File

const mockPrisma = {
  restaurante: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
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
        { provide: AccesoService, useValue: accesoDeTest() },
      ],
    }).compile()

    service = module.get(RestauranteService)
    jest.clearAllMocks()
  })

  describe('las respuestas no tienen las columnas de Mercado Pago', () => {
    it.each([
      ['RESTAURANTE_SELECT', RESTAURANTE_SELECT],
      ['RESTAURANTE_CON_MARCA_SELECT', RESTAURANTE_CON_MARCA_SELECT],
      ['RESTAURANTE_DETALLE_SELECT', RESTAURANTE_DETALLE_SELECT],
    ])('%s', (_nombre, select) => {
      expect(Object.keys(select).filter((campo) => campo.startsWith('mp'))).toEqual([])
    })

    it('los mozos del detalle no traen la contraseña', () => {
      expect(RESTAURANTE_DETALLE_SELECT.mozos.select).not.toHaveProperty('passwordHash')
    })
  })

  // ── findAll ───────────────────────────────────────────────────────────

  describe('findAll (los restaurantes de sus membresías)', () => {
    it.each([
      ['el OWNER: todos los de su marca', CUENTAS.OWNER_A, [REST, MUNDO.REST_2]],
      ['el GERENTE: el suyo', CUENTAS.GERENTE, [REST]],
    ])('%s', async (_caso, cuenta, ids) => {
      mockPrisma.restaurante.findMany.mockResolvedValue([RESTAURANTE])

      const result = await service.findAll(cuenta)

      expect(mockPrisma.restaurante.findMany).toHaveBeenCalledWith({
        where: { id: { in: ids } },
        orderBy: { nombre: 'asc' },
        select: RESTAURANTE_CON_MARCA_SELECT,
      })
      expect(result).toEqual([RESTAURANTE])
    })

    it.each([
      ['ROOT (no es un bypass)', CUENTAS.ROOT],
      ['el MOZO', CUENTAS.MOZO],
      ['un Usuario sin membresías', CUENTAS.SIN_MEMBRESIAS],
    ])('%s recibe 403', async (_caso, cuenta) => {
      await expect(service.findAll(cuenta)).rejects.toThrow(ForbiddenException)

      expect(mockPrisma.restaurante.findMany).not.toHaveBeenCalled()
    })
  })

  // ── findOne ───────────────────────────────────────────────────────────

  describe('findOne (el rol lo exige la ruta)', () => {
    it('pide el restaurante con el select de detalle', async () => {
      mockPrisma.restaurante.findUnique.mockResolvedValue(RESTAURANTE)

      const result = await service.findOne(REST)

      expect(mockPrisma.restaurante.findUnique).toHaveBeenCalledWith({
        where: { id: REST },
        select: RESTAURANTE_DETALLE_SELECT,
      })
      expect(result).toEqual(RESTAURANTE)
    })

    it('lanza 404 si no lo encuentra', async () => {
      mockPrisma.restaurante.findUnique.mockResolvedValue(null)

      await expect(service.findOne(REST)).rejects.toThrow(NotFoundException)
    })
  })

  // ── update ────────────────────────────────────────────────────────────

  describe('update (OWNER o GERENTE lo exige la ruta)', () => {
    beforeEach(() => {
      mockPrisma.restaurante.update.mockImplementation(({ data }: { data: object }) => Promise.resolve({ ...RESTAURANTE, ...data }))
    })

    it.each([
      ['la dirección', { direccion: 'Colón 123' }],
      ['el nombre de la sección de recomendados', { nombreSeccionRecomendados: 'DESTACADOS' }],
    ])('el OWNER de la marca cambia %s', async (_campo, dto) => {
      await service.update(REST, dto, CUENTAS.OWNER_A)

      expect(mockPrisma.restaurante.update).toHaveBeenCalledWith({
        where: { id: REST },
        data: dto,
        select: RESTAURANTE_SELECT,
      })
    })

    it.each([
      ['la dirección', { direccion: 'Colón 123' }],
      ['el nombre de la sección de recomendados', { nombreSeccionRecomendados: 'DESTACADOS' }],
    ])('el GERENTE recibe 403 si intenta cambiar %s', async (_campo, dto) => {
      await expect(service.update(REST, dto, CUENTAS.GERENTE)).rejects.toThrow(
        new ForbiddenException('Solo el owner de la marca puede cambiar la dirección y el nombre de la sección de recomendados'),
      )

      expect(mockPrisma.restaurante.update).not.toHaveBeenCalled()
    })

    it('el GERENTE sigue pudiendo cambiar el modo de sesión y el nombre', async () => {
      await service.update(REST, { modoSesion: 'seguro', nombre: 'Centro' }, CUENTAS.GERENTE)

      expect(mockPrisma.restaurante.update).toHaveBeenCalledWith({
        where: { id: REST },
        data: { modoSesion: 'seguro', nombre: 'Centro' },
        select: RESTAURANTE_SELECT,
      })
    })
  })

  // ── logo (solo el OWNER, lo exige la ruta) ────────────────────────────

  describe('uploadLogo', () => {
    it('sube el logo y se guarda la URL', async () => {
      mockLogos.subir.mockResolvedValue(LOGO_URL)
      mockPrisma.restaurante.update.mockResolvedValue({ id: REST, logoUrl: LOGO_URL })

      const result = await service.uploadLogo(REST, ARCHIVO)

      expect(mockLogos.subir).toHaveBeenCalledWith('restaurantes', REST, ARCHIVO)
      expect(mockPrisma.restaurante.update).toHaveBeenCalledWith({
        where: { id: REST },
        data: { logoUrl: LOGO_URL },
        select: { id: true, logoUrl: true },
      })
      expect(result).toEqual({ id: REST, logoUrl: LOGO_URL })
    })
  })

  describe('removeLogo', () => {
    it('borra el archivo y deja el logo en null', async () => {
      mockPrisma.restaurante.findUnique.mockResolvedValue({ logoUrl: LOGO_URL })
      mockPrisma.restaurante.update.mockResolvedValue({ id: REST, logoUrl: null })

      const result = await service.removeLogo(REST)

      expect(mockLogos.eliminar).toHaveBeenCalledWith('restaurantes', REST)
      expect(mockPrisma.restaurante.update).toHaveBeenCalledWith({
        where: { id: REST },
        data: { logoUrl: null },
        select: { id: true, logoUrl: true },
      })
      expect(result).toEqual({ id: REST, logoUrl: null })
    })

    it.each([
      ['no tiene logo propio', { logoUrl: null }, 'Este restaurante no tiene logo propio'],
      ['no existe', null, 'Restaurante no encontrado'],
    ])('lanza 404 si el restaurante %s', async (_caso, fila, mensaje) => {
      mockPrisma.restaurante.findUnique.mockResolvedValue(fila)

      await expect(service.removeLogo(REST)).rejects.toThrow(new NotFoundException(mensaje))

      expect(mockLogos.eliminar).not.toHaveBeenCalled()
    })
  })
})
