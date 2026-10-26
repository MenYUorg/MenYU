import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { Rol } from '@prisma/client'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { accesoDeTest, CUENTAS, MUNDO } from '../test/acceso-de-test'
import { comoPrisma, crearPrismaMock, PrismaMock } from '../test/prisma-mock'
import { PersonalService } from './personal.service'

const REST = MUNDO.REST_1

describe('PersonalService', () => {
  let prisma: PrismaMock
  let service: PersonalService

  beforeEach(() => {
    prisma = crearPrismaMock()
    service = new PersonalService(comoPrisma(prisma), accesoDeTest())
  })

  describe('listar', () => {
    const fila = (id: string, rol: Rol, nombre: string) => ({ id, rol, usuario: { id: `u-${id}`, nombre, email: `${nombre}@menyu.test` } })

    it('devuelve los dueños de la marca, las membresías del restaurante y los mozos sin cuenta', async () => {
      // Arrange
      prisma.restaurante.findUnique.mockResolvedValue({ marcaId: MUNDO.MARCA_A })
      prisma.membresia.findMany
        .mockResolvedValueOnce([fila('m-owner', 'OWNER', 'Olga')])
        .mockResolvedValueOnce([fila('m-ger', 'GERENTE', 'Gabi'), fila('m-mozo', 'MOZO', 'Mario')])
      prisma.mozo.findMany.mockResolvedValue([{ id: 'mozo-viejo', nombre: 'Juan', email: 'juan@x.com', esJefeSalon: false }])

      // Act
      const personal = await service.listar(REST)

      // Assert
      expect(personal).toEqual({
        duenos: [{ membresiaId: 'm-owner', usuarioId: 'u-m-owner', nombre: 'Olga', email: 'Olga@menyu.test', rol: 'OWNER' }],
        miembros: [
          { membresiaId: 'm-ger', usuarioId: 'u-m-ger', nombre: 'Gabi', email: 'Gabi@menyu.test', rol: 'GERENTE' },
          { membresiaId: 'm-mozo', usuarioId: 'u-m-mozo', nombre: 'Mario', email: 'Mario@menyu.test', rol: 'MOZO' },
        ],
        sinCuenta: [{ mozoId: 'mozo-viejo', nombre: 'Juan', email: 'juan@x.com', esJefeSalon: false }],
      })
      expect(prisma.membresia.findMany.mock.calls[0][0].where).toEqual({ marcaId: MUNDO.MARCA_A, rol: 'OWNER' })
      expect(prisma.membresia.findMany.mock.calls[1][0].where).toEqual({ restauranteId: REST })
      expect(prisma.mozo.findMany.mock.calls[0][0].where).toEqual({ restauranteId: REST, usuarioId: null, activo: true })
    })

    it('no expone más que el nombre y el email de cada cuenta', async () => {
      // Arrange
      prisma.restaurante.findUnique.mockResolvedValue({ marcaId: MUNDO.MARCA_A })
      prisma.membresia.findMany.mockResolvedValue([])
      prisma.mozo.findMany.mockResolvedValue([])

      // Act
      await service.listar(REST)

      // Assert
      expect(prisma.membresia.findMany.mock.calls[0][0].select.usuario).toEqual({ select: { id: true, nombre: true, email: true } })
    })

    it('con un restaurante que no existe: 404', async () => {
      // Arrange
      prisma.restaurante.findUnique.mockResolvedValue(null)

      // Act + Assert
      await expect(service.listar(REST)).rejects.toThrow(NotFoundException)
    })
  })

  describe('quitarAcceso', () => {
    const membresia = (rol: Rol, usuarioId = 'u-otro', restauranteId: string | null = REST) => ({ id: 'm-1', rol, usuarioId, restauranteId })

    // Quién le puede quitar el acceso a quién: la misma matriz que invitar (puede-invitar.ts).
    it.each<[string, UsuarioAutenticado, Rol, boolean]>([
      ['el OWNER a un GERENTE', CUENTAS.OWNER_A, 'GERENTE', true],
      ['el OWNER a un JEFE_SALON', CUENTAS.OWNER_A, 'JEFE_SALON', true],
      ['el OWNER a la COCINA', CUENTAS.OWNER_A, 'COCINA', true],
      ['el GERENTE a un MOZO', CUENTAS.GERENTE, 'MOZO', true],
      ['el GERENTE a un JEFE_SALON', CUENTAS.GERENTE, 'JEFE_SALON', true],
      ['el GERENTE a la COCINA', CUENTAS.GERENTE, 'COCINA', true],
      ['el GERENTE a otro GERENTE', CUENTAS.GERENTE, 'GERENTE', false],
    ])('%s: %s', async (_caso, cuenta, rol, puede) => {
      // Arrange
      prisma.membresia.findUnique.mockResolvedValue(membresia(rol))

      // Act
      const quita = service.quitarAcceso(REST, 'm-1', cuenta)

      // Assert
      if (puede) {
        await quita
        expect(prisma.membresia.delete).toHaveBeenCalledWith({ where: { id: 'm-1' } })
      } else {
        await expect(quita).rejects.toThrow(new ForbiddenException('No podés quitarle el acceso a ese rol'))
        expect(prisma.membresia.delete).not.toHaveBeenCalled()
      }
    })

    it.each<[Rol]>([['MOZO'], ['JEFE_SALON']])('a un %s también le da de baja el Mozo del restaurante', async (rol) => {
      // Arrange
      prisma.membresia.findUnique.mockResolvedValue(membresia(rol, 'u-mozo'))

      // Act
      await service.quitarAcceso(REST, 'm-1', CUENTAS.GERENTE)

      // Assert
      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
      expect(prisma.mozo.updateMany).toHaveBeenCalledWith({ where: { restauranteId: REST, usuarioId: 'u-mozo' }, data: { activo: false } })
    })

    it('a la COCINA solo le borra la membresía (no tiene Mozo)', async () => {
      // Arrange
      prisma.membresia.findUnique.mockResolvedValue(membresia('COCINA'))

      // Act
      await service.quitarAcceso(REST, 'm-1', CUENTAS.OWNER_A)

      // Assert
      expect(prisma.membresia.delete).toHaveBeenCalled()
      expect(prisma.mozo.updateMany).not.toHaveBeenCalled()
    })

    it('nadie se quita el acceso a sí mismo', async () => {
      // Arrange
      prisma.membresia.findUnique.mockResolvedValue(membresia('GERENTE', CUENTAS.GERENTE.id))

      // Act + Assert
      await expect(service.quitarAcceso(REST, 'm-1', CUENTAS.GERENTE)).rejects.toThrow(
        new ForbiddenException('No podés quitarte el acceso a vos mismo'),
      )
      expect(prisma.membresia.delete).not.toHaveBeenCalled()
    })

    it.each([
      ['no existe', null],
      ['es de otro restaurante', membresia('MOZO', 'u-otro', MUNDO.REST_2)],
      ['es de un dueño (de la marca, no del restaurante: se quita desde la consola de ROOT)', { id: 'm-1', rol: 'OWNER', usuarioId: 'u-owner', restauranteId: null }],
    ])('una membresía que %s: 404 y no se borra nada', async (_caso, fila) => {
      // Arrange
      prisma.membresia.findUnique.mockResolvedValue(fila)

      // Act + Assert
      await expect(service.quitarAcceso(REST, 'm-1', CUENTAS.OWNER_A)).rejects.toThrow(
        new NotFoundException('Esa persona no tiene acceso a este restaurante'),
      )
      expect(prisma.membresia.delete).not.toHaveBeenCalled()
    })
  })
})
