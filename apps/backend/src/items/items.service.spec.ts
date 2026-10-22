import { Test } from '@nestjs/testing'
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { ItemsService } from './items.service'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService } from '../storage/storage.service'
import { MenyuGateway } from '../gateway/menyu.gateway'
import { JwtPayload } from '../auth/auth.service'

const OWNER: JwtPayload = { sub: 'owner-1', email: 'owner@test.com', tipo: 'admin', rol: 'OWNER' }
const GERENTE: JwtPayload = { sub: 'gerente-1', email: 'gerente@test.com', tipo: 'admin', rol: 'GERENTE' }
const ROOT: JwtPayload = { sub: 'root-1', email: 'root@menyu.com', tipo: 'admin', rol: 'ROOT' }
const MOZO: JwtPayload = { sub: 'mozo-1', tipo: 'mozo', restauranteId: 'rest-1' }

const ITEM = {
  id: 'item-1',
  restauranteId: 'rest-1',
  nombre: 'Milanesa napolitana',
  precioBase: new Prisma.Decimal('1500.00'),
  precioDescuento: null as number | null,
  recomendadoEn: null,
}

const mockPrisma = {
  itemMenu: { findUnique: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  admin: { findUnique: jest.fn() },
  restaurante: { findUnique: jest.fn() },
  adminRestaurante: { findUnique: jest.fn() },
}
const mockGateway = { emitMenuUpdated: jest.fn() }

// Deja pasar al OWNER de la marca "marca-1" y al GERENTE asignado a "rest-1".
function permitirAccesoNormal() {
  mockPrisma.admin.findUnique.mockResolvedValue({ marcaId: 'marca-1' })
  mockPrisma.restaurante.findUnique.mockResolvedValue({ marcaId: 'marca-1' })
  mockPrisma.adminRestaurante.findUnique.mockResolvedValue({ adminId: 'gerente-1' })
}

describe('ItemsService — descuentos', () => {
  let service: ItemsService

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ItemsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: {} },
        { provide: MenyuGateway, useValue: mockGateway },
      ],
    }).compile()

    service = module.get(ItemsService)
    jest.clearAllMocks()

    permitirAccesoNormal()
    mockPrisma.itemMenu.findUnique.mockResolvedValue(ITEM)
    mockPrisma.itemMenu.update.mockImplementation(async ({ data }: { data: object }) => ({ ...ITEM, ...data }))
  })

  // ── setDescuento ───────────────────────────────────────────────────────────

  describe('setDescuento', () => {
    it('OWNER por precio: guarda el precio y devuelve el porcentaje calculado', async () => {
      const result = await service.setDescuento('item-1', { precioDescuento: 1200 }, OWNER)

      expect(mockPrisma.itemMenu.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'item-1' }, data: { precioDescuento: 1200 } }),
      )
      expect(result).toMatchObject({ precioDescuento: 1200, porcentajeDescuento: 20, precioVigente: 1200 })
    })

    it('OWNER por porcentaje: guarda el precio calculado, no el porcentaje', async () => {
      const result = await service.setDescuento('item-1', { porcentaje: 20 }, OWNER)

      expect(mockPrisma.itemMenu.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { precioDescuento: 1200 } }),
      )
      expect(result).toMatchObject({ precioDescuento: 1200, porcentajeDescuento: 20, precioVigente: 1200 })
    })

    it('redondea al peso más cercano con .5 hacia arriba (base 1005 al 50% queda en 503)', async () => {
      mockPrisma.itemMenu.findUnique.mockResolvedValue({ ...ITEM, precioBase: new Prisma.Decimal('1005') })

      await service.setDescuento('item-1', { porcentaje: 50 }, OWNER)

      expect(mockPrisma.itemMenu.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { precioDescuento: 503 } }),
      )
    })

    it('GERENTE asignado al restaurante puede', async () => {
      const result = await service.setDescuento('item-1', { precioDescuento: 1200 }, GERENTE)

      expect(result).toMatchObject({ precioVigente: 1200 })
      expect(mockPrisma.adminRestaurante.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { adminId_restauranteId: { adminId: 'gerente-1', restauranteId: 'rest-1' } },
        }),
      )
    })

    it('avisa a los clientes conectados con menu:updated del restaurante del ítem', async () => {
      await service.setDescuento('item-1', { precioDescuento: 1200 }, OWNER)

      expect(mockGateway.emitMenuUpdated).toHaveBeenCalledTimes(1)
      expect(mockGateway.emitMenuUpdated).toHaveBeenCalledWith('rest-1')
    })

    it('reemplaza un descuento anterior', async () => {
      mockPrisma.itemMenu.findUnique.mockResolvedValue({ ...ITEM, precioDescuento: 1000 })

      const result = await service.setDescuento('item-1', { precioDescuento: 1300 }, OWNER)

      expect(result).toMatchObject({ precioDescuento: 1300, porcentajeDescuento: 13 })
    })

    it('devuelve números, no strings', async () => {
      const result = await service.setDescuento('item-1', { precioDescuento: 1200 }, OWNER)

      expect(typeof result.precioDescuento).toBe('number')
      expect(typeof result.porcentajeDescuento).toBe('number')
      expect(typeof result.precioVigente).toBe('number')
    })

    describe('permisos', () => {
      it('ROOT → 403 (no es un bypass)', async () => {
        await expect(service.setDescuento('item-1', { precioDescuento: 1200 }, ROOT)).rejects.toThrow(
          ForbiddenException,
        )

        expect(mockPrisma.itemMenu.update).not.toHaveBeenCalled()
        expect(mockGateway.emitMenuUpdated).not.toHaveBeenCalled()
      })

      it('un mozo → 403', async () => {
        await expect(service.setDescuento('item-1', { precioDescuento: 1200 }, MOZO)).rejects.toThrow(
          ForbiddenException,
        )

        expect(mockPrisma.itemMenu.update).not.toHaveBeenCalled()
      })

      it('OWNER de otra marca → 403', async () => {
        mockPrisma.admin.findUnique.mockResolvedValue({ marcaId: 'marca-otra' })

        await expect(service.setDescuento('item-1', { precioDescuento: 1200 }, OWNER)).rejects.toThrow(
          ForbiddenException,
        )

        expect(mockPrisma.itemMenu.update).not.toHaveBeenCalled()
        expect(mockGateway.emitMenuUpdated).not.toHaveBeenCalled()
      })

      it('GERENTE de otro restaurante (no asignado) → 403', async () => {
        mockPrisma.adminRestaurante.findUnique.mockResolvedValue(null)

        await expect(service.setDescuento('item-1', { precioDescuento: 1200 }, GERENTE)).rejects.toThrow(
          ForbiddenException,
        )

        expect(mockPrisma.itemMenu.update).not.toHaveBeenCalled()
        expect(mockGateway.emitMenuUpdated).not.toHaveBeenCalled()
      })

      it('un ítem que no existe → 404, antes de revisar permisos', async () => {
        mockPrisma.itemMenu.findUnique.mockResolvedValue(null)

        await expect(service.setDescuento('no-existe', { precioDescuento: 1200 }, OWNER)).rejects.toThrow(
          NotFoundException,
        )

        expect(mockPrisma.admin.findUnique).not.toHaveBeenCalled()
      })
    })

    describe('validación', () => {
      it('precio y porcentaje a la vez → 400', async () => {
        await expect(
          service.setDescuento('item-1', { precioDescuento: 1200, porcentaje: 20 }, OWNER),
        ).rejects.toThrow('no los dos')

        expect(mockPrisma.itemMenu.update).not.toHaveBeenCalled()
      })

      it.each([
        ['ninguno de los dos', {}],
        ['precio null', { precioDescuento: null }],
        ['porcentaje null', { porcentaje: null }],
      ])('%s → 400 "Falta el precio con descuento o el porcentaje"', async (_caso, dto) => {
        // Act
        const descuento = service.setDescuento('item-1', dto as { precioDescuento?: number; porcentaje?: number }, OWNER)

        // Assert
        await expect(descuento).rejects.toThrow(BadRequestException)
        await expect(descuento).rejects.toThrow('Falta el precio con descuento o el porcentaje')
        expect(mockPrisma.itemMenu.update).not.toHaveBeenCalled()
      })

      it.each([
        ['igual al precio base', 1500],
        ['mayor al precio base', 2000],
        ['cero', 0],
        ['negativo', -10],
        ['con decimales', 1199.5],
        ['que equivale a menos de 1%', 1495],
      ])('precio %s → 400', async (_caso, precioDescuento) => {
        await expect(service.setDescuento('item-1', { precioDescuento }, OWNER)).rejects.toThrow(
          BadRequestException,
        )

        expect(mockPrisma.itemMenu.update).not.toHaveBeenCalled()
        expect(mockGateway.emitMenuUpdated).not.toHaveBeenCalled()
      })

      it.each([0, 100, -1, 12.5])('porcentaje %p → 400', async (porcentaje) => {
        await expect(service.setDescuento('item-1', { porcentaje }, OWNER)).rejects.toThrow(
          BadRequestException,
        )

        expect(mockPrisma.itemMenu.update).not.toHaveBeenCalled()
      })

      it('si el redondeo deja el precio igual al base → 400 (base 10 con 1%)', async () => {
        mockPrisma.itemMenu.findUnique.mockResolvedValue({ ...ITEM, precioBase: new Prisma.Decimal('10') })

        await expect(service.setDescuento('item-1', { porcentaje: 1 }, OWNER)).rejects.toThrow(
          'el precio no cambia',
        )

        expect(mockPrisma.itemMenu.update).not.toHaveBeenCalled()
      })

      it('un ítem con precio base 0 no admite descuento', async () => {
        mockPrisma.itemMenu.findUnique.mockResolvedValue({ ...ITEM, precioBase: new Prisma.Decimal('0') })

        await expect(service.setDescuento('item-1', { precioDescuento: 1 }, OWNER)).rejects.toThrow(
          BadRequestException,
        )
        await expect(service.setDescuento('item-1', { porcentaje: 50 }, OWNER)).rejects.toThrow(
          BadRequestException,
        )
      })
    })
  })

  // ── removeDescuento ────────────────────────────────────────────────────────

  describe('removeDescuento', () => {
    it('quita el descuento y el ítem vuelve a su precio base', async () => {
      mockPrisma.itemMenu.findUnique.mockResolvedValue({ ...ITEM, precioDescuento: 1200 })

      const result = await service.removeDescuento('item-1', OWNER)

      expect(mockPrisma.itemMenu.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'item-1' }, data: { precioDescuento: null } }),
      )
      expect(result).toMatchObject({ precioDescuento: null, porcentajeDescuento: null, precioVigente: 1500 })
      expect(mockGateway.emitMenuUpdated).toHaveBeenCalledWith('rest-1')
    })

    it('GERENTE asignado puede quitarlo', async () => {
      mockPrisma.itemMenu.findUnique.mockResolvedValue({ ...ITEM, precioDescuento: 1200 })

      await expect(service.removeDescuento('item-1', GERENTE)).resolves.toMatchObject({ precioVigente: 1500 })
    })

    it('si el ítem no tiene descuento no es un error: no escribe ni avisa y lo devuelve como está', async () => {
      mockPrisma.itemMenu.findUnique.mockResolvedValue({ ...ITEM, precioDescuento: null })

      const result = await service.removeDescuento('item-1', OWNER)

      expect(mockPrisma.itemMenu.update).not.toHaveBeenCalled()
      expect(mockGateway.emitMenuUpdated).not.toHaveBeenCalled()
      expect(result).toMatchObject({ id: 'item-1', precioDescuento: null, precioVigente: 1500 })
    })

    it.each([
      ['ROOT', ROOT],
      ['un mozo', MOZO],
    ])('%s → 403', async (_nombre, user) => {
      mockPrisma.itemMenu.findUnique.mockResolvedValue({ ...ITEM, precioDescuento: 1200 })

      await expect(service.removeDescuento('item-1', user)).rejects.toThrow(ForbiddenException)

      expect(mockPrisma.itemMenu.update).not.toHaveBeenCalled()
    })

    it('OWNER de otra marca → 403', async () => {
      mockPrisma.itemMenu.findUnique.mockResolvedValue({ ...ITEM, precioDescuento: 1200 })
      mockPrisma.admin.findUnique.mockResolvedValue({ marcaId: 'marca-otra' })

      await expect(service.removeDescuento('item-1', OWNER)).rejects.toThrow(ForbiddenException)

      expect(mockPrisma.itemMenu.update).not.toHaveBeenCalled()
    })

    it('GERENTE de otro restaurante → 403', async () => {
      mockPrisma.itemMenu.findUnique.mockResolvedValue({ ...ITEM, precioDescuento: 1200 })
      mockPrisma.adminRestaurante.findUnique.mockResolvedValue(null)

      await expect(service.removeDescuento('item-1', GERENTE)).rejects.toThrow(ForbiddenException)

      expect(mockPrisma.itemMenu.update).not.toHaveBeenCalled()
    })

    it('un ítem que no existe → 404', async () => {
      mockPrisma.itemMenu.findUnique.mockResolvedValue(null)

      await expect(service.removeDescuento('no-existe', OWNER)).rejects.toThrow(NotFoundException)
    })
  })

  // ── update: cambio de precio base con descuento activo (D4) ────────────────

  describe('update — precio base con un descuento activo', () => {
    const conDescuento = { ...ITEM, precioDescuento: 900 }

    beforeEach(() => {
      mockPrisma.itemMenu.findUnique.mockResolvedValue(conDescuento)
      mockPrisma.itemMenu.update.mockImplementation(async ({ data }: { data: object }) => ({
        ...conDescuento,
        ...data,
      }))
    })

    it.each([900, 800, 0])('un precio base de %d (menor o igual al precio con descuento) → 400', async (precioBase) => {
      await expect(service.update('item-1', { precioBase }, OWNER)).rejects.toThrow(BadRequestException)
      await expect(service.update('item-1', { precioBase }, OWNER)).rejects.toThrow(
        'tiene que ser mayor al precio con descuento',
      )

      expect(mockPrisma.itemMenu.update).not.toHaveBeenCalled()
      expect(mockGateway.emitMenuUpdated).not.toHaveBeenCalled()
    })

    it('un precio base mayor al precio con descuento se guarda y el porcentaje se recalcula', async () => {
      const result = await service.update('item-1', { precioBase: 1000 }, OWNER)

      expect(mockPrisma.itemMenu.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ precioBase: 1000 }) }),
      )
      expect(result).toMatchObject({ precioDescuento: 900, porcentajeDescuento: 10, precioVigente: 900 })
    })

    it('si el porcentaje quedaría fuera de 1 a 99 → 400', async () => {
      await expect(service.update('item-1', { precioBase: 901 }, OWNER)).rejects.toThrow(
        'dejaría de ser válido',
      )
      await expect(service.update('item-1', { precioBase: 200000 }, OWNER)).rejects.toThrow(
        'dejaría de ser válido',
      )
    })

    it('editar otros campos del ítem no revisa el descuento', async () => {
      await expect(service.update('item-1', { nombre: 'Milanesa XL' }, OWNER)).resolves.toBeDefined()
      await expect(service.update('item-1', { disponible: false }, OWNER)).resolves.toBeDefined()
    })

    it('un ítem sin descuento acepta cualquier precio base', async () => {
      mockPrisma.itemMenu.findUnique.mockResolvedValue({ ...ITEM, precioDescuento: null })

      await expect(service.update('item-1', { precioBase: 1 }, OWNER)).resolves.toMatchObject({
        precioDescuento: null,
        precioVigente: 1,
      })
    })
  })

  // ── Los campos derivados llegan en todas las respuestas ────────────────────

  describe('respuestas con precio vigente', () => {
    it('findAll devuelve precioDescuento, porcentajeDescuento y precioVigente de cada ítem', async () => {
      mockPrisma.itemMenu.findMany.mockResolvedValue([
        { ...ITEM, id: 'a', precioBase: new Prisma.Decimal('2000'), precioDescuento: 1500 },
        { ...ITEM, id: 'b', precioBase: new Prisma.Decimal('800'), precioDescuento: null },
      ])

      const result = await service.findAll('rest-1', OWNER)

      expect(result.map((i) => [i.id, i.precioDescuento, i.porcentajeDescuento, i.precioVigente])).toEqual([
        ['a', 1500, 25, 1500],
        ['b', null, null, 800],
      ])
    })

    it('findOne y create también los incluyen', async () => {
      mockPrisma.itemMenu.findUnique.mockResolvedValue({ ...ITEM, precioDescuento: 1200 })
      expect(await service.findOne('item-1', OWNER)).toMatchObject({ porcentajeDescuento: 20, precioVigente: 1200 })

      mockPrisma.itemMenu.findFirst.mockResolvedValue(null)
      mockPrisma.itemMenu.create.mockResolvedValue({ ...ITEM, precioDescuento: null })
      const creado = await service.create(
        { restauranteId: 'rest-1', nombre: 'Nuevo', precioBase: 1500 },
        OWNER,
      )
      expect(creado).toMatchObject({ precioDescuento: null, porcentajeDescuento: null, precioVigente: 1500 })
    })

    it('un descuento guardado que no es válido contra el precio base se ignora (se cobra el base)', async () => {
      mockPrisma.itemMenu.findMany.mockResolvedValue([{ ...ITEM, precioDescuento: 1500 }])

      const [item] = await service.findAll('rest-1', OWNER)

      expect(item).toMatchObject({ precioDescuento: null, porcentajeDescuento: null, precioVigente: 1500 })
    })
  })
})
