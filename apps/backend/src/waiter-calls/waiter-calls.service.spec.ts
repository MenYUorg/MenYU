import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { MenyuGateway } from '../gateway/menyu.gateway'
import { PrismaMock, comoPrisma, crearPrismaMock } from '../test/prisma-mock'
import { WaiterCallsService } from './waiter-calls.service'

// JwtService real con un secreto de test: los tokens se firman y verifican de verdad.
const jwt = new JwtService({ secret: 'secreto-de-test' })
const bearer = (payload: object) => `Bearer ${jwt.sign(payload)}`

const SESION_CLIENTE = { sub: 'cliente-1', tipo: 'cliente', sesionId: 'sesion-1', mesaId: 'mesa-1', restauranteId: 'rest-1' }
const MOZO = { sub: 'mozo-1', tipo: 'mozo' }

describe('WaiterCallsService', () => {
  let prisma: PrismaMock
  let gateway: { emitMozoCalled: jest.Mock }
  let service: WaiterCallsService

  beforeEach(() => {
    prisma = crearPrismaMock()
    gateway = { emitMozoCalled: jest.fn() }
    service = new WaiterCallsService(comoPrisma(prisma), jwt, gateway as unknown as MenyuGateway)
  })

  describe('findByRestaurante', () => {
    it('devuelve los llamados pendientes de las sesiones activas con el número de mesa', async () => {
      // Arrange
      prisma.mesa.findMany.mockResolvedValue([{ id: 'mesa-1' }, { id: 'mesa-2' }])
      prisma.sesionMesa.findMany.mockResolvedValue([{ id: 'sesion-1', mesa: { numero: '7' } }])
      prisma.llamadoMozo.findMany.mockResolvedValue([{ id: 'llamado-1', sesionId: 'sesion-1', motivo: 'cuenta' }])

      // Act
      const llamados = await service.findByRestaurante('rest-1')

      // Assert
      expect(llamados).toEqual([
        { id: 'llamado-1', sesionId: 'sesion-1', motivo: 'cuenta', sesion: { mesa: { numero: '7' } } },
      ])
      expect(prisma.sesionMesa.findMany.mock.calls[0][0].where).toEqual({ mesaId: { in: ['mesa-1', 'mesa-2'] }, estado: 'activa' })
      expect(prisma.llamadoMozo.findMany).toHaveBeenCalledWith({
        where: { sesionId: { in: ['sesion-1'] }, estado: 'pendiente' },
        orderBy: { createdAt: 'asc' },
      })
    })

    it('sin mesas devuelve una lista vacía sin consultar sesiones', async () => {
      // Arrange
      prisma.mesa.findMany.mockResolvedValue([])

      // Act
      const llamados = await service.findByRestaurante('rest-1')

      // Assert
      expect(llamados).toEqual([])
      expect(prisma.sesionMesa.findMany).not.toHaveBeenCalled()
    })

    it('sin sesiones activas devuelve una lista vacía sin consultar llamados', async () => {
      // Arrange
      prisma.mesa.findMany.mockResolvedValue([{ id: 'mesa-1' }])
      prisma.sesionMesa.findMany.mockResolvedValue([])

      // Act
      const llamados = await service.findByRestaurante('rest-1')

      // Assert
      expect(llamados).toEqual([])
      expect(prisma.llamadoMozo.findMany).not.toHaveBeenCalled()
    })
  })

  describe('llamar', () => {
    it('guarda el llamado y avisa a los mozos del restaurante por socket', async () => {
      // Arrange
      prisma.sesionMesa.findUnique.mockResolvedValue({ id: 'sesion-1', estado: 'activa', mesa: { numero: '7' } })
      prisma.llamadoMozo.create.mockResolvedValue({ id: 'llamado-1', motivo: 'cuenta' })

      // Act
      const resultado = await service.llamar({ sesionId: 'sesion-1', motivo: 'cuenta' }, bearer(SESION_CLIENTE))

      // Assert
      expect(resultado).toEqual({ ok: true })
      expect(prisma.llamadoMozo.create).toHaveBeenCalledWith({ data: { sesionId: 'sesion-1', motivo: 'cuenta' } })
      expect(gateway.emitMozoCalled).toHaveBeenCalledWith('rest-1', {
        llamadoId: 'llamado-1',
        sesionId: 'sesion-1',
        mesaNumero: '7',
        motivo: 'cuenta',
      })
    })

    it('sin motivo lo guarda como "general"', async () => {
      // Arrange
      prisma.sesionMesa.findUnique.mockResolvedValue({ id: 'sesion-1', estado: 'activa', mesa: { numero: '7' } })
      prisma.llamadoMozo.create.mockResolvedValue({ id: 'llamado-1', motivo: null })

      // Act
      await service.llamar({ sesionId: 'sesion-1' }, bearer(SESION_CLIENTE))

      // Assert
      expect(prisma.llamadoMozo.create).toHaveBeenCalledWith({ data: { sesionId: 'sesion-1', motivo: 'general' } })
      expect(gateway.emitMozoCalled.mock.calls[0][1].motivo).toBe('general')
    })

    it.each([
      ['sin header', undefined, 'Session JWT requerido'],
      ['con un header que no es Bearer', 'Basic abc', 'Session JWT requerido'],
      ['con un token inválido', 'Bearer no-es-un-jwt', 'Session JWT inválido o expirado'],
    ])('%s responde 401', async (_caso, header, mensaje) => {
      // Act
      const llamado = service.llamar({ sesionId: 'sesion-1' }, header)

      // Assert
      await expect(llamado).rejects.toThrow(new UnauthorizedException(mensaje))
      expect(prisma.llamadoMozo.create).not.toHaveBeenCalled()
    })

    it('un token que no es de cliente responde 401', async () => {
      // Act
      const llamado = service.llamar({ sesionId: 'sesion-1' }, bearer(MOZO))

      // Assert
      await expect(llamado).rejects.toThrow(new UnauthorizedException('Solo clientes pueden llamar al mozo'))
    })

    it('una sesión que no existe responde 404 y no avisa a nadie', async () => {
      // Arrange
      prisma.sesionMesa.findUnique.mockResolvedValue(null)

      // Act
      const llamado = service.llamar({ sesionId: 'sesion-1' }, bearer(SESION_CLIENTE))

      // Assert
      await expect(llamado).rejects.toThrow(new NotFoundException('Sesión no encontrada'))
      expect(gateway.emitMozoCalled).not.toHaveBeenCalled()
    })

    it('una sesión cerrada responde 400 y no guarda el llamado', async () => {
      // Arrange
      prisma.sesionMesa.findUnique.mockResolvedValue({ id: 'sesion-1', estado: 'cerrada', mesa: { numero: '7' } })

      // Act
      const llamado = service.llamar({ sesionId: 'sesion-1' }, bearer(SESION_CLIENTE))

      // Assert
      await expect(llamado).rejects.toThrow(new BadRequestException('La sesión no está activa'))
      expect(prisma.llamadoMozo.create).not.toHaveBeenCalled()
    })
  })

  describe('atender', () => {
    it('marca el llamado como atendido por el mozo del token', async () => {
      // Arrange
      prisma.llamadoMozo.findUnique.mockResolvedValue({ id: 'llamado-1', estado: 'pendiente' })
      prisma.llamadoMozo.update.mockResolvedValue({ id: 'llamado-1', estado: 'atendido', mozoId: 'mozo-1' })

      // Act
      const llamado = await service.atender('llamado-1', bearer(MOZO))

      // Assert
      expect(llamado.estado).toBe('atendido')
      expect(prisma.llamadoMozo.update).toHaveBeenCalledWith({
        where: { id: 'llamado-1' },
        data: { estado: 'atendido', mozoId: 'mozo-1' },
      })
    })

    it.each([
      ['sin header', undefined, 'JWT de mozo requerido'],
      ['con un token inválido', 'Bearer roto', 'JWT inválido o expirado'],
    ])('%s responde 401', async (_caso, header, mensaje) => {
      // Act
      const atencion = service.atender('llamado-1', header)

      // Assert
      await expect(atencion).rejects.toThrow(new UnauthorizedException(mensaje))
    })

    it('un token de cliente responde 401', async () => {
      // Act
      const atencion = service.atender('llamado-1', bearer(SESION_CLIENTE))

      // Assert
      await expect(atencion).rejects.toThrow(new UnauthorizedException('Solo mozos pueden atender llamados'))
    })

    it('un llamado que no existe responde 404', async () => {
      // Arrange
      prisma.llamadoMozo.findUnique.mockResolvedValue(null)

      // Act
      const atencion = service.atender('no-existe', bearer(MOZO))

      // Assert
      await expect(atencion).rejects.toThrow(new NotFoundException('Llamado no encontrado'))
    })

    it('un llamado ya atendido responde 400 y no se vuelve a actualizar', async () => {
      // Arrange
      prisma.llamadoMozo.findUnique.mockResolvedValue({ id: 'llamado-1', estado: 'atendido' })

      // Act
      const atencion = service.atender('llamado-1', bearer(MOZO))

      // Assert
      await expect(atencion).rejects.toThrow(new BadRequestException('Este llamado ya fue atendido'))
      expect(prisma.llamadoMozo.update).not.toHaveBeenCalled()
    })
  })
})
