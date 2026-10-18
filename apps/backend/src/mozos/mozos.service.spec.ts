import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import { JwtPayload } from '../auth/auth.service'
import {
  GERENTE,
  OWNER,
  PrismaMock,
  comoPrisma,
  crearPrismaMock,
  ownerDeLaMarca,
  ownerDeOtraMarca,
} from '../test/prisma-mock'
import { MozosService } from './mozos.service'

const MOZO = { id: 'mozo-1', nombre: 'Juan', restauranteId: 'rest-1', activo: true }
const DTO_ALTA = { nombre: 'Juan', email: 'juan@menyu.test', password: 'secreta123', restauranteId: 'rest-1' }

describe('MozosService', () => {
  let prisma: PrismaMock
  let service: MozosService

  beforeEach(() => {
    prisma = crearPrismaMock()
    service = new MozosService(comoPrisma(prisma))
  })

  describe('permisos sobre el restaurante', () => {
    it('un OWNER de otra marca recibe 403 y no se crea el mozo', async () => {
      // Arrange
      ownerDeOtraMarca(prisma)

      // Act
      const alta = service.create(DTO_ALTA, OWNER)

      // Assert
      await expect(alta).rejects.toThrow(ForbiddenException)
      expect(prisma.mozo.create).not.toHaveBeenCalled()
    })

    it('un GERENTE asignado al restaurante puede listar sus mozos', async () => {
      // Arrange
      prisma.adminRestaurante.findUnique.mockResolvedValue({ adminId: GERENTE.sub, restauranteId: 'rest-1' })
      prisma.mozo.findMany.mockResolvedValue([MOZO])

      // Act
      const mozos = await service.findAll('rest-1', GERENTE)

      // Assert
      expect(mozos).toEqual([MOZO])
      expect(prisma.adminRestaurante.findUnique).toHaveBeenCalledWith({
        where: { adminId_restauranteId: { adminId: GERENTE.sub, restauranteId: 'rest-1' } },
      })
    })

    it('un GERENTE sin asignación recibe 403', async () => {
      // Arrange
      prisma.adminRestaurante.findUnique.mockResolvedValue(null)

      // Act
      const listado = service.findAll('rest-1', GERENTE)

      // Assert
      await expect(listado).rejects.toThrow('No tenés acceso a este restaurante')
      expect(prisma.mozo.findMany).not.toHaveBeenCalled()
    })

    it('un usuario que no es admin (un mozo) recibe 403', async () => {
      // Arrange
      const mozo: JwtPayload = { sub: 'mozo-9', tipo: 'mozo', restauranteId: 'rest-1' }

      // Act
      const listado = service.findAll('rest-1', mozo)

      // Assert
      await expect(listado).rejects.toThrow(ForbiddenException)
    })
  })

  describe('create', () => {
    it('guarda el hash bcrypt de la contraseña y nunca la contraseña en claro', async () => {
      // Arrange
      ownerDeLaMarca(prisma)
      prisma.mozo.findFirst.mockResolvedValue(null)
      prisma.mozo.create.mockImplementation(({ data }) => Promise.resolve({ id: 'mozo-nuevo', ...data }))

      // Act
      await service.create(DTO_ALTA, OWNER)

      // Assert
      const { data } = prisma.mozo.create.mock.calls[0][0]
      expect(data).not.toHaveProperty('password')
      expect(data.passwordHash).not.toBe(DTO_ALTA.password)
      expect(await bcrypt.compare(DTO_ALTA.password, data.passwordHash)).toBe(true)
      expect(data).toMatchObject({ nombre: 'Juan', email: 'juan@menyu.test', restauranteId: 'rest-1' })
    })

    it('si ya existe un mozo con ese email responde 409 y no lo crea', async () => {
      // Arrange
      ownerDeLaMarca(prisma)
      prisma.mozo.findFirst.mockResolvedValue({ id: 'otro-mozo' })

      // Act
      const alta = service.create(DTO_ALTA, OWNER)

      // Assert
      await expect(alta).rejects.toThrow(new ConflictException('Ya existe un mozo con ese email'))
      expect(prisma.mozo.create).not.toHaveBeenCalled()
    })

    it('sin email no busca duplicados y crea el mozo', async () => {
      // Arrange
      ownerDeLaMarca(prisma)
      const { email: _, ...sinEmail } = DTO_ALTA
      prisma.mozo.create.mockResolvedValue({ id: 'mozo-nuevo' })

      // Act
      await service.create(sinEmail, OWNER)

      // Assert
      expect(prisma.mozo.findFirst).not.toHaveBeenCalled()
      expect(prisma.mozo.create).toHaveBeenCalledTimes(1)
    })
  })

  describe('findAll', () => {
    it('lista solo los mozos activos del restaurante, por nombre, sin exponer el hash de la contraseña', async () => {
      // Arrange
      ownerDeLaMarca(prisma)
      prisma.mozo.findMany.mockResolvedValue([MOZO])

      // Act
      await service.findAll('rest-1', OWNER)

      // Assert
      const consulta = prisma.mozo.findMany.mock.calls[0][0]
      expect(consulta.where).toEqual({ restauranteId: 'rest-1', activo: true })
      expect(consulta.orderBy).toEqual({ nombre: 'asc' })
      expect(consulta.select).not.toHaveProperty('passwordHash')
    })
  })

  describe('findOne, update y remove', () => {
    it('findOne de un mozo que no existe responde 404', async () => {
      // Arrange
      prisma.mozo.findUnique.mockResolvedValue(null)

      // Act
      const busqueda = service.findOne('no-existe', OWNER)

      // Assert
      await expect(busqueda).rejects.toThrow(new NotFoundException('Mozo no encontrado'))
    })

    it('findOne devuelve el mozo si el OWNER es de su marca', async () => {
      // Arrange
      prisma.mozo.findUnique.mockResolvedValue(MOZO)
      ownerDeLaMarca(prisma)

      // Act
      const mozo = await service.findOne('mozo-1', OWNER)

      // Assert
      expect(mozo).toEqual(MOZO)
    })

    it('update con contraseña nueva guarda su hash y no la contraseña en claro', async () => {
      // Arrange
      prisma.mozo.findUnique.mockResolvedValue(MOZO)
      ownerDeLaMarca(prisma)
      prisma.mozo.update.mockResolvedValue(MOZO)

      // Act
      await service.update('mozo-1', { nombre: 'Juan Pablo', password: 'nueva456' }, OWNER)

      // Assert
      const { where, data } = prisma.mozo.update.mock.calls[0][0]
      expect(where).toEqual({ id: 'mozo-1' })
      expect(data.nombre).toBe('Juan Pablo')
      expect(data).not.toHaveProperty('password')
      expect(await bcrypt.compare('nueva456', data.passwordHash)).toBe(true)
    })

    it('update sin contraseña no toca el hash', async () => {
      // Arrange
      prisma.mozo.findUnique.mockResolvedValue(MOZO)
      ownerDeLaMarca(prisma)
      prisma.mozo.update.mockResolvedValue(MOZO)

      // Act
      await service.update('mozo-1', { esJefeSalon: true }, OWNER)

      // Assert
      expect(prisma.mozo.update).toHaveBeenCalledWith({ where: { id: 'mozo-1' }, data: { esJefeSalon: true } })
    })

    it('remove es una baja lógica: marca al mozo como inactivo', async () => {
      // Arrange
      prisma.mozo.findUnique.mockResolvedValue(MOZO)
      ownerDeLaMarca(prisma)

      // Act
      await service.remove('mozo-1', OWNER)

      // Assert
      expect(prisma.mozo.update).toHaveBeenCalledWith({ where: { id: 'mozo-1' }, data: { activo: false } })
      expect(prisma.mozo.delete).not.toHaveBeenCalled()
    })
  })

  describe('asignación de mesas', () => {
    beforeEach(() => {
      prisma.mozo.findUnique.mockResolvedValue(MOZO)
      ownerDeLaMarca(prisma)
    })

    it('asigna una mesa del mismo restaurante', async () => {
      // Arrange
      prisma.mesa.findUnique.mockResolvedValue({ id: 'mesa-1', restauranteId: 'rest-1' })
      prisma.mozoMesa.create.mockResolvedValue({ mozoId: 'mozo-1', mesaId: 'mesa-1' })

      // Act
      const asignacion = await service.assignMesa('mozo-1', 'mesa-1', OWNER)

      // Assert
      expect(asignacion).toEqual({ mozoId: 'mozo-1', mesaId: 'mesa-1' })
      expect(prisma.mozoMesa.create).toHaveBeenCalledWith({ data: { mozoId: 'mozo-1', mesaId: 'mesa-1' } })
    })

    it('una mesa que no existe responde 404', async () => {
      // Arrange
      prisma.mesa.findUnique.mockResolvedValue(null)

      // Act
      const asignacion = service.assignMesa('mozo-1', 'no-existe', OWNER)

      // Assert
      await expect(asignacion).rejects.toThrow(new NotFoundException('Mesa no encontrada'))
    })

    it('una mesa de otro restaurante responde 400 y no se asigna', async () => {
      // Arrange
      prisma.mesa.findUnique.mockResolvedValue({ id: 'mesa-9', restauranteId: 'otro-rest' })

      // Act
      const asignacion = service.assignMesa('mozo-1', 'mesa-9', OWNER)

      // Assert
      await expect(asignacion).rejects.toThrow(BadRequestException)
      expect(prisma.mozoMesa.create).not.toHaveBeenCalled()
    })

    it('si la mesa ya estaba asignada (falla la clave única) responde 409', async () => {
      // Arrange
      prisma.mesa.findUnique.mockResolvedValue({ id: 'mesa-1', restauranteId: 'rest-1' })
      prisma.mozoMesa.create.mockRejectedValue(new Error('Unique constraint failed'))

      // Act
      const asignacion = service.assignMesa('mozo-1', 'mesa-1', OWNER)

      // Assert
      await expect(asignacion).rejects.toThrow(new ConflictException('El mozo ya tiene asignada esa mesa'))
    })

    it('desasignar una mesa que no estaba asignada responde 404 y no borra nada', async () => {
      // Arrange
      prisma.mozoMesa.findUnique.mockResolvedValue(null)

      // Act
      const baja = service.unassignMesa('mozo-1', 'mesa-1', OWNER)

      // Assert
      await expect(baja).rejects.toThrow(new NotFoundException('Asignación no encontrada'))
      expect(prisma.mozoMesa.delete).not.toHaveBeenCalled()
    })

    it('desasignar una mesa asignada borra esa asignación', async () => {
      // Arrange
      prisma.mozoMesa.findUnique.mockResolvedValue({ mozoId: 'mozo-1', mesaId: 'mesa-1' })

      // Act
      await service.unassignMesa('mozo-1', 'mesa-1', OWNER)

      // Assert
      expect(prisma.mozoMesa.delete).toHaveBeenCalledWith({
        where: { mesaId_mozoId: { mesaId: 'mesa-1', mozoId: 'mozo-1' } },
      })
    })

    it('getMesas devuelve solo los datos de las mesas asignadas', async () => {
      // Arrange
      const mesa1 = { id: 'mesa-1', numero: '1', estado: 'libre', activo: true }
      const mesa2 = { id: 'mesa-2', numero: '2', estado: 'ocupada', activo: true }
      prisma.mozoMesa.findMany.mockResolvedValue([
        { mozoId: 'mozo-1', mesaId: 'mesa-1', mesa: mesa1 },
        { mozoId: 'mozo-1', mesaId: 'mesa-2', mesa: mesa2 },
      ])

      // Act
      const mesas = await service.getMesas('mozo-1', OWNER)

      // Assert
      expect(mesas).toEqual([mesa1, mesa2])
    })
  })

  describe('llamadosHoy', () => {
    it('cuenta solo los llamados atendidos por ese mozo y devuelve { total }', async () => {
      // Arrange
      prisma.mozo.findUnique.mockResolvedValue(MOZO)
      ownerDeLaMarca(prisma)
      prisma.llamadoMozo.count.mockResolvedValue(7)

      // Act
      const resultado = await service.llamadosHoy('mozo-1', OWNER)

      // Assert
      expect(resultado).toEqual({ total: 7 })
      expect(prisma.llamadoMozo.count.mock.calls[0][0].where).toMatchObject({ mozoId: 'mozo-1', estado: 'atendido' })
    })
  })
})
