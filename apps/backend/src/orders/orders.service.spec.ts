import { Test } from '@nestjs/testing'
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Prisma } from '@prisma/client'
import { OrdersService } from './orders.service'
import { PrismaService } from '../prisma/prisma.service'
import { MenyuGateway } from '../gateway/menyu.gateway'

const VALID_PAYLOAD = {
  sub: 'cli-1',
  tipo: 'cliente',
  sesionId: 'sesion-1',
  mesaId: 'mesa-1',
  restauranteId: 'rest-1',
}

const SESION_ACTIVA = { id: 'sesion-1', estado: 'activa' }

// Lo que firma POST /auth/guest: tipo cliente, pero sin sesión de mesa. La cuenta de cliente (/auth/login) es igual.
const TOKEN_DE_INVITADO = { sub: 'cli-invitado', tipo: 'cliente', nombre: 'Invitado' }

const ITEM_SIMPLE = {
  id: 'item-1',
  precioBase: 1500,
  restauranteId: 'rest-1',
  ingredientes: [],
}

const ITEM_CON_INGREDIENTE = {
  id: 'item-2',
  precioBase: 2000,
  restauranteId: 'rest-1',
  ingredientes: [{ id: 'ii-queso', precioExtra: 150 }],
}

const PEDIDO_CREADO = { id: 'pedido-1', items: [], mesa: { numero: 5 } }

describe('OrdersService', () => {
  let service: OrdersService

  const mockPrisma = {
    sesionMesa: { findUnique: jest.fn() },
    itemMenu: { findMany: jest.fn() },
    pedido: { create: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn(),
  }

  const mockJwt = { verify: jest.fn() }
  const mockGateway = { emitOrderNew: jest.fn() }

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: MenyuGateway, useValue: mockGateway },
      ],
    }).compile()

    service = module.get(OrdersService)
    jest.clearAllMocks()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockPrisma.$transaction.mockImplementation((fn: any) => fn(mockPrisma))
    mockPrisma.pedido.create.mockResolvedValue(PEDIDO_CREADO)
  })

  // ── create — autenticación ────────────────────────────────────────────────

  describe('create — autenticación', () => {
    it('sin header → UnauthorizedException', async () => {
      await expect(service.create(undefined, { items: [] })).rejects.toThrow(UnauthorizedException)
    })

    it('header sin "Bearer " → UnauthorizedException', async () => {
      await expect(service.create('Token abc123', { items: [] })).rejects.toThrow(
        UnauthorizedException,
      )
    })

    it('JWT inválido → UnauthorizedException', async () => {
      mockJwt.verify.mockImplementation(() => {
        throw new Error('invalid signature')
      })
      await expect(service.create('Bearer bad.token', { items: [] })).rejects.toThrow(
        UnauthorizedException,
      )
    })

    it('JWT con tipo != "cliente" → UnauthorizedException', async () => {
      mockJwt.verify.mockReturnValue({ ...VALID_PAYLOAD, tipo: 'mozo' })
      await expect(service.create('Bearer valid.token', { items: [] })).rejects.toThrow(
        UnauthorizedException,
      )
    })

    it('un token de invitado (sin sesión de mesa) no crea pedidos: 401 sin tocar la base', async () => {
      mockJwt.verify.mockReturnValue(TOKEN_DE_INVITADO)

      await expect(service.create('Bearer invitado', { items: [] })).rejects.toThrow(
        new UnauthorizedException('Este recurso requiere una sesión de mesa'),
      )
      expect(mockPrisma.sesionMesa.findUnique).not.toHaveBeenCalled()
    })
  })

  // ── create — sesión ───────────────────────────────────────────────────────

  describe('create — validación de sesión', () => {
    it('sesión inexistente → BadRequestException', async () => {
      mockJwt.verify.mockReturnValue(VALID_PAYLOAD)
      mockPrisma.sesionMesa.findUnique.mockResolvedValue(null)

      await expect(service.create('Bearer valid.token', { items: [] })).rejects.toThrow(
        BadRequestException,
      )
    })

    it('sesión en estado "cerrada" → BadRequestException', async () => {
      mockJwt.verify.mockReturnValue(VALID_PAYLOAD)
      mockPrisma.sesionMesa.findUnique.mockResolvedValue({ id: 'sesion-1', estado: 'cerrada' })

      await expect(service.create('Bearer valid.token', { items: [] })).rejects.toThrow(
        BadRequestException,
      )
    })

    it('sesión en estado "pagando" → BadRequestException', async () => {
      mockJwt.verify.mockReturnValue(VALID_PAYLOAD)
      mockPrisma.sesionMesa.findUnique.mockResolvedValue({ id: 'sesion-1', estado: 'pagando' })

      await expect(service.create('Bearer valid.token', { items: [] })).rejects.toThrow(
        BadRequestException,
      )
    })
  })

  // ── create — validación de ítems ─────────────────────────────────────────

  describe('create — validación de ítems', () => {
    it('item no encontrado en el restaurante → NotFoundException', async () => {
      mockJwt.verify.mockReturnValue(VALID_PAYLOAD)
      mockPrisma.sesionMesa.findUnique.mockResolvedValue(SESION_ACTIVA)
      mockPrisma.itemMenu.findMany.mockResolvedValue([])

      await expect(
        service.create('Bearer valid.token', {
          items: [{ itemMenuId: 'item-inexistente', cantidad: 1, modificaciones: [] }],
        }),
      ).rejects.toThrow(NotFoundException)
    })

    it('request con 2 ítems distintos pero BD solo devuelve 1 → NotFoundException', async () => {
      mockJwt.verify.mockReturnValue(VALID_PAYLOAD)
      mockPrisma.sesionMesa.findUnique.mockResolvedValue(SESION_ACTIVA)
      mockPrisma.itemMenu.findMany.mockResolvedValue([ITEM_SIMPLE])

      await expect(
        service.create('Bearer valid.token', {
          items: [
            { itemMenuId: 'item-1', cantidad: 1, modificaciones: [] },
            { itemMenuId: 'item-otro-restaurante', cantidad: 1, modificaciones: [] },
          ],
        }),
      ).rejects.toThrow(NotFoundException)
    })
  })

  // ── create — cálculo de precio ────────────────────────────────────────────

  describe('create — cálculo de precio', () => {
    it('sin modificaciones → usa precioBase directamente', async () => {
      mockJwt.verify.mockReturnValue(VALID_PAYLOAD)
      mockPrisma.sesionMesa.findUnique.mockResolvedValue(SESION_ACTIVA)
      mockPrisma.itemMenu.findMany.mockResolvedValue([ITEM_SIMPLE])

      await service.create('Bearer valid.token', {
        items: [{ itemMenuId: 'item-1', cantidad: 2, modificaciones: [] }],
      })

      expect(mockPrisma.pedido.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            items: expect.objectContaining({
              create: expect.arrayContaining([
                expect.objectContaining({ precioUnitario: 1500 }),
              ]),
            }),
          }),
        }),
      )
    })

    it('modificación "agregar" suma precioExtra × cantidad al precio base', async () => {
      mockJwt.verify.mockReturnValue(VALID_PAYLOAD)
      mockPrisma.sesionMesa.findUnique.mockResolvedValue(SESION_ACTIVA)
      mockPrisma.itemMenu.findMany.mockResolvedValue([ITEM_CON_INGREDIENTE])

      await service.create('Bearer valid.token', {
        items: [
          {
            itemMenuId: 'item-2',
            cantidad: 1,
            modificaciones: [{ itemIngredienteId: 'ii-queso', accion: 'agregar', cantidad: 2 }],
          },
        ],
      })

      // 2000 + (150 × 2) = 2300
      expect(mockPrisma.pedido.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            items: expect.objectContaining({
              create: expect.arrayContaining([
                expect.objectContaining({ precioUnitario: 2300 }),
              ]),
            }),
          }),
        }),
      )
    })

    it('modificación "quitar" no altera el precio', async () => {
      mockJwt.verify.mockReturnValue(VALID_PAYLOAD)
      mockPrisma.sesionMesa.findUnique.mockResolvedValue(SESION_ACTIVA)
      mockPrisma.itemMenu.findMany.mockResolvedValue([ITEM_CON_INGREDIENTE])

      await service.create('Bearer valid.token', {
        items: [
          {
            itemMenuId: 'item-2',
            cantidad: 1,
            modificaciones: [{ itemIngredienteId: 'ii-queso', accion: 'quitar', cantidad: 1 }],
          },
        ],
      })

      expect(mockPrisma.pedido.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            items: expect.objectContaining({
              create: expect.arrayContaining([
                expect.objectContaining({ precioUnitario: 2000 }),
              ]),
            }),
          }),
        }),
      )
    })

    it('ingredienteId que no existe en el item no suma precio (no panics)', async () => {
      mockJwt.verify.mockReturnValue(VALID_PAYLOAD)
      mockPrisma.sesionMesa.findUnique.mockResolvedValue(SESION_ACTIVA)
      mockPrisma.itemMenu.findMany.mockResolvedValue([ITEM_SIMPLE])

      await service.create('Bearer valid.token', {
        items: [
          {
            itemMenuId: 'item-1',
            cantidad: 1,
            modificaciones: [{ itemIngredienteId: 'ii-inexistente', accion: 'agregar', cantidad: 1 }],
          },
        ],
      })

      expect(mockPrisma.pedido.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            items: expect.objectContaining({
              create: expect.arrayContaining([
                expect.objectContaining({ precioUnitario: 1500 }),
              ]),
            }),
          }),
        }),
      )
    })

    it('pedido creado exitosamente → emite evento por gateway con restauranteId correcto', async () => {
      mockJwt.verify.mockReturnValue(VALID_PAYLOAD)
      mockPrisma.sesionMesa.findUnique.mockResolvedValue(SESION_ACTIVA)
      mockPrisma.itemMenu.findMany.mockResolvedValue([ITEM_SIMPLE])

      await service.create('Bearer valid.token', {
        items: [{ itemMenuId: 'item-1', cantidad: 1, modificaciones: [] }],
      })

      expect(mockGateway.emitOrderNew).toHaveBeenCalledWith('rest-1', PEDIDO_CREADO)
    })
  })

  // ── create — descuentos ───────────────────────────────────────────────────

  describe('create — descuentos', () => {
    const ITEM_EN_DESCUENTO = { ...ITEM_CON_INGREDIENTE, id: 'item-desc', precioBase: 2000, precioDescuento: 1500 }

    // Devuelve los precioUnitario que se mandaron a crear, en el orden de los ítems del pedido.
    async function preciosCobrados(
      itemsDeLaBd: object[],
      items: Array<{ itemMenuId: string; cantidad: number; modificaciones: Array<{ itemIngredienteId: string; accion: 'agregar' | 'quitar'; cantidad: number }> }>,
    ) {
      mockJwt.verify.mockReturnValue(VALID_PAYLOAD)
      mockPrisma.sesionMesa.findUnique.mockResolvedValue(SESION_ACTIVA)
      mockPrisma.itemMenu.findMany.mockResolvedValue(itemsDeLaBd)

      await service.create('Bearer valid.token', { items })

      const data = mockPrisma.pedido.create.mock.calls[0][0].data
      return data.items.create.map((i: { precioUnitario: number }) => i.precioUnitario)
    }

    it('un ítem con descuento se cobra al precio con descuento, no al base', async () => {
      const precios = await preciosCobrados(
        [ITEM_EN_DESCUENTO],
        [{ itemMenuId: 'item-desc', cantidad: 1, modificaciones: [] }],
      )

      expect(precios).toEqual([1500])
    })

    it('los extras se cobran a precio normal sobre el precio con descuento', async () => {
      const precios = await preciosCobrados(
        [ITEM_EN_DESCUENTO],
        [
          {
            itemMenuId: 'item-desc',
            cantidad: 1,
            modificaciones: [{ itemIngredienteId: 'ii-queso', accion: 'agregar', cantidad: 2 }],
          },
        ],
      )

      // 1500 (con descuento) + 150 × 2 (extra a precio normal) = 1800
      expect(precios).toEqual([1800])
    })

    it('quitar un ingrediente no altera el precio con descuento', async () => {
      const precios = await preciosCobrados(
        [ITEM_EN_DESCUENTO],
        [
          {
            itemMenuId: 'item-desc',
            cantidad: 1,
            modificaciones: [{ itemIngredienteId: 'ii-queso', accion: 'quitar', cantidad: 1 }],
          },
        ],
      )

      expect(precios).toEqual([1500])
    })

    it('en un mismo pedido, el ítem con descuento y el que no lo tiene se cobran cada uno a su precio', async () => {
      const precios = await preciosCobrados(
        [ITEM_EN_DESCUENTO, { ...ITEM_SIMPLE, precioBase: 1800 }],
        [
          { itemMenuId: 'item-desc', cantidad: 3, modificaciones: [] },
          { itemMenuId: 'item-1', cantidad: 1, modificaciones: [] },
        ],
      )

      expect(precios).toEqual([1500, 1800]) // 1500 con descuento (base 2000) y 1800 sin descuento
    })

    it('un ítem sin descuento se cobra igual que antes (precio base más extras)', async () => {
      const precios = await preciosCobrados(
        [{ ...ITEM_CON_INGREDIENTE, precioDescuento: null }],
        [
          {
            itemMenuId: 'item-2',
            cantidad: 1,
            modificaciones: [{ itemIngredienteId: 'ii-queso', accion: 'agregar', cantidad: 2 }],
          },
        ],
      )

      expect(precios).toEqual([2300])
    })

    it('un descuento guardado que no es válido contra el precio base se ignora: se cobra el base', async () => {
      const precios = await preciosCobrados(
        [{ ...ITEM_EN_DESCUENTO, precioDescuento: 2000 }],
        [{ itemMenuId: 'item-desc', cantidad: 1, modificaciones: [] }],
      )

      expect(precios).toEqual([2000])
    })

    it('el precio guardado es un número, aunque el precio base de la base de datos llegue como Decimal', async () => {
      const precios = await preciosCobrados(
        [{ ...ITEM_EN_DESCUENTO, precioBase: new Prisma.Decimal('2000.00') }],
        [{ itemMenuId: 'item-desc', cantidad: 1, modificaciones: [] }],
      )

      expect(typeof precios[0]).toBe('number')
      expect(precios).toEqual([1500])
    })
  })

  // ── findBySesion ──────────────────────────────────────────────────────────

  describe('findBySesion', () => {
    it('sin header → UnauthorizedException', async () => {
      await expect(service.findBySesion(undefined)).rejects.toThrow(UnauthorizedException)
    })

    it('header sin "Bearer " → UnauthorizedException', async () => {
      await expect(service.findBySesion('Basic abc')).rejects.toThrow(UnauthorizedException)
    })

    it('JWT con tipo distinto de "cliente" → UnauthorizedException', async () => {
      mockJwt.verify.mockReturnValue({ ...VALID_PAYLOAD, tipo: 'admin' })
      await expect(service.findBySesion('Bearer valid.token')).rejects.toThrow(UnauthorizedException)
    })

    // El hueco del hotfix: con sesionId undefined, Prisma ignora el filtro y devolvía los pedidos de toda la base.
    it('un token de invitado (sin sesión de mesa) no lista nada: 401 sin consultar los pedidos', async () => {
      mockJwt.verify.mockReturnValue(TOKEN_DE_INVITADO)

      await expect(service.findBySesion('Bearer invitado')).rejects.toThrow(
        new UnauthorizedException('Este recurso requiere una sesión de mesa'),
      )
      expect(mockPrisma.pedido.findMany).not.toHaveBeenCalled()
    })

    it('JWT válido → llama findMany filtrando por sesionId del payload', async () => {
      mockJwt.verify.mockReturnValue(VALID_PAYLOAD)
      mockPrisma.pedido.findMany.mockResolvedValue([])

      await service.findBySesion('Bearer valid.token')

      expect(mockPrisma.pedido.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { sesionId: 'sesion-1' } }),
      )
    })

    it('JWT válido → devuelve los pedidos de la sesión', async () => {
      mockJwt.verify.mockReturnValue(VALID_PAYLOAD)
      const pedidos = [{ id: 'p-1' }, { id: 'p-2' }]
      mockPrisma.pedido.findMany.mockResolvedValue(pedidos)

      const result = await service.findBySesion('Bearer valid.token')

      expect(result).toEqual(pedidos)
    })
  })
})
