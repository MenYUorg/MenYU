import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { GERENTE, OWNER, PrismaMock, comoPrisma, crearPrismaMock, ownerDeLaMarca, ownerDeOtraMarca } from '../test/prisma-mock'
import { CategoriasService } from './categorias.service'

const ENTRADAS = { id: 'cat-1', nombre: 'Entradas', restauranteId: 'rest-1', orden: 1 }

describe('CategoriasService', () => {
  let prisma: PrismaMock
  let service: CategoriasService

  beforeEach(() => {
    prisma = crearPrismaMock()
    service = new CategoriasService(comoPrisma(prisma))
  })

  describe('create', () => {
    it('crea la categoría si el nombre no se repite en el restaurante', async () => {
      // Arrange
      ownerDeLaMarca(prisma)
      prisma.categoriaMenu.findFirst.mockResolvedValue(null)
      prisma.categoriaMenu.create.mockResolvedValue(ENTRADAS)
      const dto = { nombre: 'Entradas', restauranteId: 'rest-1', orden: 1 }

      // Act
      const categoria = await service.create(dto, OWNER)

      // Assert
      expect(categoria).toEqual(ENTRADAS)
      expect(prisma.categoriaMenu.findFirst).toHaveBeenCalledWith({
        where: { restauranteId: 'rest-1', nombre: { equals: 'Entradas', mode: 'insensitive' } },
      })
      expect(prisma.categoriaMenu.create).toHaveBeenCalledWith({ data: dto })
    })

    it('con un nombre repetido en el restaurante responde 409 y no la crea', async () => {
      // Arrange
      ownerDeLaMarca(prisma)
      prisma.categoriaMenu.findFirst.mockResolvedValue(ENTRADAS)

      // Act
      const alta = service.create({ nombre: 'entradas', restauranteId: 'rest-1' }, OWNER)

      // Assert
      await expect(alta).rejects.toThrow(new ConflictException('Ya existe una categoría con el nombre "entradas"'))
      expect(prisma.categoriaMenu.create).not.toHaveBeenCalled()
    })

    it('un OWNER de otra marca recibe 403', async () => {
      // Arrange
      ownerDeOtraMarca(prisma)

      // Act
      const alta = service.create({ nombre: 'Postres', restauranteId: 'rest-1' }, OWNER)

      // Assert
      await expect(alta).rejects.toThrow(ForbiddenException)
      expect(prisma.categoriaMenu.create).not.toHaveBeenCalled()
    })
  })

  describe('findAll y findOne', () => {
    it('findAll lista las categorías del restaurante por orden', async () => {
      // Arrange
      prisma.adminRestaurante.findUnique.mockResolvedValue({ adminId: GERENTE.sub, restauranteId: 'rest-1' })
      prisma.categoriaMenu.findMany.mockResolvedValue([ENTRADAS])

      // Act
      const categorias = await service.findAll('rest-1', GERENTE)

      // Assert
      expect(categorias).toEqual([ENTRADAS])
      expect(prisma.categoriaMenu.findMany).toHaveBeenCalledWith({ where: { restauranteId: 'rest-1' }, orderBy: { orden: 'asc' } })
    })

    it('findOne de una categoría que no existe responde 404', async () => {
      // Arrange
      prisma.categoriaMenu.findUnique.mockResolvedValue(null)

      // Act
      const busqueda = service.findOne('no-existe', OWNER)

      // Assert
      await expect(busqueda).rejects.toThrow(new NotFoundException('Categoría no encontrada'))
    })

    it('findOne devuelve la categoría si el OWNER es de la marca', async () => {
      // Arrange
      prisma.categoriaMenu.findUnique.mockResolvedValue(ENTRADAS)
      ownerDeLaMarca(prisma)

      // Act
      const categoria = await service.findOne('cat-1', OWNER)

      // Assert
      expect(categoria).toEqual(ENTRADAS)
    })
  })

  describe('update', () => {
    beforeEach(() => {
      prisma.categoriaMenu.findUnique.mockResolvedValue(ENTRADAS)
      ownerDeLaMarca(prisma)
    })

    it('al cambiar el nombre busca duplicados excluyendo a la propia categoría', async () => {
      // Arrange
      prisma.categoriaMenu.findFirst.mockResolvedValue(null)
      prisma.categoriaMenu.update.mockResolvedValue({ ...ENTRADAS, nombre: 'Para picar' })

      // Act
      await service.update('cat-1', { nombre: 'Para picar' }, OWNER)

      // Assert
      expect(prisma.categoriaMenu.findFirst).toHaveBeenCalledWith({
        where: { restauranteId: 'rest-1', nombre: { equals: 'Para picar', mode: 'insensitive' }, id: { not: 'cat-1' } },
      })
      expect(prisma.categoriaMenu.update).toHaveBeenCalledWith({ where: { id: 'cat-1' }, data: { nombre: 'Para picar' } })
    })

    it('si el nombre nuevo ya lo usa otra categoría responde 409', async () => {
      // Arrange
      prisma.categoriaMenu.findFirst.mockResolvedValue({ id: 'cat-2', nombre: 'Postres' })

      // Act
      const cambio = service.update('cat-1', { nombre: 'Postres' }, OWNER)

      // Assert
      await expect(cambio).rejects.toThrow(ConflictException)
      expect(prisma.categoriaMenu.update).not.toHaveBeenCalled()
    })

    it('si no cambia el nombre no busca duplicados', async () => {
      // Arrange
      prisma.categoriaMenu.update.mockResolvedValue({ ...ENTRADAS, orden: 3 })

      // Act
      await service.update('cat-1', { nombre: 'Entradas', orden: 3 }, OWNER)

      // Assert
      expect(prisma.categoriaMenu.findFirst).not.toHaveBeenCalled()
      expect(prisma.categoriaMenu.update).toHaveBeenCalledTimes(1)
    })
  })

  describe('remove', () => {
    it('borra la categoría si el OWNER es de la marca', async () => {
      // Arrange
      prisma.categoriaMenu.findUnique.mockResolvedValue(ENTRADAS)
      ownerDeLaMarca(prisma)

      // Act
      await service.remove('cat-1', OWNER)

      // Assert
      expect(prisma.categoriaMenu.delete).toHaveBeenCalledWith({ where: { id: 'cat-1' } })
    })

    it('un usuario que no es admin (un mozo) recibe 403', async () => {
      // Arrange
      prisma.categoriaMenu.findUnique.mockResolvedValue(ENTRADAS)

      // Act
      const baja = service.remove('cat-1', { sub: 'mozo-1', tipo: 'mozo', restauranteId: 'rest-1' })

      // Assert
      await expect(baja).rejects.toThrow(ForbiddenException)
      expect(prisma.categoriaMenu.delete).not.toHaveBeenCalled()
    })

    it('un GERENTE no asignado recibe 403 y no se borra nada', async () => {
      // Arrange
      prisma.categoriaMenu.findUnique.mockResolvedValue(ENTRADAS)
      prisma.adminRestaurante.findUnique.mockResolvedValue(null)

      // Act
      const baja = service.remove('cat-1', GERENTE)

      // Assert
      await expect(baja).rejects.toThrow(ForbiddenException)
      expect(prisma.categoriaMenu.delete).not.toHaveBeenCalled()
    })
  })
})
