import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { GERENTE, OWNER, PrismaMock, comoPrisma, crearPrismaMock } from '../test/prisma-mock'
import { AdminRestauranteService } from './admin-restaurante.service'

const OWNER_DB = { id: OWNER.sub, rol: 'OWNER', marcaId: 'marca-1' }
const GERENTE_DB = { id: 'gerente-1', rol: 'GERENTE', marcaId: 'marca-1' }
const RESTAURANTE = { id: 'rest-1', activo: true, marcaId: 'marca-1' }

/** prisma.admin.findUnique responde según el id: el gerente destino o el OWNER que opera. */
function adminsEnLaBase(prisma: PrismaMock, destino: object | null = GERENTE_DB, owner: object | null = OWNER_DB) {
  prisma.admin.findUnique.mockImplementation(({ where }) =>
    Promise.resolve(where.id === OWNER.sub ? owner : destino),
  )
}

describe('AdminRestauranteService', () => {
  let prisma: PrismaMock
  let service: AdminRestauranteService

  beforeEach(() => {
    prisma = crearPrismaMock()
    service = new AdminRestauranteService(comoPrisma(prisma))
  })

  describe('asignar', () => {
    it('un OWNER asigna un restaurante activo a un gerente de su marca', async () => {
      // Arrange
      adminsEnLaBase(prisma)
      prisma.restaurante.findUnique.mockResolvedValue(RESTAURANTE)
      prisma.adminRestaurante.findUnique.mockResolvedValue(null)
      prisma.adminRestaurante.create.mockResolvedValue({ adminId: 'gerente-1', restauranteId: 'rest-1' })

      // Act
      const asignacion = await service.asignar('gerente-1', 'rest-1', OWNER)

      // Assert
      expect(asignacion).toEqual({ adminId: 'gerente-1', restauranteId: 'rest-1' })
      expect(prisma.adminRestaurante.create).toHaveBeenCalledWith({ data: { adminId: 'gerente-1', restauranteId: 'rest-1' } })
    })

    it('un OWNER no puede asignar restaurantes a un gerente de otra marca (403)', async () => {
      // Arrange
      adminsEnLaBase(prisma, { ...GERENTE_DB, marcaId: 'otra-marca' })

      // Act
      const asignacion = service.asignar('gerente-1', 'rest-1', OWNER)

      // Assert
      await expect(asignacion).rejects.toThrow(new ForbiddenException('No tenés acceso a este admin'))
      expect(prisma.adminRestaurante.create).not.toHaveBeenCalled()
    })

    it('solo se asignan restaurantes a gerentes: a un OWNER responde 403', async () => {
      // Arrange
      adminsEnLaBase(prisma, { ...GERENTE_DB, rol: 'OWNER' })

      // Act
      const asignacion = service.asignar('gerente-1', 'rest-1', OWNER)

      // Assert
      await expect(asignacion).rejects.toThrow(new ForbiddenException('Solo se puede asignar restaurantes a gerentes'))
    })

    it('un admin destino que no existe responde 404', async () => {
      // Arrange
      adminsEnLaBase(prisma, null)

      // Act
      const asignacion = service.asignar('no-existe', 'rest-1', OWNER)

      // Assert
      await expect(asignacion).rejects.toThrow(new NotFoundException('Admin no encontrado'))
    })

    it.each([
      ['no existe', null],
      ['está inactivo', { ...RESTAURANTE, activo: false }],
    ])('si el restaurante %s responde 404', async (_caso, restaurante) => {
      // Arrange
      adminsEnLaBase(prisma)
      prisma.restaurante.findUnique.mockResolvedValue(restaurante)

      // Act
      const asignacion = service.asignar('gerente-1', 'rest-1', OWNER)

      // Assert
      await expect(asignacion).rejects.toThrow(new NotFoundException('Restaurante no encontrado'))
    })

    it('si el gerente ya tenía ese restaurante responde 409', async () => {
      // Arrange
      adminsEnLaBase(prisma)
      prisma.restaurante.findUnique.mockResolvedValue(RESTAURANTE)
      prisma.adminRestaurante.findUnique.mockResolvedValue({ adminId: 'gerente-1', restauranteId: 'rest-1' })

      // Act
      const asignacion = service.asignar('gerente-1', 'rest-1', OWNER)

      // Assert
      await expect(asignacion).rejects.toThrow(new ConflictException('Este gerente ya tiene acceso a ese restaurante'))
      expect(prisma.adminRestaurante.create).not.toHaveBeenCalled()
    })

    it('un GERENTE no puede gestionar asignaciones (403)', async () => {
      // Arrange
      adminsEnLaBase(prisma)

      // Act
      const asignacion = service.asignar('gerente-1', 'rest-1', GERENTE)

      // Assert
      await expect(asignacion).rejects.toThrow(new ForbiddenException('No tenés permiso para esta operación'))
    })
  })

  describe('desasignar y findByAdmin', () => {
    it('desasignar borra la asignación existente', async () => {
      // Arrange
      adminsEnLaBase(prisma)
      prisma.adminRestaurante.findUnique.mockResolvedValue({ adminId: 'gerente-1', restauranteId: 'rest-1' })

      // Act
      await service.desasignar('gerente-1', 'rest-1', OWNER)

      // Assert
      expect(prisma.adminRestaurante.delete).toHaveBeenCalledWith({
        where: { adminId_restauranteId: { adminId: 'gerente-1', restauranteId: 'rest-1' } },
      })
    })

    it('desasignar una asignación que no existe responde 404', async () => {
      // Arrange
      adminsEnLaBase(prisma)
      prisma.adminRestaurante.findUnique.mockResolvedValue(null)

      // Act
      const baja = service.desasignar('gerente-1', 'rest-1', OWNER)

      // Assert
      await expect(baja).rejects.toThrow(new NotFoundException('Asignación no encontrada'))
      expect(prisma.adminRestaurante.delete).not.toHaveBeenCalled()
    })

    it('findByAdmin lista los restaurantes asignados al gerente', async () => {
      // Arrange
      adminsEnLaBase(prisma)
      prisma.adminRestaurante.findMany.mockResolvedValue([{ restaurante: { id: 'rest-1', nombre: 'Palermo', activo: true } }])

      // Act
      const asignaciones = await service.findByAdmin('gerente-1', OWNER)

      // Assert
      expect(asignaciones).toHaveLength(1)
      expect(prisma.adminRestaurante.findMany.mock.calls[0][0].where).toEqual({ adminId: 'gerente-1' })
    })
  })

  describe('findGerentesByMarca', () => {
    it('un OWNER de la marca lista sus gerentes con sus restaurantes', async () => {
      // Arrange
      adminsEnLaBase(prisma)
      prisma.admin.findMany.mockResolvedValue([{ id: 'gerente-1', email: 'g@menyu.test', rol: 'GERENTE', restaurantes: [] }])

      // Act
      const gerentes = await service.findGerentesByMarca('marca-1', OWNER)

      // Assert
      expect(gerentes).toHaveLength(1)
      expect(prisma.admin.findMany.mock.calls[0][0].where).toEqual({ marcaId: 'marca-1', rol: 'GERENTE' })
    })

    it('un OWNER de otra marca recibe 403', async () => {
      // Arrange
      adminsEnLaBase(prisma, GERENTE_DB, { ...OWNER_DB, marcaId: 'otra-marca' })

      // Act
      const listado = service.findGerentesByMarca('marca-1', OWNER)

      // Assert
      await expect(listado).rejects.toThrow(new ForbiddenException('No tenés acceso a esta marca'))
      expect(prisma.admin.findMany).not.toHaveBeenCalled()
    })
  })
})
