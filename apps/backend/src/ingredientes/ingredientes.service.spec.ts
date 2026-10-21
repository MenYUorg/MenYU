import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { accesoDeTest, CUENTAS, MUNDO } from '../test/acceso-de-test'
import { PrismaMock, comoPrisma, crearPrismaMock } from '../test/prisma-mock'
import { IngredientesService } from './ingredientes.service'

const REST = MUNDO.REST_1
const QUESO = { id: 'ing-1', nombre: 'Queso', restauranteId: REST }

describe('IngredientesService', () => {
  let prisma: PrismaMock
  let service: IngredientesService

  beforeEach(() => {
    prisma = crearPrismaMock()
    service = new IngredientesService(comoPrisma(prisma), accesoDeTest())
  })

  describe('create', () => {
    it('crea el ingrediente si el nombre no se repite en el restaurante', async () => {
      // Arrange
      prisma.ingrediente.findFirst.mockResolvedValue(null)
      prisma.ingrediente.create.mockResolvedValue(QUESO)

      // Act
      const ingrediente = await service.create({ nombre: 'Queso', restauranteId: REST })

      // Assert
      expect(ingrediente).toEqual(QUESO)
      expect(prisma.ingrediente.findFirst).toHaveBeenCalledWith({
        where: { restauranteId: REST, nombre: { equals: 'Queso', mode: 'insensitive' } },
      })
    })

    it('con un nombre repetido (sin importar mayúsculas) responde 409', async () => {
      // Arrange
      prisma.ingrediente.findFirst.mockResolvedValue(QUESO)

      // Act
      const alta = service.create({ nombre: 'QUESO', restauranteId: REST })

      // Assert
      await expect(alta).rejects.toThrow(new ConflictException('Ya existe un ingrediente con el nombre "QUESO"'))
      expect(prisma.ingrediente.create).not.toHaveBeenCalled()
    })
  })

  describe('findAll y findOne', () => {
    it('findAll lista los ingredientes del restaurante por nombre', async () => {
      // Arrange
      prisma.ingrediente.findMany.mockResolvedValue([QUESO])

      // Act
      const ingredientes = await service.findAll(REST)

      // Assert
      expect(ingredientes).toEqual([QUESO])
      expect(prisma.ingrediente.findMany).toHaveBeenCalledWith({ where: { restauranteId: REST }, orderBy: { nombre: 'asc' } })
    })

    it('findOne de un ingrediente que no existe responde 404', async () => {
      // Arrange
      prisma.ingrediente.findUnique.mockResolvedValue(null)

      // Act
      const busqueda = service.findOne('no-existe', CUENTAS.OWNER_A)

      // Assert
      await expect(busqueda).rejects.toThrow(new NotFoundException('Ingrediente no encontrado'))
    })

    it.each([
      ['el OWNER de la marca', CUENTAS.OWNER_A],
      ['el GERENTE del restaurante', CUENTAS.GERENTE],
    ])('findOne devuelve el ingrediente a %s', async (_caso, cuenta) => {
      // Arrange
      prisma.ingrediente.findUnique.mockResolvedValue(QUESO)

      // Act + Assert
      expect(await service.findOne('ing-1', cuenta)).toEqual(QUESO)
    })

    it.each([
      ['ROOT (no es un bypass)', CUENTAS.ROOT],
      ['el OWNER de otra marca', CUENTAS.OWNER_B],
      ['el MOZO', CUENTAS.MOZO],
      ['la COCINA', CUENTAS.COCINA],
    ])('findOne: %s recibe 403', async (_caso, cuenta) => {
      // Arrange
      prisma.ingrediente.findUnique.mockResolvedValue(QUESO)

      // Act + Assert
      await expect(service.findOne('ing-1', cuenta)).rejects.toThrow(ForbiddenException)
    })
  })

  describe('update', () => {
    beforeEach(() => {
      prisma.ingrediente.findUnique.mockResolvedValue(QUESO)
    })

    it('al renombrar busca duplicados excluyendo al propio ingrediente', async () => {
      // Arrange
      prisma.ingrediente.findFirst.mockResolvedValue(null)
      prisma.ingrediente.update.mockResolvedValue({ ...QUESO, nombre: 'Queso azul' })

      // Act
      await service.update('ing-1', { nombre: 'Queso azul' }, CUENTAS.OWNER_A)

      // Assert
      expect(prisma.ingrediente.findFirst).toHaveBeenCalledWith({
        where: { restauranteId: REST, nombre: { equals: 'Queso azul', mode: 'insensitive' }, id: { not: 'ing-1' } },
      })
      expect(prisma.ingrediente.update).toHaveBeenCalledWith({ where: { id: 'ing-1' }, data: { nombre: 'Queso azul' } })
    })

    it('si el nombre nuevo ya existe responde 409 y no actualiza', async () => {
      // Arrange
      prisma.ingrediente.findFirst.mockResolvedValue({ id: 'ing-2', nombre: 'Tomate' })

      // Act
      const cambio = service.update('ing-1', { nombre: 'Tomate' }, CUENTAS.OWNER_A)

      // Assert
      await expect(cambio).rejects.toThrow(ConflictException)
      expect(prisma.ingrediente.update).not.toHaveBeenCalled()
    })

    it('con el mismo nombre no busca duplicados', async () => {
      // Arrange
      prisma.ingrediente.update.mockResolvedValue(QUESO)

      // Act
      await service.update('ing-1', { nombre: 'Queso' }, CUENTAS.GERENTE)

      // Assert
      expect(prisma.ingrediente.findFirst).not.toHaveBeenCalled()
    })

    it('ROOT recibe 403 y no actualiza', async () => {
      // Act + Assert
      await expect(service.update('ing-1', { nombre: 'Otro' }, CUENTAS.ROOT)).rejects.toThrow(ForbiddenException)
      expect(prisma.ingrediente.update).not.toHaveBeenCalled()
    })
  })

  describe('remove', () => {
    beforeEach(() => {
      prisma.ingrediente.findUnique.mockResolvedValue(QUESO)
    })

    it('si está en ítems del menú responde 409 con la cantidad y no lo borra', async () => {
      // Arrange
      prisma.itemIngrediente.count.mockResolvedValue(2)

      // Act
      const baja = service.remove('ing-1', CUENTAS.OWNER_A)

      // Assert
      await expect(baja).rejects.toThrow('No se puede eliminar: el ingrediente está asociado a 2 ítem(s) del menú')
      expect(prisma.ingrediente.delete).not.toHaveBeenCalled()
    })

    it('si no está en uso, el GERENTE lo borra', async () => {
      // Arrange
      prisma.itemIngrediente.count.mockResolvedValue(0)

      // Act
      await service.remove('ing-1', CUENTAS.GERENTE)

      // Assert
      expect(prisma.ingrediente.delete).toHaveBeenCalledWith({ where: { id: 'ing-1' } })
    })

    it('el GERENTE de otro restaurante recibe 403', async () => {
      // Arrange
      prisma.ingrediente.findUnique.mockResolvedValue({ ...QUESO, restauranteId: MUNDO.REST_2 })

      // Act
      const baja = service.remove('ing-1', CUENTAS.GERENTE)

      // Assert
      await expect(baja).rejects.toThrow(ForbiddenException)
      expect(prisma.ingrediente.delete).not.toHaveBeenCalled()
    })
  })
})
