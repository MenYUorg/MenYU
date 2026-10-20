import { BadRequestException, ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { PrismaMock, comoPrisma } from '../../test/prisma-mock'
import { EMAIL_DEL_ROOT, ROOT_USER, armarTransaccionRoot, filasDelHistorial, serializar } from '../../test/root-mock'
import { HistorialRootService } from '../historial/historial-root.service'
import { CAMBIO_PASSWORD } from '../historial/registrar-historial'
import { RootRootsService } from './root-roots.service'

const errorDeClaveUnica = () => new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' })

// Una fila de cuenta ROOT como la devolvería la base, con campos de más (que el servicio no tiene que dejar pasar).
const filaRoot = (extra: Record<string, unknown> = {}) => ({
  id: 'root-2',
  email: 'bruno@ejemplo.com',
  debeCambiarPassword: false,
  passwordHash: 'HASH-QUE-NO-DEBE-SALIR',
  rol: 'ROOT',
  ...extra,
})

describe('RootRootsService', () => {
  let prisma: PrismaMock
  let tx: PrismaMock
  let servicio: RootRootsService

  beforeEach(() => {
    ;({ prisma, tx } = armarTransaccionRoot())
    servicio = new RootRootsService(comoPrisma(prisma), new HistorialRootService())
  })

  const nadaPorFuera = () => {
    expect(prisma.admin.create).not.toHaveBeenCalled()
    expect(prisma.admin.update).not.toHaveBeenCalled()
    expect(prisma.historialRoot.create).not.toHaveBeenCalled()
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled()
  }

  describe('listar', () => {
    it('trae solo cuentas ROOT con un select explícito, y marca cuál es la propia', async () => {
      // Arrange
      prisma.admin.findMany.mockResolvedValue([filaRoot({ id: 'root-1', email: EMAIL_DEL_ROOT }), filaRoot()])

      // Act
      const lista = await servicio.listar(ROOT_USER)

      // Assert
      const args = prisma.admin.findMany.mock.calls[0][0]
      expect(args.where).toEqual({ rol: 'ROOT' })
      expect(args.select).toEqual({ id: true, email: true, debeCambiarPassword: true })
      expect(args).not.toHaveProperty('include')
      expect(lista.map((c) => [c.email, c.esPropia])).toEqual([[EMAIL_DEL_ROOT, true], ['bruno@ejemplo.com', false]])
    })

    it('devuelve exactamente id, email, debeCambiarPassword y esPropia', async () => {
      prisma.admin.findMany.mockResolvedValue([filaRoot()])

      const [cuenta] = await servicio.listar(ROOT_USER)

      expect(Object.keys(cuenta).sort()).toEqual(['debeCambiarPassword', 'email', 'esPropia', 'id'])
      expect(serializar(cuenta)).not.toContain('HASH-QUE-NO-DEBE-SALIR')
    })
  })

  describe('crear', () => {
    beforeEach(() => {
      tx.admin.findFirst.mockResolvedValue(null)
      tx.admin.create.mockImplementation(({ data }) =>
        Promise.resolve(filaRoot({ id: 'root-nuevo', email: data.email, debeCambiarPassword: data.debeCambiarPassword })),
      )
    })

    it('crea una cuenta ROOT sin marca, con contraseña generada y temporal, y la devuelve una sola vez', async () => {
      // Act
      const creada = await servicio.crear({ email: 'carla@ejemplo.com' }, ROOT_USER)

      // Assert
      const { data, select } = tx.admin.create.mock.calls[0][0]
      expect(data).toEqual({ email: 'carla@ejemplo.com', passwordHash: expect.any(String), rol: 'ROOT', debeCambiarPassword: true })
      expect(data).not.toHaveProperty('marcaId')
      expect(select).not.toHaveProperty('passwordHash')
      expect(creada.passwordTemporal).toHaveLength(12)
      expect(await bcrypt.compare(creada.passwordTemporal as string, data.passwordHash)).toBe(true)
      expect(Object.keys(creada).sort()).toEqual(['debeCambiarPassword', 'email', 'esPropia', 'id', 'passwordTemporal'])
      expect(creada.esPropia).toBe(false)
      expect(serializar(creada)).not.toContain('HASH-QUE-NO-DEBE-SALIR')
      nadaPorFuera()
    })

    it('deja EXACTAMENTE un registro ROOT_CREAR con el actor y la cuenta nueva, sin contraseña ni hash', async () => {
      // Act
      const creada = await servicio.crear({ email: 'carla@ejemplo.com' }, ROOT_USER)

      // Assert
      const filas = filasDelHistorial(tx)
      expect(filas).toHaveLength(1)
      expect(filas[0]).toMatchObject({
        actorTipo: 'ROOT',
        actorId: 'root-1',
        actorNombre: EMAIL_DEL_ROOT,
        accion: 'ROOT_CREAR',
        entidadTipo: 'ROOT',
        entidadId: 'root-nuevo',
        entidadNombre: 'carla@ejemplo.com',
        marcaId: null,
        marcaNombre: null,
      })
      expect(filas[0].detalle).toEqual([{ campo: 'Email', antes: null, despues: 'carla@ejemplo.com' }, CAMBIO_PASSWORD.generada])
      const todo = serializar(tx.historialRoot.create.mock.calls)
      expect(todo).not.toContain(creada.passwordTemporal as string)
      expect(todo).not.toContain(tx.admin.create.mock.calls[0][0].data.passwordHash)
      expect(tx.admin.create.mock.invocationCallOrder[0]).toBeLessThan(tx.historialRoot.create.mock.invocationCallOrder[0])
    })

    it('si ROOT elige la contraseña, no se devuelve y el historial dice que fue elegida', async () => {
      // Act
      const creada = await servicio.crear({ email: 'carla@ejemplo.com', password: 'Caracol-Violeta-48' }, ROOT_USER)

      // Assert
      expect(creada.passwordTemporal).toBeNull()
      expect(await bcrypt.compare('Caracol-Violeta-48', tx.admin.create.mock.calls[0][0].data.passwordHash)).toBe(true)
      expect(filasDelHistorial(tx)[0].detalle).toContainEqual(CAMBIO_PASSWORD.elegida)
      expect(serializar(tx.historialRoot.create.mock.calls)).not.toContain('Caracol-Violeta-48')
    })

    it('con una contraseña elegida débil responde 400 sin abrir la transacción', async () => {
      await expect(servicio.crear({ email: 'carla@ejemplo.com', password: 'root1234' }, ROOT_USER)).rejects.toThrow(BadRequestException)

      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it.each([
      ['otra cuenta de admin', 'admin'],
      ['un mozo', 'mozo'],
      ['un cliente', 'cliente'],
    ])('si el email ya lo usa %s responde 409 y no escribe nada', async (_quien, tabla) => {
      // Arrange
      tx[tabla].findFirst.mockResolvedValue({ id: 'otro' })

      // Act
      const alta = servicio.crear({ email: 'carla@ejemplo.com' }, ROOT_USER)

      // Assert
      await expect(alta).rejects.toThrow(ConflictException)
      expect(tx.admin.create).not.toHaveBeenCalled()
      expect(tx.historialRoot.create).not.toHaveBeenCalled()
    })

    it('si choca en la base con la clave única responde 409 y no registra nada', async () => {
      tx.admin.create.mockRejectedValue(errorDeClaveUnica())

      await expect(servicio.crear({ email: 'carla@ejemplo.com' }, ROOT_USER)).rejects.toThrow(ConflictException)

      expect(tx.historialRoot.create).not.toHaveBeenCalled()
    })

    it('si la cuenta ROOT que actúa ya no existe responde 401 y no escribe nada', async () => {
      tx.admin.findUnique.mockResolvedValue(null)

      await expect(servicio.crear({ email: 'carla@ejemplo.com' }, ROOT_USER)).rejects.toThrow(UnauthorizedException)

      expect(tx.admin.create).not.toHaveBeenCalled()
    })

    it('si el historial falla, el error sale (la cuenta no queda creada)', async () => {
      tx.historialRoot.create.mockRejectedValue(new Error('sin espacio'))

      await expect(servicio.crear({ email: 'carla@ejemplo.com' }, ROOT_USER)).rejects.toThrow('sin espacio')
    })
  })

  describe('restablecerPassword', () => {
    beforeEach(() => {
      tx.admin.findFirst.mockResolvedValue(filaRoot())
      tx.admin.update.mockImplementation(({ data }) => Promise.resolve(filaRoot({ debeCambiarPassword: data.debeCambiarPassword })))
    })

    it('restablece la contraseña de OTRA cuenta ROOT, la marca como temporal, cierra sus sesiones y la devuelve una vez', async () => {
      // Act
      const r = await servicio.restablecerPassword('root-2', ROOT_USER)

      // Assert
      const { where, data } = tx.admin.update.mock.calls[0][0]
      expect(where).toEqual({ id: 'root-2' })
      expect(data.debeCambiarPassword).toBe(true)
      expect(await bcrypt.compare(r.passwordTemporal as string, data.passwordHash)).toBe(true)
      expect(tx.refreshToken.updateMany.mock.calls[0][0].where).toEqual({ userId: 'root-2', userTipo: 'admin', revokedAt: null })
      expect(Object.keys(r).sort()).toEqual(['debeCambiarPassword', 'email', 'esPropia', 'id', 'passwordTemporal'])
      expect(r.esPropia).toBe(false)
      nadaPorFuera()
    })

    it('deja un registro ROOT_RESTABLECER que no lleva la contraseña ni el hash', async () => {
      // Act
      const r = await servicio.restablecerPassword('root-2', ROOT_USER)

      // Assert
      const filas = filasDelHistorial(tx)
      expect(filas).toHaveLength(1)
      expect(filas[0]).toMatchObject({
        actorNombre: EMAIL_DEL_ROOT,
        accion: 'ROOT_RESTABLECER',
        entidadTipo: 'ROOT',
        entidadId: 'root-2',
        entidadNombre: 'bruno@ejemplo.com',
      })
      expect(filas[0].detalle).toEqual([CAMBIO_PASSWORD.restablecida])
      const todo = serializar(tx.historialRoot.create.mock.calls)
      expect(todo).not.toContain(r.passwordTemporal as string)
      expect(todo).not.toContain(tx.admin.update.mock.calls[0][0].data.passwordHash)
    })

    it('la propia contraseña no se restablece por acá: 400 sin tocar nada', async () => {
      // Act
      const restablecimiento = servicio.restablecerPassword('root-1', ROOT_USER)

      // Assert
      await expect(restablecimiento).rejects.toThrow(BadRequestException)
      await expect(restablecimiento).rejects.toThrow(/cambiar mi contraseña/)
      expect(prisma.$transaction).not.toHaveBeenCalled()
      expect(tx.admin.update).not.toHaveBeenCalled()
      expect(tx.historialRoot.create).not.toHaveBeenCalled()
    })

    it('solo actúa sobre cuentas ROOT: un dueño o un gerente responde 404', async () => {
      tx.admin.findFirst.mockResolvedValue(null)

      await expect(servicio.restablecerPassword('owner-1', ROOT_USER)).rejects.toThrow(NotFoundException)

      expect(tx.admin.findFirst.mock.calls[0][0].where).toEqual({ id: 'owner-1', rol: 'ROOT' })
      expect(tx.admin.update).not.toHaveBeenCalled()
      expect(tx.refreshToken.updateMany).not.toHaveBeenCalled()
      expect(tx.historialRoot.create).not.toHaveBeenCalled()
    })

    it('si la cuenta ROOT que actúa ya no existe responde 401', async () => {
      tx.admin.findUnique.mockResolvedValue(null)

      await expect(servicio.restablecerPassword('root-2', ROOT_USER)).rejects.toThrow(UnauthorizedException)
      expect(tx.admin.update).not.toHaveBeenCalled()
    })

    it('si el historial falla, el error sale', async () => {
      tx.historialRoot.create.mockRejectedValue(new Error('sin espacio'))

      await expect(servicio.restablecerPassword('root-2', ROOT_USER)).rejects.toThrow('sin espacio')
    })
  })

  it('NO tiene forma de borrar cuentas ROOT (decisión 15): solo listar, crear y restablecer', () => {
    const metodos = Object.getOwnPropertyNames(RootRootsService.prototype).filter((n) => n !== 'constructor').sort()

    expect(metodos).toEqual(['crear', 'listar', 'restablecerPassword'])
  })
})
