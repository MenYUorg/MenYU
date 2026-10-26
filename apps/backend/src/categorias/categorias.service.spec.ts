import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { accesoDeTest, CUENTAS, MUNDO } from '../test/acceso-de-test'
import { PrismaMock, comoPrisma, crearPrismaMock } from '../test/prisma-mock'
import { CategoriasService } from './categorias.service'

const REST = MUNDO.REST_1
const ENTRADAS = { id: 'cat-1', nombre: 'Entradas', restauranteId: REST, orden: 1 }

describe('CategoriasService', () => {
  let prisma: PrismaMock
  let service: CategoriasService

  beforeEach(() => {
    prisma = crearPrismaMock()
    service = new CategoriasService(comoPrisma(prisma), accesoDeTest())
  })

  describe('create', () => {
    it('crea la categoría si el nombre no se repite en el restaurante', async () => {
      // Arrange
      prisma.categoriaMenu.findFirst.mockResolvedValue(null)
      prisma.categoriaMenu.create.mockResolvedValue(ENTRADAS)
      const dto = { nombre: 'Entradas', restauranteId: REST, orden: 1 }

      // Act
      const categoria = await service.create(dto)

      // Assert
      expect(categoria).toEqual(ENTRADAS)
      expect(prisma.categoriaMenu.findFirst).toHaveBeenCalledWith({
        where: { restauranteId: REST, nombre: { equals: 'Entradas', mode: 'insensitive' } },
      })
      expect(prisma.categoriaMenu.create).toHaveBeenCalledWith({ data: dto })
    })

    it('con un nombre repetido en el restaurante responde 409 y no la crea', async () => {
      // Arrange
      prisma.categoriaMenu.findFirst.mockResolvedValue(ENTRADAS)

      // Act
      const alta = service.create({ nombre: 'entradas', restauranteId: REST })

      // Assert
      await expect(alta).rejects.toThrow(new ConflictException('Ya existe una categoría con el nombre "entradas"'))
      expect(prisma.categoriaMenu.create).not.toHaveBeenCalled()
    })
  })

  describe('findAll y findOne', () => {
    it('findAll lista las categorías del restaurante por orden', async () => {
      // Arrange
      prisma.categoriaMenu.findMany.mockResolvedValue([ENTRADAS])

      // Act
      const categorias = await service.findAll(REST)

      // Assert
      expect(categorias).toEqual([ENTRADAS])
      expect(prisma.categoriaMenu.findMany).toHaveBeenCalledWith({ where: { restauranteId: REST }, orderBy: { orden: 'asc' } })
    })

    it('findOne de una categoría que no existe responde 404', async () => {
      // Arrange
      prisma.categoriaMenu.findUnique.mockResolvedValue(null)

      // Act
      const busqueda = service.findOne('no-existe', CUENTAS.OWNER_A)

      // Assert
      await expect(busqueda).rejects.toThrow(new NotFoundException('Categoría no encontrada'))
    })

    it.each([
      ['el OWNER de la marca', CUENTAS.OWNER_A],
      ['el GERENTE del restaurante', CUENTAS.GERENTE],
    ])('findOne devuelve la categoría a %s', async (_caso, cuenta) => {
      // Arrange
      prisma.categoriaMenu.findUnique.mockResolvedValue(ENTRADAS)

      // Act
      const categoria = await service.findOne('cat-1', cuenta)

      // Assert
      expect(categoria).toEqual(ENTRADAS)
    })

    it.each([
      ['ROOT (no es un bypass)', CUENTAS.ROOT],
      ['el OWNER de otra marca', CUENTAS.OWNER_B],
      ['el MOZO', CUENTAS.MOZO],
    ])('findOne: %s recibe 403', async (_caso, cuenta) => {
      // Arrange
      prisma.categoriaMenu.findUnique.mockResolvedValue(ENTRADAS)

      // Act + Assert
      await expect(service.findOne('cat-1', cuenta)).rejects.toThrow(ForbiddenException)
    })
  })

  describe('update', () => {
    beforeEach(() => {
      prisma.categoriaMenu.findUnique.mockResolvedValue(ENTRADAS)
    })

    it('al cambiar el nombre busca duplicados excluyendo a la propia categoría', async () => {
      // Arrange
      prisma.categoriaMenu.findFirst.mockResolvedValue(null)
      prisma.categoriaMenu.update.mockResolvedValue({ ...ENTRADAS, nombre: 'Para picar' })

      // Act
      await service.update('cat-1', { nombre: 'Para picar' }, CUENTAS.GERENTE)

      // Assert
      expect(prisma.categoriaMenu.findFirst).toHaveBeenCalledWith({
        where: { restauranteId: REST, nombre: { equals: 'Para picar', mode: 'insensitive' }, id: { not: 'cat-1' } },
      })
      expect(prisma.categoriaMenu.update).toHaveBeenCalledWith({ where: { id: 'cat-1' }, data: { nombre: 'Para picar' } })
    })

    it('si el nombre nuevo ya lo usa otra categoría responde 409', async () => {
      // Arrange
      prisma.categoriaMenu.findFirst.mockResolvedValue({ id: 'cat-2', nombre: 'Postres' })

      // Act
      const cambio = service.update('cat-1', { nombre: 'Postres' }, CUENTAS.OWNER_A)

      // Assert
      await expect(cambio).rejects.toThrow(ConflictException)
      expect(prisma.categoriaMenu.update).not.toHaveBeenCalled()
    })

    it('si no cambia el nombre no busca duplicados', async () => {
      // Arrange
      prisma.categoriaMenu.update.mockResolvedValue({ ...ENTRADAS, orden: 3 })

      // Act
      await service.update('cat-1', { nombre: 'Entradas', orden: 3 }, CUENTAS.OWNER_A)

      // Assert
      expect(prisma.categoriaMenu.findFirst).not.toHaveBeenCalled()
      expect(prisma.categoriaMenu.update).toHaveBeenCalledTimes(1)
    })

    it('el GERENTE de otro restaurante recibe 403 y no se toca nada', async () => {
      // Arrange
      prisma.categoriaMenu.findUnique.mockResolvedValue({ ...ENTRADAS, restauranteId: MUNDO.REST_2 })

      // Act + Assert
      await expect(service.update('cat-1', { orden: 3 }, CUENTAS.GERENTE)).rejects.toThrow(ForbiddenException)
      expect(prisma.categoriaMenu.update).not.toHaveBeenCalled()
    })
  })

  describe('remove (solo el OWNER)', () => {
    beforeEach(() => {
      prisma.categoriaMenu.findUnique.mockResolvedValue(ENTRADAS)
    })

    it('borra la categoría si el OWNER es de la marca', async () => {
      // Act
      await service.remove('cat-1', CUENTAS.OWNER_A)

      // Assert
      expect(prisma.categoriaMenu.delete).toHaveBeenCalledWith({ where: { id: 'cat-1' } })
    })

    it.each([
      ['el GERENTE del restaurante', CUENTAS.GERENTE],
      ['ROOT', CUENTAS.ROOT],
      ['el MOZO', CUENTAS.MOZO],
    ])('%s recibe 403 y no se borra nada', async (_caso, cuenta) => {
      // Act + Assert
      await expect(service.remove('cat-1', cuenta)).rejects.toThrow(ForbiddenException)
      expect(prisma.categoriaMenu.delete).not.toHaveBeenCalled()
    })
  })
})
