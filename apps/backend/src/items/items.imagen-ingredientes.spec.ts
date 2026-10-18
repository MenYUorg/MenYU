import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { JwtPayload } from '../auth/auth.service'
import { MenyuGateway } from '../gateway/menyu.gateway'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService } from '../storage/storage.service'
import { ItemsService } from './items.service'

// Imagen del ítem, borrado e ingredientes asociados, con el chequeo de pertenencia de OWNER y GERENTE.
// Los descuentos están en items.service.spec.
const prisma = {
  itemMenu: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
  itemIngrediente: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  ingrediente: { findUnique: jest.fn() },
  pedidoItem: { count: jest.fn() },
  pedidoItemMod: { count: jest.fn() },
  admin: { findUnique: jest.fn() },
  restaurante: { findUnique: jest.fn() },
  adminRestaurante: { findUnique: jest.fn() },
}
const storage = { uploadFile: jest.fn(), deleteFile: jest.fn() }
const gateway = { emitMenuUpdated: jest.fn() }

const OWNER = { sub: 'owner-1', tipo: 'admin', rol: 'OWNER' } as JwtPayload
const GERENTE = { sub: 'ger-1', tipo: 'admin', rol: 'GERENTE' } as JwtPayload
const ITEM = { id: 'item-1', restauranteId: 'rest-1', imagenUrl: null as string | null, precioBase: new Prisma.Decimal('1000'), precioDescuento: null, recomendadoEn: null }

describe('ItemsService: imagen, borrado e ingredientes', () => {
  let service: ItemsService

  beforeEach(() => {
    jest.clearAllMocks()
    prisma.itemMenu.findUnique.mockResolvedValue(ITEM)
    prisma.itemMenu.update.mockImplementation(({ data }: { data: object }) => Promise.resolve({ ...ITEM, ...data }))
    // OWNER de la marca del restaurante
    prisma.admin.findUnique.mockResolvedValue({ id: 'owner-1', marcaId: 'marca-1' })
    prisma.restaurante.findUnique.mockResolvedValue({ id: 'rest-1', marcaId: 'marca-1' })
    service = new ItemsService(prisma as unknown as PrismaService, storage as unknown as StorageService, gateway as unknown as MenyuGateway)
  })

  describe('pertenencia al restaurante', () => {
    it('un OWNER de otra marca recibe 403 y no se toca el ítem', async () => {
      prisma.restaurante.findUnique.mockResolvedValue({ id: 'rest-1', marcaId: 'marca-2' })

      await expect(service.remove('item-1', OWNER)).rejects.toThrow(new ForbiddenException('No tenés acceso a este restaurante'))
      expect(prisma.itemMenu.delete).not.toHaveBeenCalled()
    })

    it('un GERENTE asignado puede y uno sin asignación recibe 403', async () => {
      prisma.pedidoItem.count.mockResolvedValue(0)
      prisma.adminRestaurante.findUnique.mockResolvedValueOnce({ adminId: 'ger-1', restauranteId: 'rest-1' }).mockResolvedValueOnce(null)

      await expect(service.remove('item-1', GERENTE)).resolves.toBeUndefined()
      await expect(service.remove('item-1', GERENTE)).rejects.toThrow(ForbiddenException)
      expect(prisma.adminRestaurante.findUnique).toHaveBeenCalledWith({
        where: { adminId_restauranteId: { adminId: 'ger-1', restauranteId: 'rest-1' } },
      })
    })

    it('un usuario sin rol de admin recibe 403', async () => {
      await expect(service.remove('item-1', { sub: 'm', tipo: 'mozo' } as JwtPayload)).rejects.toThrow(ForbiddenException)
    })

    it('si el ítem no existe responde 404', async () => {
      prisma.itemMenu.findUnique.mockResolvedValue(null)

      await expect(service.remove('item-x', OWNER)).rejects.toThrow(new NotFoundException('Ítem del menú no encontrado'))
    })
  })

  describe('imagen', () => {
    const archivo = { buffer: Buffer.from('png'), mimetype: 'image/png' } as Express.Multer.File

    it('sube la imagen a restaurante/ítem y guarda la URL', async () => {
      storage.uploadFile.mockResolvedValue('https://storage.test/menu-items/rest-1/item-1')

      const item = await service.uploadImagen('item-1', archivo, OWNER)

      expect(storage.uploadFile).toHaveBeenCalledWith('menu-items', 'rest-1/item-1', archivo.buffer, 'image/png')
      expect(prisma.itemMenu.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'item-1' }, data: { imagenUrl: 'https://storage.test/menu-items/rest-1/item-1' } }),
      )
      expect(item).toMatchObject({ imagenUrl: 'https://storage.test/menu-items/rest-1/item-1', esRecomendado: false, precioVigente: 1000 })
    })

    it('quitarla borra el archivo y deja la URL en null', async () => {
      prisma.itemMenu.findUnique.mockResolvedValue({ ...ITEM, imagenUrl: 'https://storage.test/x' })

      const item = await service.removeImagen('item-1', OWNER)

      expect(storage.deleteFile).toHaveBeenCalledWith('menu-items', 'rest-1/item-1')
      expect(item).toMatchObject({ imagenUrl: null })
    })

    it('quitarla cuando no tiene responde 404 sin tocar el storage', async () => {
      await expect(service.removeImagen('item-1', OWNER)).rejects.toThrow(new NotFoundException('Este ítem no tiene imagen'))
      expect(storage.deleteFile).not.toHaveBeenCalled()
    })
  })

  describe('remove', () => {
    it('borra un ítem que no está en ningún pedido', async () => {
      prisma.pedidoItem.count.mockResolvedValue(0)

      await service.remove('item-1', OWNER)

      expect(prisma.itemMenu.delete).toHaveBeenCalledWith({ where: { id: 'item-1' } })
    })

    it('si está en pedidos responde 409 y sugiere marcarlo como no disponible', async () => {
      prisma.pedidoItem.count.mockResolvedValue(3)

      await expect(service.remove('item-1', OWNER)).rejects.toThrow(
        new ConflictException('No se puede eliminar: el ítem aparece en 3 pedido(s). Marcarlo como no disponible en su lugar.'),
      )
      expect(prisma.itemMenu.delete).not.toHaveBeenCalled()
    })
  })

  describe('ingredientes del ítem', () => {
    const DTO = { ingredienteId: 'ing-1', esOriginal: true, cantidad: 1, esRemovible: true, esAgregable: false, precioExtra: 0 }

    it('asocia un ingrediente del mismo restaurante y devuelve el ítem actualizado', async () => {
      prisma.ingrediente.findUnique.mockResolvedValue({ id: 'ing-1', restauranteId: 'rest-1' })
      prisma.itemIngrediente.findFirst.mockResolvedValue(null)

      const item = await service.addIngrediente('item-1', DTO, OWNER)

      expect(prisma.itemIngrediente.create).toHaveBeenCalledWith({ data: { itemId: 'item-1', ...DTO } })
      expect(item).toMatchObject({ id: 'item-1' })
    })

    it.each([
      ['el ingrediente no existe', null, null, new NotFoundException('Ingrediente no encontrado')],
      ['el ingrediente es de otro restaurante', { id: 'ing-1', restauranteId: 'rest-2' }, null, new BadRequestException('El ingrediente no pertenece a este restaurante')],
      ['ya está asociado', { id: 'ing-1', restauranteId: 'rest-1' }, { id: 'ii-1' }, new ConflictException('Ese ingrediente ya está asociado a este ítem')],
    ])('no asocia si %s', async (_, ingrediente, asociado, error) => {
      prisma.ingrediente.findUnique.mockResolvedValue(ingrediente)
      prisma.itemIngrediente.findFirst.mockResolvedValue(asociado)

      await expect(service.addIngrediente('item-1', DTO, OWNER)).rejects.toThrow(error)
      expect(prisma.itemIngrediente.create).not.toHaveBeenCalled()
    })

    it('actualiza una asociación del ítem', async () => {
      prisma.itemIngrediente.findUnique.mockResolvedValue({ id: 'ii-1', itemId: 'item-1', item: ITEM })

      await service.updateIngrediente('item-1', 'ii-1', { precioExtra: 200 }, OWNER)

      expect(prisma.itemIngrediente.findUnique).toHaveBeenCalledWith({ where: { id: 'ii-1' }, include: { item: true } })
      expect(prisma.itemIngrediente.update).toHaveBeenCalledWith({ where: { id: 'ii-1' }, data: { precioExtra: 200 } })
    })

    it.each([
      ['no existe', null],
      ['es de otro ítem', { id: 'ii-1', itemId: 'item-2', item: ITEM }],
    ])('una asociación que %s responde 404', async (_, asociacion) => {
      prisma.itemIngrediente.findUnique.mockResolvedValue(asociacion)

      await expect(service.updateIngrediente('item-1', 'ii-1', {}, OWNER)).rejects.toThrow(
        new NotFoundException('Asociación ingrediente-ítem no encontrada'),
      )
      expect(prisma.itemIngrediente.update).not.toHaveBeenCalled()
    })

    it('desasocia un ingrediente que no está en modificaciones de pedidos', async () => {
      prisma.itemIngrediente.findUnique.mockResolvedValue({ id: 'ii-1', itemId: 'item-1', item: ITEM })
      prisma.pedidoItemMod.count.mockResolvedValue(0)

      await service.removeIngrediente('item-1', 'ii-1', OWNER)

      expect(prisma.itemIngrediente.delete).toHaveBeenCalledWith({ where: { id: 'ii-1' } })
    })

    it('si aparece en modificaciones de pedidos responde 409 y no lo desasocia', async () => {
      prisma.itemIngrediente.findUnique.mockResolvedValue({ id: 'ii-1', itemId: 'item-1', item: ITEM })
      prisma.pedidoItemMod.count.mockResolvedValue(2)

      await expect(service.removeIngrediente('item-1', 'ii-1', OWNER)).rejects.toThrow(
        new ConflictException('No se puede desasociar: el ingrediente aparece en modificaciones de pedidos históricos'),
      )
      expect(prisma.itemIngrediente.delete).not.toHaveBeenCalled()
    })
  })
})
