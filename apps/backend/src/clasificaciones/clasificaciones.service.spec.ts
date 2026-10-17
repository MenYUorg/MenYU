import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { GERENTE, OWNER, PrismaMock, comoPrisma, crearPrismaMock, ownerDeLaMarca, ownerDeOtraMarca } from '../test/prisma-mock'
import { ClasificacionesService } from './clasificaciones.service'

const VEGANO = { id: 'clas-1', nombre: 'Vegano' }
const ITEM = { id: 'item-1', restauranteId: 'rest-1' }

describe('ClasificacionesService', () => {
  let prisma: PrismaMock
  let service: ClasificacionesService

  beforeEach(() => {
    prisma = crearPrismaMock()
    service = new ClasificacionesService(comoPrisma(prisma))
  })

  describe('findAll', () => {
    it('con un restaurante que existe devuelve el catálogo ordenado por nombre', async () => {
      // Arrange
      prisma.restaurante.findUnique.mockResolvedValue({ id: 'rest-1' })
      prisma.clasificacionDieta.findMany.mockResolvedValue([VEGANO])

      // Act
      const clasificaciones = await service.findAll('rest-1')

      // Assert
      expect(clasificaciones).toEqual([VEGANO])
      expect(prisma.clasificacionDieta.findMany).toHaveBeenCalledWith({ orderBy: { nombre: 'asc' } })
    })

    it('con un restaurante que no existe responde 404', async () => {
      // Arrange
      prisma.restaurante.findUnique.mockResolvedValue(null)

      // Act
      const listado = service.findAll('no-existe')

      // Assert
      await expect(listado).rejects.toThrow(new NotFoundException('Restaurante no encontrado'))
    })
  })

  describe('create y update', () => {
    it('create guarda el nombre sin espacios alrededor', async () => {
      // Arrange
      prisma.clasificacionDieta.findFirst.mockResolvedValue(null)
      prisma.clasificacionDieta.create.mockResolvedValue(VEGANO)

      // Act
      await service.create('  Vegano  ', OWNER)

      // Assert
      expect(prisma.clasificacionDieta.create).toHaveBeenCalledWith({ data: { nombre: 'Vegano' } })
    })

    it('create con un nombre que ya existe (sin importar mayúsculas) responde 409', async () => {
      // Arrange
      prisma.clasificacionDieta.findFirst.mockResolvedValue(VEGANO)

      // Act
      const alta = service.create('vegano', OWNER)

      // Assert
      await expect(alta).rejects.toThrow(new ConflictException('Ya existe la clasificación "vegano"'))
      expect(prisma.clasificacionDieta.findFirst).toHaveBeenCalledWith({
        where: { nombre: { equals: 'vegano', mode: 'insensitive' } },
      })
      expect(prisma.clasificacionDieta.create).not.toHaveBeenCalled()
    })

    it('update de una clasificación que no existe responde 404', async () => {
      // Arrange
      prisma.clasificacionDieta.findUnique.mockResolvedValue(null)

      // Act
      const cambio = service.update('no-existe', 'Sin TACC', OWNER)

      // Assert
      await expect(cambio).rejects.toThrow(new NotFoundException('Clasificación no encontrada'))
    })

    it('update busca duplicados excluyendo a la propia clasificación y guarda el nombre normalizado', async () => {
      // Arrange
      prisma.clasificacionDieta.findUnique.mockResolvedValue(VEGANO)
      prisma.clasificacionDieta.findFirst.mockResolvedValue(null)
      prisma.clasificacionDieta.update.mockResolvedValue({ ...VEGANO, nombre: 'Vegana' })

      // Act
      await service.update('clas-1', ' Vegana ', OWNER)

      // Assert
      expect(prisma.clasificacionDieta.findFirst).toHaveBeenCalledWith({
        where: { nombre: { equals: 'Vegana', mode: 'insensitive' }, id: { not: 'clas-1' } },
      })
      expect(prisma.clasificacionDieta.update).toHaveBeenCalledWith({ where: { id: 'clas-1' }, data: { nombre: 'Vegana' } })
    })

    it('update con el nombre de otra clasificación responde 409', async () => {
      // Arrange
      prisma.clasificacionDieta.findUnique.mockResolvedValue(VEGANO)
      prisma.clasificacionDieta.findFirst.mockResolvedValue({ id: 'clas-2', nombre: 'Sin TACC' })

      // Act
      const cambio = service.update('clas-1', 'Sin TACC', OWNER)

      // Assert
      await expect(cambio).rejects.toThrow(ConflictException)
      expect(prisma.clasificacionDieta.update).not.toHaveBeenCalled()
    })
  })

  describe('remove', () => {
    it('si está asignada a ítems responde 409 con la cantidad y no la borra', async () => {
      // Arrange
      prisma.clasificacionDieta.findUnique.mockResolvedValue(VEGANO)
      prisma.itemClasificacion.count.mockResolvedValue(3)

      // Act
      const baja = service.remove('clas-1', OWNER)

      // Assert
      await expect(baja).rejects.toThrow(
        'No se puede eliminar: la clasificación está asignada a 3 ítem(s). Desasignala primero.',
      )
      expect(prisma.clasificacionDieta.delete).not.toHaveBeenCalled()
    })

    it('si no está en uso la borra', async () => {
      // Arrange
      prisma.clasificacionDieta.findUnique.mockResolvedValue(VEGANO)
      prisma.itemClasificacion.count.mockResolvedValue(0)

      // Act
      await service.remove('clas-1', OWNER)

      // Assert
      expect(prisma.clasificacionDieta.delete).toHaveBeenCalledWith({ where: { id: 'clas-1' } })
    })
  })

  describe('asignación a ítems', () => {
    it('addToItem asigna la clasificación y devuelve el ítem con sus clasificaciones', async () => {
      // Arrange
      const itemConClasificaciones = { ...ITEM, clasificaciones: [{ clasificacion: VEGANO }] }
      prisma.itemMenu.findUnique.mockResolvedValueOnce(ITEM).mockResolvedValueOnce(itemConClasificaciones)
      ownerDeLaMarca(prisma)
      prisma.clasificacionDieta.findUnique.mockResolvedValue(VEGANO)
      prisma.itemClasificacion.findUnique.mockResolvedValue(null)

      // Act
      const item = await service.addToItem('item-1', 'clas-1', OWNER)

      // Assert
      expect(prisma.itemClasificacion.create).toHaveBeenCalledWith({ data: { itemId: 'item-1', clasificacionId: 'clas-1' } })
      expect(item).toEqual(itemConClasificaciones)
    })

    it('addToItem sobre un ítem que no existe responde 404', async () => {
      // Arrange
      prisma.itemMenu.findUnique.mockResolvedValue(null)

      // Act
      const asignacion = service.addToItem('no-existe', 'clas-1', OWNER)

      // Assert
      await expect(asignacion).rejects.toThrow(new NotFoundException('Ítem no encontrado'))
    })

    it('addToItem sobre un ítem de otra marca responde 403 y no asigna', async () => {
      // Arrange
      prisma.itemMenu.findUnique.mockResolvedValue(ITEM)
      ownerDeOtraMarca(prisma)

      // Act
      const asignacion = service.addToItem('item-1', 'clas-1', OWNER)

      // Assert
      await expect(asignacion).rejects.toThrow(ForbiddenException)
      expect(prisma.itemClasificacion.create).not.toHaveBeenCalled()
    })

    it('addToItem: un GERENTE asignado al restaurante del ítem puede asignar', async () => {
      // Arrange
      prisma.itemMenu.findUnique.mockResolvedValue(ITEM)
      prisma.adminRestaurante.findUnique.mockResolvedValue({ adminId: GERENTE.sub, restauranteId: 'rest-1' })
      prisma.clasificacionDieta.findUnique.mockResolvedValue(VEGANO)
      prisma.itemClasificacion.findUnique.mockResolvedValue(null)

      // Act
      await service.addToItem('item-1', 'clas-1', GERENTE)

      // Assert
      expect(prisma.itemClasificacion.create).toHaveBeenCalledTimes(1)
    })

    it('addToItem: un GERENTE sin asignación al restaurante del ítem recibe 403', async () => {
      // Arrange
      prisma.itemMenu.findUnique.mockResolvedValue(ITEM)
      prisma.adminRestaurante.findUnique.mockResolvedValue(null)

      // Act
      const asignacion = service.addToItem('item-1', 'clas-1', GERENTE)

      // Assert
      await expect(asignacion).rejects.toThrow(ForbiddenException)
      expect(prisma.itemClasificacion.create).not.toHaveBeenCalled()
    })

    it('addToItem: un usuario que no es admin recibe 403', async () => {
      // Arrange
      prisma.itemMenu.findUnique.mockResolvedValue(ITEM)

      // Act
      const asignacion = service.addToItem('item-1', 'clas-1', { sub: 'mozo-1', tipo: 'mozo' })

      // Assert
      await expect(asignacion).rejects.toThrow(ForbiddenException)
    })

    it('addToItem con una clasificación ya asignada responde 409', async () => {
      // Arrange
      prisma.itemMenu.findUnique.mockResolvedValue(ITEM)
      ownerDeLaMarca(prisma)
      prisma.clasificacionDieta.findUnique.mockResolvedValue(VEGANO)
      prisma.itemClasificacion.findUnique.mockResolvedValue({ itemId: 'item-1', clasificacionId: 'clas-1' })

      // Act
      const asignacion = service.addToItem('item-1', 'clas-1', OWNER)

      // Assert
      await expect(asignacion).rejects.toThrow(new ConflictException('Esa clasificación ya está asignada a este ítem'))
      expect(prisma.itemClasificacion.create).not.toHaveBeenCalled()
    })

    it('removeFromItem con una clasificación no asignada responde 404', async () => {
      // Arrange
      prisma.itemMenu.findUnique.mockResolvedValue(ITEM)
      ownerDeLaMarca(prisma)
      prisma.itemClasificacion.findUnique.mockResolvedValue(null)

      // Act
      const baja = service.removeFromItem('item-1', 'clas-1', OWNER)

      // Assert
      await expect(baja).rejects.toThrow(new NotFoundException('Esa clasificación no está asignada a este ítem'))
      expect(prisma.itemClasificacion.delete).not.toHaveBeenCalled()
    })

    it('removeFromItem borra la asignación existente', async () => {
      // Arrange
      prisma.itemMenu.findUnique.mockResolvedValue(ITEM)
      ownerDeLaMarca(prisma)
      prisma.itemClasificacion.findUnique.mockResolvedValue({ itemId: 'item-1', clasificacionId: 'clas-1' })

      // Act
      await service.removeFromItem('item-1', 'clas-1', OWNER)

      // Assert
      expect(prisma.itemClasificacion.delete).toHaveBeenCalledWith({
        where: { itemId_clasificacionId: { itemId: 'item-1', clasificacionId: 'clas-1' } },
      })
    })

    it('removeFromItem sobre un ítem que no existe responde 404', async () => {
      // Arrange
      prisma.itemMenu.findUnique.mockResolvedValue(null)

      // Act
      const baja = service.removeFromItem('no-existe', 'clas-1', OWNER)

      // Assert
      await expect(baja).rejects.toThrow(NotFoundException)
    })
  })
})
