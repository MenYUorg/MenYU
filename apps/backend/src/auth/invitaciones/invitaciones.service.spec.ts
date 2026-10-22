import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { Prisma, Rol } from '@prisma/client'
import { accesoDeTest, CUENTAS, MUNDO } from '../../test/acceso-de-test'
import { comoPrisma, crearPrismaMock, PrismaMock } from '../../test/prisma-mock'
import { SupabaseAdminService } from '../supabase/supabase-admin.service'
import { InvitacionesService } from './invitaciones.service'

// La invitación con las membresías de CUENTAS y Supabase simulado. La matriz de quién invita a quién está completa en
// puede-invitar.spec; acá, el flujo: ámbito, permisos, cuentas existentes, Supabase y el vínculo con el Mozo.
const REST = MUNDO.REST_1
const CUENTA_NUEVA = { id: '6f1c2a40-7777-4a1b-9c3d-000000000001', email: 'nuevo@menyu.test', email_confirmed_at: null }

describe('InvitacionesService', () => {
  let prisma: PrismaMock
  let supabase: { generateLink: jest.Mock; deleteUser: jest.Mock; inviteUserByEmail: jest.Mock }
  let service: InvitacionesService

  const invitacion = (rol: Rol, ambito: { marcaId?: string; restauranteId?: string }, email = 'nuevo@menyu.test') => ({
    email,
    nombre: 'Nuevo',
    rol,
    ...ambito,
  })

  beforeEach(() => {
    prisma = crearPrismaMock()
    supabase = {
      generateLink: jest.fn().mockResolvedValue({ data: null, error: { code: 'user_not_found', status: 404, message: 'no existe' } }),
      deleteUser: jest.fn().mockResolvedValue({ error: null }),
      inviteUserByEmail: jest.fn().mockResolvedValue({ data: { user: CUENTA_NUEVA }, error: null }),
    }
    service = new InvitacionesService(comoPrisma(prisma), accesoDeTest(), { auth: supabase } as unknown as SupabaseAdminService)

    prisma.usuario.findUnique.mockResolvedValue(null)
    prisma.usuario.create.mockResolvedValue({ id: 'u-nuevo', email: 'nuevo@menyu.test', nombre: 'Nuevo' })
    prisma.membresia.create.mockResolvedValue({ id: 'm-nueva' })
    prisma.mozo.findFirst.mockResolvedValue(null)
    prisma.restaurante.findUnique.mockResolvedValue({ activo: true, marca: { activo: true } })
    prisma.marca.findUnique.mockResolvedValue({ activo: true })
  })

  describe('el ámbito y el permiso', () => {
    it.each([
      ['OWNER sin marcaId', invitacion('OWNER', { restauranteId: REST })],
      ['MOZO con marcaId', invitacion('MOZO', { marcaId: MUNDO.MARCA_A })],
    ])('%s: 400', async (_caso, dto) => {
      await expect(service.invitar(dto, CUENTAS.OWNER_A)).rejects.toThrow(BadRequestException)
    })

    it('nadie se invita a sí mismo', async () => {
      await expect(service.invitar(invitacion('MOZO', { restauranteId: REST }, CUENTAS.OWNER_A.email), CUENTAS.OWNER_A)).rejects.toThrow(
        new ForbiddenException('No te podés invitar a vos mismo'),
      )
    })

    it.each([
      ['el MOZO a otro MOZO', CUENTAS.MOZO, invitacion('MOZO', { restauranteId: REST })],
      ['el GERENTE a otro GERENTE', CUENTAS.GERENTE, invitacion('GERENTE', { restauranteId: REST })],
      ['el OWNER de otra marca', CUENTAS.OWNER_B, invitacion('MOZO', { restauranteId: REST })],
      ['ROOT a un MOZO', CUENTAS.ROOT, invitacion('MOZO', { restauranteId: REST })],
      ['ROOT a un GERENTE', CUENTAS.ROOT, invitacion('GERENTE', { restauranteId: REST })],
    ])('%s: 403 sin tocar Supabase', async (_caso, cuenta, dto) => {
      await expect(service.invitar(dto, cuenta)).rejects.toThrow(new ForbiddenException('No podés invitar a ese rol ahí'))
      expect(supabase.inviteUserByEmail).not.toHaveBeenCalled()
    })

    // El AccesoService de test no mira si el restaurante está disponible: así se llega al chequeo del restaurante,
    // que con el real queda como defensa (al personal de algo dado de baja ya le da 403 el permiso).
    it.each([
      ['ROOT', 'la marca', CUENTAS.ROOT, invitacion('OWNER', { marcaId: MUNDO.MARCA_A }), () => prisma.marca.findUnique.mockResolvedValue(null), 'Marca no encontrada'],
      ['el OWNER', 'el restaurante', CUENTAS.OWNER_A, invitacion('GERENTE', { restauranteId: REST }), () => prisma.restaurante.findUnique.mockResolvedValue(null), 'Restaurante no encontrado'],
    ])('%s invitando a %s que no existe: 404', async (_quien, _caso, cuenta, dto, preparar, mensaje) => {
      preparar()

      await expect(service.invitar(dto, cuenta)).rejects.toThrow(new NotFoundException(mensaje))
    })

    it.each([
      ['ROOT', 'un OWNER a una marca dada de baja', CUENTAS.ROOT, invitacion('OWNER', { marcaId: MUNDO.MARCA_A }), () => prisma.marca.findUnique.mockResolvedValue({ activo: false }), 'La marca está dada de baja'],
      ['el OWNER', 'un GERENTE a un restaurante dado de baja', CUENTAS.OWNER_A, invitacion('GERENTE', { restauranteId: REST }), () => prisma.restaurante.findUnique.mockResolvedValue({ activo: false, marca: { activo: true } }), 'El restaurante o su marca están dados de baja'],
      ['el OWNER', 'un GERENTE a un restaurante de una marca dada de baja', CUENTAS.OWNER_A, invitacion('GERENTE', { restauranteId: REST }), () => prisma.restaurante.findUnique.mockResolvedValue({ activo: true, marca: { activo: false } }), 'El restaurante o su marca están dados de baja'],
    ])('%s invitando %s: 409 sin tocar Supabase', async (_quien, _caso, cuenta, dto, preparar, mensaje) => {
      preparar()

      await expect(service.invitar(dto, cuenta)).rejects.toThrow(new ConflictException(mensaje))
      expect(supabase.generateLink).not.toHaveBeenCalled()
    })
  })

  describe('una cuenta nueva', () => {
    it('el GERENTE invita a un MOZO: manda la invitación, crea el Usuario, la membresía y su Mozo', async () => {
      // Act
      const creada = await service.invitar(invitacion('MOZO', { restauranteId: REST }), CUENTAS.GERENTE)

      // Assert
      expect(creada).toEqual({ usuarioId: 'u-nuevo', membresiaId: 'm-nueva', invitacionEnviada: true })
      expect(supabase.inviteUserByEmail).toHaveBeenCalledWith('nuevo@menyu.test')
      expect(prisma.usuario.create).toHaveBeenCalledWith({
        data: { supabaseUserId: CUENTA_NUEVA.id, email: 'nuevo@menyu.test', nombre: 'Nuevo' },
      })
      expect(prisma.membresia.create).toHaveBeenCalledWith({ data: { usuarioId: 'u-nuevo', rol: 'MOZO', restauranteId: REST } })
      expect(prisma.mozo.create).toHaveBeenCalledWith({
        data: { restauranteId: REST, nombre: 'Nuevo', email: 'nuevo@menyu.test', usuarioId: 'u-nuevo', esJefeSalon: false },
      })
    })

    it('un JEFE_SALON vincula el Mozo del login propio con su email y lo reactiva', async () => {
      // Arrange
      prisma.mozo.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'mozo-viejo' })

      // Act
      await service.invitar(invitacion('JEFE_SALON', { restauranteId: REST }), CUENTAS.OWNER_A)

      // Assert
      expect(prisma.mozo.update).toHaveBeenCalledWith({
        where: { id: 'mozo-viejo' },
        data: { usuarioId: 'u-nuevo', esJefeSalon: true, activo: true },
      })
      expect(prisma.mozo.create).not.toHaveBeenCalled()
    })

    it('la COCINA no tiene Mozo', async () => {
      // Act
      await service.invitar(invitacion('COCINA', { restauranteId: REST }), CUENTAS.GERENTE)

      // Assert
      expect(prisma.mozo.findFirst).not.toHaveBeenCalled()
      expect(prisma.mozo.create).not.toHaveBeenCalled()
    })

    it('una cuenta confirmada de Supabase (un cliente registrado) se usa sin mandar mail', async () => {
      // Arrange
      supabase.generateLink.mockResolvedValue({ data: { user: { ...CUENTA_NUEVA, email_confirmed_at: '2026-10-01' } }, error: null })

      // Act
      const creada = await service.invitar(invitacion('COCINA', { restauranteId: REST }), CUENTAS.OWNER_A)

      // Assert
      expect(creada.invitacionEnviada).toBe(false)
      expect(supabase.inviteUserByEmail).not.toHaveBeenCalled()
      expect(supabase.deleteUser).not.toHaveBeenCalled()
    })

    it('una cuenta sin confirmar se borra y se invita de nuevo', async () => {
      // Arrange
      supabase.generateLink.mockResolvedValue({ data: { user: CUENTA_NUEVA }, error: null })

      // Act
      const creada = await service.invitar(invitacion('COCINA', { restauranteId: REST }), CUENTAS.OWNER_A)

      // Assert
      expect(supabase.deleteUser).toHaveBeenCalledWith(CUENTA_NUEVA.id)
      expect(supabase.inviteUserByEmail).toHaveBeenCalled()
      expect(creada.invitacionEnviada).toBe(true)
    })

    it('un error de Supabase: 502 y no se crea nada', async () => {
      // Arrange
      supabase.inviteUserByEmail.mockResolvedValue({ data: null, error: { status: 500, code: 'unexpected', message: 'caído' } })

      // Act + Assert
      await expect(service.invitar(invitacion('COCINA', { restauranteId: REST }), CUENTAS.OWNER_A)).rejects.toThrow(BadGatewayException)
      expect(prisma.usuario.create).not.toHaveBeenCalled()
    })

    it('una invitación repetida al mismo tiempo choca con la clave única: 409', async () => {
      // Arrange
      prisma.$transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('único', { code: 'P2002', clientVersion: 'x' }))

      // Act + Assert
      await expect(service.invitar(invitacion('COCINA', { restauranteId: REST }), CUENTAS.OWNER_A)).rejects.toThrow(
        new ConflictException('El usuario ya existe o ya tiene un rol ahí'),
      )
    })
  })

  describe('un email que ya es de un Usuario', () => {
    it('ROOT le suma la membresía de OWNER sin tocar Supabase', async () => {
      // Arrange
      prisma.usuario.findUnique.mockResolvedValue({ id: 'u-existente', email: 'nuevo@menyu.test', nombre: 'Ya', activo: true })
      prisma.membresia.findFirst.mockResolvedValue(null)

      // Act
      const creada = await service.invitar(invitacion('OWNER', { marcaId: MUNDO.MARCA_A }), CUENTAS.ROOT)

      // Assert
      expect(creada).toEqual({ usuarioId: 'u-existente', membresiaId: 'm-nueva', invitacionEnviada: false })
      expect(prisma.membresia.create).toHaveBeenCalledWith({ data: { usuarioId: 'u-existente', rol: 'OWNER', marcaId: MUNDO.MARCA_A } })
      expect(supabase.generateLink).not.toHaveBeenCalled()
    })

    it.each([
      ['está desactivado', { activo: false }, null, 'El usuario está desactivado'],
      ['ya tiene un rol en ese restaurante', { activo: true }, { id: 'm-vieja' }, 'El usuario ya tiene un rol ahí'],
    ])('si %s: 409', async (_caso, usuario, membresia, mensaje) => {
      // Arrange
      prisma.usuario.findUnique.mockResolvedValue({ id: 'u-existente', email: 'nuevo@menyu.test', nombre: 'Ya', ...usuario })
      prisma.membresia.findFirst.mockResolvedValue(membresia)

      // Act + Assert
      await expect(service.invitar(invitacion('MOZO', { restauranteId: REST }), CUENTAS.GERENTE)).rejects.toThrow(
        new ConflictException(mensaje),
      )
      expect(prisma.membresia.create).not.toHaveBeenCalled()
    })
  })
})
