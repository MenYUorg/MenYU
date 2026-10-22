import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { MenyuGateway } from '../gateway/menyu.gateway'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService } from '../storage/storage.service'
import { accesoDeTest, CUENTAS, MUNDO } from '../test/acceso-de-test'
import { ItemsService } from './items.service'

// Imagen del ítem, borrado e ingredientes asociados, y los permisos de todas las rutas de un ítem (con las
// membresías de CUENTAS). Los descuentos están en items.service.spec.
const prisma = {
  itemMenu: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
  itemIngrediente: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  ingrediente: { findUnique: jest.fn() },
  pedidoItem: { count: jest.fn() },
  pedidoItemMod: { count: jest.fn() },
}
const storage = { uploadFile: jest.fn(), deleteFile: jest.fn() }
const gateway = { emitMenuUpdated: jest.fn() }

const OWNER = CUENTAS.OWNER_A
const REST = MUNDO.REST_1
const ITEM = { id: 'item-1', restauranteId: REST, imagenUrl: null as string | null, precioBase: new Prisma.Decimal('1000'), precioDescuento: null, recomendadoEn: null }
const ARCHIVO = { buffer: Buffer.from('png'), mimetype: 'image/png' } as Express.Multer.File

describe('ItemsService: imagen, borrado e ingredientes', () => {
  let service: ItemsService

  beforeEach(() => {
    jest.clearAllMocks()
    prisma.itemMenu.findUnique.mockResolvedValue(ITEM)
    prisma.itemMenu.update.mockImplementation(({ data }: { data: object }) => Promise.resolve({ ...ITEM, ...data }))
    prisma.itemIngrediente.findUnique.mockResolvedValue({ id: 'ii-1', itemId: 'item-1', item: ITEM })
    prisma.pedidoItem.count.mockResolvedValue(0)
    prisma.pedidoItemMod.count.mockResolvedValue(0)
    service = new ItemsService(
      prisma as unknown as PrismaService,
      storage as unknown as StorageService,
      gateway as unknown as MenyuGateway,
      accesoDeTest(),
    )
  })

  describe('permisos de las rutas de un ítem (el rol en el restaurante del ítem)', () => {
    const RUTAS: Array<[string, (u: UsuarioAutenticado) => Promise<unknown>]> = [
      ['findOne', (u) => service.findOne('item-1', u)],
      ['update', (u) => service.update('item-1', { disponible: false }, u)],
      ['uploadImagen', (u) => service.uploadImagen('item-1', ARCHIVO, u)],
      ['removeImagen', (u) => service.removeImagen('item-1', u)],
      ['addIngrediente', (u) => service.addIngrediente('item-1', { ingredienteId: 'ing-1' } as never, u)],
      ['updateIngrediente', (u) => service.updateIngrediente('item-1', 'ii-1', {}, u)],
      ['removeIngrediente', (u) => service.removeIngrediente('item-1', 'ii-1', u)],
    ]

    it.each(RUTAS)('%s: el OWNER de la marca y el GERENTE del restaurante pasan', async (_ruta, llamar) => {
      prisma.itemMenu.findUnique.mockResolvedValue({ ...ITEM, imagenUrl: 'https://storage.test/x' })
      prisma.ingrediente.findUnique.mockResolvedValue({ id: 'ing-1', restauranteId: REST })
      prisma.itemIngrediente.findFirst.mockResolvedValue(null)

      await llamar(OWNER)
      await llamar(CUENTAS.GERENTE)
    })

    it.each(RUTAS)('%s: ROOT, el OWNER de otra marca, el MOZO y la COCINA reciben 403 sin tocar nada', async (_ruta, llamar) => {
      for (const cuenta of [CUENTAS.ROOT, CUENTAS.OWNER_B, CUENTAS.MOZO, CUENTAS.COCINA, CUENTAS.SIN_MEMBRESIAS]) {
        await expect(llamar(cuenta)).rejects.toThrow(ForbiddenException)
      }
      expect(prisma.itemMenu.update).not.toHaveBeenCalled()
      expect(prisma.itemIngrediente.create).not.toHaveBeenCalled()
      expect(prisma.itemIngrediente.update).not.toHaveBeenCalled()
      expect(prisma.itemIngrediente.delete).not.toHaveBeenCalled()
      expect(storage.uploadFile).not.toHaveBeenCalled()
      expect(storage.deleteFile).not.toHaveBeenCalled()
    })

    it('el GERENTE de otro restaurante de la marca recibe 403', async () => {
      prisma.itemMenu.findUnique.mockResolvedValue({ ...ITEM, restauranteId: MUNDO.REST_2 })

      await expect(service.update('item-1', { disponible: false }, CUENTAS.GERENTE)).rejects.toThrow(ForbiddenException)
      await expect(service.update('item-1', { disponible: false }, OWNER)).resolves.toBeDefined()
    })

    it('borrar un ítem es solo del OWNER: el GERENTE y ROOT reciben 403 y no se borra', async () => {
      await expect(service.remove('item-1', CUENTAS.GERENTE)).rejects.toThrow(ForbiddenException)
      await expect(service.remove('item-1', CUENTAS.ROOT)).rejects.toThrow(ForbiddenException)
      expect(prisma.itemMenu.delete).not.toHaveBeenCalled()

      await service.remove('item-1', OWNER)
      expect(prisma.itemMenu.delete).toHaveBeenCalledWith({ where: { id: 'item-1' } })
    })

    it('si el ítem no existe responde 404', async () => {
      prisma.itemMenu.findUnique.mockResolvedValue(null)

      await expect(service.remove('item-x', OWNER)).rejects.toThrow(new NotFoundException('Ítem del menú no encontrado'))
    })
  })

  describe('imagen', () => {
    it('sube la imagen a restaurante/ítem y guarda la URL', async () => {
      storage.uploadFile.mockResolvedValue('https://storage.test/menu-items/x')

      const item = await service.uploadImagen('item-1', ARCHIVO, OWNER)

      expect(storage.uploadFile).toHaveBeenCalledWith('menu-items', `${REST}/item-1`, ARCHIVO.buffer, 'image/png')
      expect(prisma.itemMenu.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'item-1' }, data: { imagenUrl: 'https://storage.test/menu-items/x' } }),
      )
      expect(item).toMatchObject({ imagenUrl: 'https://storage.test/menu-items/x', esRecomendado: false, precioVigente: 1000 })
    })

    it('quitarla borra el archivo y deja la URL en null', async () => {
      prisma.itemMenu.findUnique.mockResolvedValue({ ...ITEM, imagenUrl: 'https://storage.test/x' })

      const item = await service.removeImagen('item-1', OWNER)

      expect(storage.deleteFile).toHaveBeenCalledWith('menu-items', `${REST}/item-1`)
      expect(item).toMatchObject({ imagenUrl: null })
    })

    it('quitarla cuando no tiene responde 404 sin tocar el storage', async () => {
      await expect(service.removeImagen('item-1', OWNER)).rejects.toThrow(new NotFoundException('Este ítem no tiene imagen'))
      expect(storage.deleteFile).not.toHaveBeenCalled()
    })
  })

  describe('remove', () => {
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
      prisma.ingrediente.findUnique.mockResolvedValue({ id: 'ing-1', restauranteId: REST })
      prisma.itemIngrediente.findFirst.mockResolvedValue(null)

      const item = await service.addIngrediente('item-1', DTO, OWNER)

      expect(prisma.itemIngrediente.create).toHaveBeenCalledWith({ data: { itemId: 'item-1', ...DTO } })
      expect(item).toMatchObject({ id: 'item-1' })
    })

    it.each([
      ['el ingrediente no existe', null, null, new NotFoundException('Ingrediente no encontrado')],
      ['el ingrediente es de otro restaurante', { id: 'ing-1', restauranteId: MUNDO.REST_2 }, null, new BadRequestException('El ingrediente no pertenece a este restaurante')],
      ['ya está asociado', { id: 'ing-1', restauranteId: REST }, { id: 'ii-1' }, new ConflictException('Ese ingrediente ya está asociado a este ítem')],
    ])('no asocia si %s', async (_, ingrediente, asociado, error) => {
      prisma.ingrediente.findUnique.mockResolvedValue(ingrediente)
      prisma.itemIngrediente.findFirst.mockResolvedValue(asociado)

      await expect(service.addIngrediente('item-1', DTO, OWNER)).rejects.toThrow(error)
      expect(prisma.itemIngrediente.create).not.toHaveBeenCalled()
    })

    it('actualiza una asociación del ítem', async () => {
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
      await service.removeIngrediente('item-1', 'ii-1', OWNER)

      expect(prisma.itemIngrediente.delete).toHaveBeenCalledWith({ where: { id: 'ii-1' } })
    })

    it('si aparece en modificaciones de pedidos responde 409 y no lo desasocia', async () => {
      prisma.pedidoItemMod.count.mockResolvedValue(2)

      await expect(service.removeIngrediente('item-1', 'ii-1', OWNER)).rejects.toThrow(
        new ConflictException('No se puede desasociar: el ingrediente aparece en modificaciones de pedidos históricos'),
      )
      expect(prisma.itemIngrediente.delete).not.toHaveBeenCalled()
    })
  })
})
