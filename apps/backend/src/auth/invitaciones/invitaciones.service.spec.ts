import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { Prisma, Rol } from '@prisma/client'
import { HistorialRootService } from '../../root/historial/historial-root.service'
import { accesoDeTest, CUENTAS, MUNDO } from '../../test/acceso-de-test'
import { comoPrisma, crearPrismaMock, PrismaMock } from '../../test/prisma-mock'
import { armarTransaccionRoot, EMAIL_DEL_ROOT, filasDelHistorial } from '../../test/root-mock'
import { SupabaseAdminService } from '../supabase/supabase-admin.service'
import { InvitacionesService } from './invitaciones.service'

// La invitación con las membresías de CUENTAS y Supabase simulado. La matriz de quién invita a quién está completa en
// puede-invitar.spec; acá, el flujo: ámbito, permisos, cuentas existentes, Supabase, el vínculo con el Mozo y el
// historial de ROOT.
const REST = MUNDO.REST_1
const CUENTA_NUEVA = { id: '6f1c2a40-7777-4a1b-9c3d-000000000001', email: 'nuevo@menyu.test', email_confirmed_at: null }

type SupabaseSimulado = { generateLink: jest.Mock; deleteUser: jest.Mock; inviteUserByEmail: jest.Mock }

function supabaseSimulado(): SupabaseSimulado {
  return {
    generateLink: jest.fn().mockResolvedValue({ data: null, error: { code: 'user_not_found', status: 404, message: 'no existe' } }),
    deleteUser: jest.fn().mockResolvedValue({ error: null }),
    inviteUserByEmail: jest.fn().mockResolvedValue({ data: { user: CUENTA_NUEVA }, error: null }),
  }
}

function crearServicio(prisma: PrismaMock, supabase: SupabaseSimulado): InvitacionesService {
  return new InvitacionesService(
    comoPrisma(prisma),
    accesoDeTest(),
    { auth: supabase } as unknown as SupabaseAdminService,
    new HistorialRootService(comoPrisma(prisma)),
  )
}

const invitacion = (rol: Rol, ambito: { marcaId?: string; restauranteId?: string }, email = 'nuevo@menyu.test') => ({
  email,
  nombre: 'Nuevo',
  rol,
  ...ambito,
})

describe('InvitacionesService', () => {
  let prisma: PrismaMock
  let supabase: SupabaseSimulado
  let service: InvitacionesService

  beforeEach(() => {
    prisma = crearPrismaMock()
    supabase = supabaseSimulado()
    service = crearServicio(prisma, supabase)

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
      expect(prisma.historialRoot.create).not.toHaveBeenCalled()
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
    it('el OWNER le suma la membresía sin tocar Supabase', async () => {
      // Arrange
      prisma.usuario.findUnique.mockResolvedValue({ id: 'u-existente', email: 'nuevo@menyu.test', nombre: 'Ya', activo: true })
      prisma.membresia.findFirst.mockResolvedValue(null)

      // Act
      const creada = await service.invitar(invitacion('COCINA', { restauranteId: REST }), CUENTAS.OWNER_A)

      // Assert
      expect(creada).toEqual({ usuarioId: 'u-existente', membresiaId: 'm-nueva', invitacionEnviada: false })
      expect(prisma.membresia.create).toHaveBeenCalledWith({ data: { usuarioId: 'u-existente', rol: 'COCINA', restauranteId: REST } })
      expect(prisma.usuario.create).not.toHaveBeenCalled()
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

// Decisión 22 de docs/plan-consola-root.md: Supabase antes y afuera; el Usuario, la membresía y el registro, en una sola
// transacción. `prisma` y `tx` son distintos: lo que no pasa por `tx` no se revierte.
describe('InvitacionesService: lo que invita ROOT queda en su historial', () => {
  let prisma: PrismaMock
  let tx: PrismaMock
  let supabase: SupabaseSimulado
  let service: InvitacionesService
  const DUENO = invitacion('OWNER', { marcaId: MUNDO.MARCA_A }, 'juan@laparrilla.com')

  beforeEach(() => {
    ;({ prisma, tx } = armarTransaccionRoot())
    supabase = supabaseSimulado()
    supabase.inviteUserByEmail.mockResolvedValue({ data: { user: { ...CUENTA_NUEVA, email: 'juan@laparrilla.com' } }, error: null })
    service = crearServicio(prisma, supabase)

    prisma.usuario.findUnique.mockResolvedValue(null)
    prisma.marca.findUnique.mockResolvedValue({ activo: true })
    tx.usuario.create.mockResolvedValue({ id: 'u-juan', email: 'juan@laparrilla.com', nombre: 'Nuevo' })
    tx.membresia.create.mockResolvedValue({ id: 'm-juan' })
    tx.marca.findUniqueOrThrow.mockResolvedValue({ id: MUNDO.MARCA_A, nombre: 'La Parrilla' })
  })

  /** Nada se escribió con el cliente suelto: todo fue por la transacción. */
  const nadaPorFuera = () => {
    expect(prisma.usuario.create).not.toHaveBeenCalled()
    expect(prisma.membresia.create).not.toHaveBeenCalled()
    expect(prisma.historialRoot.create).not.toHaveBeenCalled()
  }

  it('un dueño nuevo: primero la invitación de Supabase y después, en una transacción, el Usuario, la membresía y un registro', async () => {
    // Act
    const creada = await service.invitar(DUENO, CUENTAS.ROOT)

    // Assert
    expect(creada).toEqual({ usuarioId: 'u-juan', membresiaId: 'm-juan', invitacionEnviada: true })
    expect(supabase.inviteUserByEmail.mock.invocationCallOrder[0]).toBeLessThan(prisma.$transaction.mock.invocationCallOrder[0])
    expect(tx.membresia.create).toHaveBeenCalledWith({ data: { usuarioId: 'u-juan', rol: 'OWNER', marcaId: MUNDO.MARCA_A } })
    expect(filasDelHistorial(tx)).toEqual([
      {
        actorTipo: 'ROOT',
        actorId: CUENTAS.ROOT.id,
        actorNombre: EMAIL_DEL_ROOT,
        accion: 'DUENO_INVITAR',
        entidadTipo: 'OWNER',
        entidadId: 'u-juan',
        entidadNombre: 'juan@laparrilla.com',
        marcaId: MUNDO.MARCA_A,
        marcaNombre: 'La Parrilla',
        detalle: [
          { campo: 'Dueño de', antes: null, despues: 'La Parrilla' },
          { campo: 'Invitación', antes: null, despues: 'mail enviado' },
        ],
      },
    ])
    expect(tx.usuario.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: CUENTAS.ROOT.id } }))
    nadaPorFuera()
  })

  it('un email que ya es de un Usuario (dueño de otra marca): se suma la membresía, sin Supabase, y también se registra', async () => {
    // Arrange
    prisma.usuario.findUnique.mockResolvedValue({ id: 'u-juan', email: 'juan@laparrilla.com', nombre: 'Juan', activo: true })
    prisma.membresia.findFirst.mockResolvedValue(null)

    // Act
    const creada = await service.invitar(DUENO, CUENTAS.ROOT)

    // Assert
    expect(creada).toEqual({ usuarioId: 'u-juan', membresiaId: 'm-juan', invitacionEnviada: false })
    expect(supabase.generateLink).not.toHaveBeenCalled()
    expect(tx.usuario.create).not.toHaveBeenCalled()
    expect(filasDelHistorial(tx)).toEqual([
      expect.objectContaining({
        accion: 'DUENO_INVITAR',
        entidadId: 'u-juan',
        detalle: [
          { campo: 'Dueño de', antes: null, despues: 'La Parrilla' },
          { campo: 'Invitación', antes: null, despues: 'ya tenía cuenta: no se le mandó mail' },
        ],
      }),
    ])
    nadaPorFuera()
  })

  it('una cuenta de Supabase ya confirmada (un cliente registrado) queda registrada como "ya tenía cuenta"', async () => {
    // Arrange
    supabase.generateLink.mockResolvedValue({ data: { user: { ...CUENTA_NUEVA, email_confirmed_at: '2026-10-01' } }, error: null })

    // Act
    const creada = await service.invitar(DUENO, CUENTAS.ROOT)

    // Assert
    expect(creada.invitacionEnviada).toBe(false)
    expect(filasDelHistorial(tx)[0].detalle[1]).toEqual({ campo: 'Invitación', antes: null, despues: 'ya tenía cuenta: no se le mandó mail' })
  })

  it('si no se puede registrar, la invitación falla y la transacción no deja nada escrito', async () => {
    // Arrange
    tx.historialRoot.create.mockRejectedValue(new Error('sin espacio en el disco'))

    // Act + Assert
    await expect(service.invitar(DUENO, CUENTAS.ROOT)).rejects.toThrow('sin espacio en el disco')
    expect(tx.membresia.create).toHaveBeenCalled()
    nadaPorFuera()
  })

  it('si la cuenta dejó de ser ROOT mientras tanto, responde 401 y no se registra nada', async () => {
    // Arrange
    tx.usuario.findUnique.mockResolvedValue({ id: CUENTAS.ROOT.id, email: EMAIL_DEL_ROOT, esRoot: false, activo: true })

    // Act + Assert
    await expect(service.invitar(DUENO, CUENTAS.ROOT)).rejects.toThrow(UnauthorizedException)
    expect(tx.historialRoot.create).not.toHaveBeenCalled()
    nadaPorFuera()
  })

  it('una cuenta ROOT que además es OWNER e invita a su personal actúa como OWNER: no va al historial de ROOT', async () => {
    // Arrange
    const rootQueEsOwner = { ...CUENTAS.OWNER_A, esRoot: true }
    prisma.restaurante.findUnique.mockResolvedValue({ activo: true, marca: { activo: true } })

    // Act
    await service.invitar(invitacion('MOZO', { restauranteId: REST }), rootQueEsOwner)

    // Assert
    expect(tx.membresia.create).toHaveBeenCalledWith({ data: { usuarioId: 'u-juan', rol: 'MOZO', restauranteId: REST } })
    expect(tx.historialRoot.create).not.toHaveBeenCalled()
  })

  it('el OWNER que invita a otro OWNER de su marca no escribe en el historial de ROOT', async () => {
    // Act
    await service.invitar(DUENO, CUENTAS.OWNER_A)

    // Assert
    expect(tx.membresia.create).toHaveBeenCalled()
    expect(tx.historialRoot.create).not.toHaveBeenCalled()
  })
})
