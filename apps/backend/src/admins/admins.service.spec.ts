import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import { GERENTE, OWNER, PrismaMock, comoPrisma, crearPrismaMock } from '../test/prisma-mock'
import { ROOT_USER as ROOT } from '../test/root-mock'
import { AdminsService } from './admins.service'

const DTO_ALTA = { email: 'gerente@menyu.test', nombre: 'Gerente Palermo', password: 'clave-segura' }
const ADMIN_OWNER = { id: OWNER.sub, marcaId: 'marca-1' }
const GERENTE_DE_LA_MARCA = { id: 'admin-g1', email: 'g1@menyu.test', rol: 'GERENTE', marcaId: 'marca-1', passwordHash: 'hash-viejo' }

describe('AdminsService', () => {
  let prisma: PrismaMock
  let service: AdminsService

  beforeEach(() => {
    prisma = crearPrismaMock()
    service = new AdminsService(comoPrisma(prisma))
  })

  describe('create', () => {
    it('un OWNER crea un GERENTE de su marca, con la contraseña hasheada, y la respuesta no trae el hash', async () => {
      // Arrange
      prisma.admin.findUnique
        .mockResolvedValueOnce(null) // el email está libre
        .mockResolvedValueOnce(ADMIN_OWNER) // la marca del OWNER
      prisma.admin.create.mockImplementation(({ data }) => Promise.resolve({ id: 'admin-nuevo', ...data }))

      // Act
      const creado = await service.create(DTO_ALTA, OWNER)

      // Assert
      const { data } = prisma.admin.create.mock.calls[0][0]
      expect(data).toMatchObject({ email: DTO_ALTA.email, rol: 'GERENTE', marcaId: 'marca-1' })
      expect(await bcrypt.compare(DTO_ALTA.password, data.passwordHash)).toBe(true)
      expect(creado).not.toHaveProperty('passwordHash')
      expect(creado).toMatchObject({ id: 'admin-nuevo', email: DTO_ALTA.email, rol: 'GERENTE' })
    })

    it('un GERENTE no puede crear admins (403)', async () => {
      // Act
      const alta = service.create(DTO_ALTA, GERENTE)

      // Assert
      await expect(alta).rejects.toThrow(new ForbiddenException('Sin permisos para crear admins'))
      expect(prisma.admin.create).not.toHaveBeenCalled()
    })

    it('con un email ya registrado responde 409', async () => {
      // Arrange
      prisma.admin.findUnique.mockResolvedValueOnce({ id: 'otro', email: DTO_ALTA.email })

      // Act
      const alta = service.create(DTO_ALTA, OWNER)

      // Assert
      await expect(alta).rejects.toThrow(new ConflictException('El email ya está registrado'))
      expect(prisma.admin.create).not.toHaveBeenCalled()
    })

    it('un OWNER sin marca asociada recibe 403', async () => {
      // Arrange
      prisma.admin.findUnique
        .mockResolvedValueOnce(null) // email libre
        .mockResolvedValueOnce({ id: OWNER.sub, marcaId: null })

      // Act
      const alta = service.create(DTO_ALTA, OWNER)

      // Assert
      await expect(alta).rejects.toThrow(new ForbiddenException('Tu cuenta no tiene una marca asociada'))
    })
  })

  describe('findAll', () => {
    it('ROOT, que administra los usuarios del sistema, lista los admins de todas las marcas', async () => {
      // Arrange
      prisma.admin.findMany.mockResolvedValue([])

      // Act
      await service.findAll({ sub: 'root-1', tipo: 'admin', rol: 'ROOT' })

      // Assert
      expect(prisma.admin.findMany).toHaveBeenCalledWith({
        select: { id: true, email: true, rol: true, marcaId: true },
        orderBy: { email: 'asc' },
      })
      expect(prisma.admin.findUnique).not.toHaveBeenCalled()
    })

    it('un OWNER ve solo los admins de su marca, sin datos sensibles', async () => {
      // Arrange
      prisma.admin.findUnique.mockResolvedValue(ADMIN_OWNER)
      prisma.admin.findMany.mockResolvedValue([])

      // Act
      await service.findAll(OWNER)

      // Assert
      expect(prisma.admin.findMany).toHaveBeenCalledWith({
        where: { marcaId: 'marca-1' },
        select: { id: true, email: true, rol: true, marcaId: true },
        orderBy: { email: 'asc' },
      })
    })
  })

  describe('update y remove', () => {
    it('update de un admin que no existe responde 404', async () => {
      // Arrange
      prisma.admin.findUnique.mockResolvedValue(null)

      // Act
      const cambio = service.update('no-existe', { email: 'x@menyu.test' }, OWNER)

      // Assert
      await expect(cambio).rejects.toThrow(new NotFoundException('Admin no encontrado'))
    })

    it('un OWNER no puede modificar un admin de otra marca (403)', async () => {
      // Arrange
      prisma.admin.findUnique
        .mockResolvedValueOnce({ ...GERENTE_DE_LA_MARCA, marcaId: 'otra-marca' })
        .mockResolvedValueOnce(ADMIN_OWNER)

      // Act
      const cambio = service.update('admin-g1', { email: 'nuevo@menyu.test' }, OWNER)

      // Assert
      await expect(cambio).rejects.toThrow(new ForbiddenException('No tenés acceso a este admin'))
      expect(prisma.admin.update).not.toHaveBeenCalled()
    })

    it('un OWNER cambia email y contraseña de un admin de su marca; la respuesta no trae el hash', async () => {
      // Arrange
      prisma.admin.findUnique.mockResolvedValueOnce(GERENTE_DE_LA_MARCA).mockResolvedValueOnce(ADMIN_OWNER)
      prisma.admin.update.mockImplementation(({ data }) => Promise.resolve({ ...GERENTE_DE_LA_MARCA, ...data }))

      // Act
      const actualizado = await service.update('admin-g1', { email: 'nuevo@menyu.test', password: 'otra-clave' }, OWNER)

      // Assert
      const { data } = prisma.admin.update.mock.calls[0][0]
      expect(data.email).toBe('nuevo@menyu.test')
      expect(await bcrypt.compare('otra-clave', data.passwordHash)).toBe(true)
      expect(actualizado).not.toHaveProperty('passwordHash')
    })

    it('update sin contraseña no toca el hash', async () => {
      // Arrange
      prisma.admin.findUnique.mockResolvedValueOnce(GERENTE_DE_LA_MARCA).mockResolvedValueOnce(ADMIN_OWNER)
      prisma.admin.update.mockResolvedValue(GERENTE_DE_LA_MARCA)

      // Act
      await service.update('admin-g1', { email: 'nuevo@menyu.test' }, OWNER)

      // Assert
      expect(prisma.admin.update).toHaveBeenCalledWith({ where: { id: 'admin-g1' }, data: { email: 'nuevo@menyu.test' } })
    })

    it('un OWNER borra un admin de su marca', async () => {
      // Arrange
      prisma.admin.findUnique.mockResolvedValueOnce(GERENTE_DE_LA_MARCA).mockResolvedValueOnce(ADMIN_OWNER)

      // Act
      await service.remove('admin-g1', OWNER)

      // Assert
      expect(prisma.admin.delete).toHaveBeenCalledWith({ where: { id: 'admin-g1' } })
    })

    it('un OWNER no puede borrar un admin de otra marca (403)', async () => {
      // Arrange
      prisma.admin.findUnique
        .mockResolvedValueOnce({ ...GERENTE_DE_LA_MARCA, marcaId: 'otra-marca' })
        .mockResolvedValueOnce(ADMIN_OWNER)

      // Act
      const baja = service.remove('admin-g1', OWNER)

      // Assert
      await expect(baja).rejects.toThrow(ForbiddenException)
      expect(prisma.admin.delete).not.toHaveBeenCalled()
    })

    it('remove de un admin que no existe responde 404', async () => {
      // Arrange
      prisma.admin.findUnique.mockResolvedValue(null)

      // Act
      const baja = service.remove('no-existe', OWNER)

      // Assert
      await expect(baja).rejects.toThrow(NotFoundException)
    })

    // Decisión 15 de docs/plan-consola-root.md: las cuentas ROOT no se borran desde la app ni la API (solo el script de cuentas
    // ROOT, que nunca borra la última). Esta ruta vieja las dejaba borrar, sin pasar por el historial de ROOT.
    it('nadie borra una cuenta ROOT por esta ruta: ni otra ROOT ni la propia (403)', async () => {
      // Arrange
      const otraRoot = { id: 'root-2', email: 'bruno@menyu.test', rol: 'ROOT', marcaId: null, passwordHash: 'hash' }
      prisma.admin.findUnique.mockResolvedValue(otraRoot)

      // Act
      const bajaDeOtra = service.remove('root-2', ROOT)
      const bajaPropia = service.remove('root-2', { ...ROOT, sub: 'root-2' })

      // Assert
      await expect(bajaDeOtra).rejects.toThrow(new ForbiddenException('Las cuentas ROOT no se pueden eliminar desde la app'))
      await expect(bajaPropia).rejects.toThrow(ForbiddenException)
      expect(prisma.admin.delete).not.toHaveBeenCalled()
    })

    it('ROOT sigue pudiendo borrar las cuentas que no son ROOT (hasta que la etapa 4 le saque este permiso)', async () => {
      // Arrange
      prisma.admin.findUnique.mockResolvedValue(GERENTE_DE_LA_MARCA)

      // Act
      await service.remove('admin-g1', ROOT)

      // Assert
      expect(prisma.admin.delete).toHaveBeenCalledWith({ where: { id: 'admin-g1' } })
    })
  })
})
