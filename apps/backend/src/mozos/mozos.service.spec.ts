import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { accesoDeTest, CUENTAS, MUNDO } from '../test/acceso-de-test'
import { PrismaMock, comoPrisma, crearPrismaMock } from '../test/prisma-mock'
import { MOZO_SELECT, MozosService } from './mozos.service'

const REST = MUNDO.REST_1
const OWNER = CUENTAS.OWNER_A
const GERENTE = CUENTAS.GERENTE
const MOZO = { id: 'mozo-1', nombre: 'Juan', restauranteId: REST, activo: true, usuarioId: null as string | null }

describe('MozosService', () => {
  let prisma: PrismaMock
  let service: MozosService

  beforeEach(() => {
    prisma = crearPrismaMock()
    service = new MozosService(comoPrisma(prisma), accesoDeTest())
  })

  it('ninguna respuesta trae la contraseña del login propio', () => {
    expect(MOZO_SELECT).not.toHaveProperty('passwordHash')
  })

  describe('permisos de las rutas de un mozo (el rol en el restaurante del mozo)', () => {
    const RUTAS: Array<[string, (u: UsuarioAutenticado) => Promise<unknown>]> = [
      ['findOne', (u) => service.findOne('mozo-1', u)],
      ['assignMesa', (u) => service.assignMesa('mozo-1', 'mesa-1', u)],
      ['unassignMesa', (u) => service.unassignMesa('mozo-1', 'mesa-1', u)],
      ['getMesas', (u) => service.getMesas('mozo-1', u)],
      ['llamadosHoy', (u) => service.llamadosHoy('mozo-1', u)],
    ]

    beforeEach(() => {
      prisma.mozo.findUnique.mockResolvedValue(MOZO)
      prisma.mesa.findUnique.mockResolvedValue({ id: 'mesa-1', restauranteId: REST })
      prisma.mozoMesa.findUnique.mockResolvedValue({ mozoId: 'mozo-1', mesaId: 'mesa-1' })
      prisma.mozoMesa.findMany.mockResolvedValue([])
      prisma.llamadoMozo.count.mockResolvedValue(0)
    })

    it.each(RUTAS)('%s: el OWNER de la marca y el GERENTE del restaurante pasan', async (_ruta, llamar) => {
      await llamar(OWNER)
      await llamar(GERENTE)
    })

    it.each(RUTAS)('%s: ROOT, el OWNER de otra marca y el salón reciben 403', async (_ruta, llamar) => {
      for (const cuenta of [CUENTAS.ROOT, CUENTAS.OWNER_B, CUENTAS.JEFE_SALON, CUENTAS.MOZO]) {
        await expect(llamar(cuenta)).rejects.toThrow(ForbiddenException)
      }
      expect(prisma.mozoMesa.create).not.toHaveBeenCalled()
      expect(prisma.mozoMesa.delete).not.toHaveBeenCalled()
    })

    it('el GERENTE de otro restaurante de la marca recibe 403', async () => {
      prisma.mozo.findUnique.mockResolvedValue({ ...MOZO, restauranteId: MUNDO.REST_2 })

      await expect(service.getMesas('mozo-1', GERENTE)).rejects.toThrow(ForbiddenException)
    })

    it('un mozo que no existe responde 404', async () => {
      prisma.mozo.findUnique.mockResolvedValue(null)

      await expect(service.findOne('no-existe', OWNER)).rejects.toThrow(new NotFoundException('Mozo no encontrado'))
    })
  })

  describe('findAll (el rol lo exige la ruta)', () => {
    it('lista solo los mozos activos del restaurante, por nombre, sin exponer el hash de la contraseña', async () => {
      // Arrange
      prisma.mozo.findMany.mockResolvedValue([MOZO])

      // Act
      await service.findAll(REST)

      // Assert
      const consulta = prisma.mozo.findMany.mock.calls[0][0]
      expect(consulta.where).toEqual({ restauranteId: REST, activo: true })
      expect(consulta.orderBy).toEqual({ nombre: 'asc' })
      expect(consulta.select).not.toHaveProperty('passwordHash')
    })
  })

  describe('findOne', () => {
    it('devuelve el mozo pedido con el select sin la contraseña', async () => {
      // Arrange
      prisma.mozo.findUnique.mockResolvedValue(MOZO)

      // Act
      const mozo = await service.findOne('mozo-1', GERENTE)

      // Assert
      expect(mozo).toEqual(MOZO)
      expect(prisma.mozo.findUnique).toHaveBeenCalledWith({ where: { id: 'mozo-1' }, select: MOZO_SELECT })
    })
  })

  describe('update (solo el OWNER)', () => {
    beforeEach(() => {
      prisma.mozo.findUnique.mockResolvedValue(MOZO)
      prisma.mozo.update.mockResolvedValue(MOZO)
    })

    it('el OWNER cambia el nombre y el teléfono', async () => {
      // Act
      await service.update('mozo-1', { nombre: 'Juan Pablo', telefono: '123' }, OWNER)

      // Assert
      expect(prisma.mozo.update).toHaveBeenCalledWith({
        where: { id: 'mozo-1' },
        data: { nombre: 'Juan Pablo', telefono: '123' },
        select: MOZO_SELECT,
      })
    })

    it.each([
      ['el GERENTE', GERENTE],
      ['ROOT', CUENTAS.ROOT],
    ])('%s recibe 403 y no se toca nada', async (_caso, cuenta) => {
      // Act + Assert
      await expect(service.update('mozo-1', { nombre: 'Otro' }, cuenta)).rejects.toThrow(ForbiddenException)
      expect(prisma.mozo.update).not.toHaveBeenCalled()
    })
  })

  describe('remove (solo el OWNER y solo un mozo sin cuenta)', () => {
    it('da de baja (activo: false) a un mozo del login propio', async () => {
      // Arrange
      prisma.mozo.findUnique.mockResolvedValue(MOZO)

      // Act
      await service.remove('mozo-1', OWNER)

      // Assert
      expect(prisma.mozo.update).toHaveBeenCalledWith({ where: { id: 'mozo-1' }, data: { activo: false } })
      expect(prisma.mozo.delete).not.toHaveBeenCalled()
    })

    it('un mozo con cuenta de Supabase responde 409: el acceso se quita desde Personal', async () => {
      // Arrange
      prisma.mozo.findUnique.mockResolvedValue({ ...MOZO, usuarioId: 'usuario-mozo' })

      // Act + Assert
      await expect(service.remove('mozo-1', OWNER)).rejects.toThrow(
        new ConflictException('Este mozo tiene cuenta: quitale el acceso desde Personal'),
      )
      expect(prisma.mozo.update).not.toHaveBeenCalled()
    })

    it('el GERENTE recibe 403', async () => {
      // Arrange
      prisma.mozo.findUnique.mockResolvedValue(MOZO)

      // Act + Assert
      await expect(service.remove('mozo-1', GERENTE)).rejects.toThrow(ForbiddenException)
      expect(prisma.mozo.update).not.toHaveBeenCalled()
    })
  })

  describe('asignación de mesas', () => {
    beforeEach(() => {
      prisma.mozo.findUnique.mockResolvedValue(MOZO)
    })

    it('asigna una mesa del mismo restaurante', async () => {
      // Arrange
      prisma.mesa.findUnique.mockResolvedValue({ id: 'mesa-1', restauranteId: REST })
      prisma.mozoMesa.create.mockResolvedValue({ mozoId: 'mozo-1', mesaId: 'mesa-1' })

      // Act
      const asignacion = await service.assignMesa('mozo-1', 'mesa-1', GERENTE)

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
      prisma.mesa.findUnique.mockResolvedValue({ id: 'mesa-9', restauranteId: MUNDO.REST_2 })

      // Act
      const asignacion = service.assignMesa('mozo-1', 'mesa-9', OWNER)

      // Assert
      await expect(asignacion).rejects.toThrow(BadRequestException)
      expect(prisma.mozoMesa.create).not.toHaveBeenCalled()
    })

    it('si la mesa ya estaba asignada (falla la clave única) responde 409', async () => {
      // Arrange
      prisma.mesa.findUnique.mockResolvedValue({ id: 'mesa-1', restauranteId: REST })
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
      prisma.llamadoMozo.count.mockResolvedValue(7)

      // Act
      const resultado = await service.llamadosHoy('mozo-1', OWNER)

      // Assert
      expect(resultado).toEqual({ total: 7 })
      expect(prisma.llamadoMozo.count.mock.calls[0][0].where).toMatchObject({ mozoId: 'mozo-1', estado: 'atendido' })
    })
  })
})
