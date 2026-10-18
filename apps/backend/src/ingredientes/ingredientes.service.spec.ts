import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { GERENTE, OWNER, PrismaMock, comoPrisma, crearPrismaMock, ownerDeLaMarca, ownerDeOtraMarca } from '../test/prisma-mock'
import { IngredientesService } from './ingredientes.service'

const QUESO = { id: 'ing-1', nombre: 'Queso', restauranteId: 'rest-1' }

describe('IngredientesService', () => {
  let prisma: PrismaMock
  let service: IngredientesService

  beforeEach(() => {
    prisma = crearPrismaMock()
    service = new IngredientesService(comoPrisma(prisma))
  })

  describe('create', () => {
    it('crea el ingrediente si el nombre no se repite en el restaurante', async () => {
      // Arrange
      ownerDeLaMarca(prisma)
      prisma.ingrediente.findFirst.mockResolvedValue(null)
      prisma.ingrediente.create.mockResolvedValue(QUESO)

      // Act
      const ingrediente = await service.create({ nombre: 'Queso', restauranteId: 'rest-1' }, OWNER)

      // Assert
      expect(ingrediente).toEqual(QUESO)
      expect(prisma.ingrediente.findFirst).toHaveBeenCalledWith({
        where: { restauranteId: 'rest-1', nombre: { equals: 'Queso', mode: 'insensitive' } },
      })
    })

    it('con un nombre repetido (sin importar mayúsculas) responde 409', async () => {
      // Arrange
      ownerDeLaMarca(prisma)
      prisma.ingrediente.findFirst.mockResolvedValue(QUESO)

      // Act
      const alta = service.create({ nombre: 'QUESO', restauranteId: 'rest-1' }, OWNER)

      // Assert
      await expect(alta).rejects.toThrow(new ConflictException('Ya existe un ingrediente con el nombre "QUESO"'))
      expect(prisma.ingrediente.create).not.toHaveBeenCalled()
    })

    it('un OWNER de otra marca recibe 403', async () => {
      // Arrange
      ownerDeOtraMarca(prisma)

      // Act
      const alta = service.create({ nombre: 'Queso', restauranteId: 'rest-1' }, OWNER)

      // Assert
      await expect(alta).rejects.toThrow(ForbiddenException)
    })
  })

  describe('findAll y findOne', () => {
    it('findAll lista los ingredientes del restaurante por nombre', async () => {
      // Arrange
      prisma.adminRestaurante.findUnique.mockResolvedValue({ adminId: GERENTE.sub, restauranteId: 'rest-1' })
      prisma.ingrediente.findMany.mockResolvedValue([QUESO])

      // Act
      const ingredientes = await service.findAll('rest-1', GERENTE)

      // Assert
      expect(ingredientes).toEqual([QUESO])
      expect(prisma.ingrediente.findMany).toHaveBeenCalledWith({ where: { restauranteId: 'rest-1' }, orderBy: { nombre: 'asc' } })
    })

    it('findOne de un ingrediente que no existe responde 404', async () => {
      // Arrange
      prisma.ingrediente.findUnique.mockResolvedValue(null)

      // Act
      const busqueda = service.findOne('no-existe', OWNER)

      // Assert
      await expect(busqueda).rejects.toThrow(new NotFoundException('Ingrediente no encontrado'))
    })

    it('findOne de un ingrediente de otro restaurante para un mozo responde 403', async () => {
      // Arrange
      prisma.ingrediente.findUnique.mockResolvedValue(QUESO)

      // Act
      const busqueda = service.findOne('ing-1', { sub: 'mozo-1', tipo: 'mozo' })

      // Assert
      await expect(busqueda).rejects.toThrow(ForbiddenException)
    })

    it('findOne devuelve el ingrediente si el OWNER es de la marca', async () => {
      // Arrange
      prisma.ingrediente.findUnique.mockResolvedValue(QUESO)
      ownerDeLaMarca(prisma)

      // Act
      const ingrediente = await service.findOne('ing-1', OWNER)

      // Assert
      expect(ingrediente).toEqual(QUESO)
    })
  })

  describe('update', () => {
    beforeEach(() => {
      prisma.ingrediente.findUnique.mockResolvedValue(QUESO)
      ownerDeLaMarca(prisma)
    })

    it('al renombrar busca duplicados excluyendo al propio ingrediente', async () => {
      // Arrange
      prisma.ingrediente.findFirst.mockResolvedValue(null)
      prisma.ingrediente.update.mockResolvedValue({ ...QUESO, nombre: 'Queso azul' })

      // Act
      await service.update('ing-1', { nombre: 'Queso azul' }, OWNER)

      // Assert
      expect(prisma.ingrediente.findFirst).toHaveBeenCalledWith({
        where: { restauranteId: 'rest-1', nombre: { equals: 'Queso azul', mode: 'insensitive' }, id: { not: 'ing-1' } },
      })
      expect(prisma.ingrediente.update).toHaveBeenCalledWith({ where: { id: 'ing-1' }, data: { nombre: 'Queso azul' } })
    })

    it('si el nombre nuevo ya existe responde 409 y no actualiza', async () => {
      // Arrange
      prisma.ingrediente.findFirst.mockResolvedValue({ id: 'ing-2', nombre: 'Tomate' })

      // Act
      const cambio = service.update('ing-1', { nombre: 'Tomate' }, OWNER)

      // Assert
      await expect(cambio).rejects.toThrow(ConflictException)
      expect(prisma.ingrediente.update).not.toHaveBeenCalled()
    })

    it('con el mismo nombre no busca duplicados', async () => {
      // Arrange
      prisma.ingrediente.update.mockResolvedValue(QUESO)

      // Act
      await service.update('ing-1', { nombre: 'Queso' }, OWNER)

      // Assert
      expect(prisma.ingrediente.findFirst).not.toHaveBeenCalled()
    })
  })

  describe('remove', () => {
    beforeEach(() => {
      prisma.ingrediente.findUnique.mockResolvedValue(QUESO)
      ownerDeLaMarca(prisma)
    })

    it('si está en ítems del menú responde 409 con la cantidad y no lo borra', async () => {
      // Arrange
      prisma.itemIngrediente.count.mockResolvedValue(2)

      // Act
      const baja = service.remove('ing-1', OWNER)

      // Assert
      await expect(baja).rejects.toThrow('No se puede eliminar: el ingrediente está asociado a 2 ítem(s) del menú')
      expect(prisma.ingrediente.delete).not.toHaveBeenCalled()
    })

    it('si no está en uso lo borra', async () => {
      // Arrange
      prisma.itemIngrediente.count.mockResolvedValue(0)

      // Act
      await service.remove('ing-1', OWNER)

      // Assert
      expect(prisma.ingrediente.delete).toHaveBeenCalledWith({ where: { id: 'ing-1' } })
    })

    it('un GERENTE no asignado recibe 403', async () => {
      // Arrange
      prisma.adminRestaurante.findUnique.mockResolvedValue(null)

      // Act
      const baja = service.remove('ing-1', GERENTE)

      // Assert
      await expect(baja).rejects.toThrow(ForbiddenException)
      expect(prisma.ingrediente.delete).not.toHaveBeenCalled()
    })
  })
})
