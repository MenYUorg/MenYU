import { BadRequestException, ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { PrismaMock, comoPrisma } from '../../test/prisma-mock'
import { EMAIL_DEL_ROOT, ROOT_USER, armarTransaccionRoot, filasDelHistorial, serializar } from '../../test/root-mock'
import { HistorialRootService } from '../historial/historial-root.service'
import { CAMBIO_PASSWORD } from '../historial/registrar-historial'
import { RootDuenosService } from './root-duenos.service'

const errorDeClaveUnica = () => new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' })

const MARCA = { id: 'marca-1', nombre: 'La Parrilla', activo: true }

// Una fila de dueño como la devolvería la base, con campos de más (que el servicio no tiene que dejar pasar).
const filaDueno = (extra: Record<string, unknown> = {}) => ({
  id: 'owner-1',
  email: 'juan@laparrilla.com',
  debeCambiarPassword: false,
  marca: MARCA,
  passwordHash: 'HASH-QUE-NO-DEBE-SALIR',
  rol: 'OWNER',
  marcaId: 'marca-1',
  ...extra,
})

describe('RootDuenosService', () => {
  let prisma: PrismaMock
  let tx: PrismaMock
  let servicio: RootDuenosService

  beforeEach(() => {
    ;({ prisma, tx } = armarTransaccionRoot())
    servicio = new RootDuenosService(comoPrisma(prisma), new HistorialRootService())
  })

  /** Nada se escribió con el cliente suelto: todo fue por la transacción. */
  const nadaPorFuera = () => {
    expect(prisma.admin.create).not.toHaveBeenCalled()
    expect(prisma.admin.update).not.toHaveBeenCalled()
    expect(prisma.admin.delete).not.toHaveBeenCalled()
    expect(prisma.historialRoot.create).not.toHaveBeenCalled()
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled()
  }

  describe('listar', () => {
    it('trae solo cuentas OWNER, con un select explícito (sin hash, sin include) y ordenadas por email', async () => {
      // Arrange
      prisma.admin.findMany.mockResolvedValue([filaDueno()])

      // Act
      const lista = await servicio.listar({})

      // Assert
      const args = prisma.admin.findMany.mock.calls[0][0]
      expect(args.where).toEqual({ rol: 'OWNER' })
      expect(args.select).toEqual({ id: true, email: true, debeCambiarPassword: true, marca: { select: { id: true, nombre: true, activo: true } } })
      expect(args).not.toHaveProperty('include')
      expect(args.orderBy).toEqual({ email: 'asc' })
      expect(lista).toHaveLength(1)
    })

    it('devuelve exactamente id, email, debeCambiarPassword y marca {id, nombre, activo}: nada de lo que traiga la fila de más', async () => {
      // Arrange
      prisma.admin.findMany.mockResolvedValue([filaDueno({ marca: { ...MARCA, logoUrl: 'x', slug: 'la-parrilla' } })])

      // Act
      const [dueno] = await servicio.listar({})

      // Assert
      expect(Object.keys(dueno).sort()).toEqual(['debeCambiarPassword', 'email', 'id', 'marca'])
      expect(Object.keys(dueno.marca ?? {}).sort()).toEqual(['activo', 'id', 'nombre'])
      expect(serializar(dueno)).not.toContain('HASH-QUE-NO-DEBE-SALIR')
    })

    it('un dueño sin marca figura con marca null', async () => {
      prisma.admin.findMany.mockResolvedValue([filaDueno({ marca: null })])

      const [dueno] = await servicio.listar({})

      expect(dueno.marca).toBeNull()
    })

    it('q busca por email o por nombre de la marca, sin distinguir mayúsculas', async () => {
      // Arrange
      prisma.admin.findMany.mockResolvedValue([])

      // Act
      await servicio.listar({ q: 'fiore' })

      // Assert
      expect(prisma.admin.findMany.mock.calls[0][0].where).toEqual({
        rol: 'OWNER',
        OR: [
          { email: { contains: 'fiore', mode: 'insensitive' } },
          { marca: { is: { nombre: { contains: 'fiore', mode: 'insensitive' } } } },
        ],
      })
    })

    it('q vacía no filtra', async () => {
      prisma.admin.findMany.mockResolvedValue([])

      await servicio.listar({ q: '' })

      expect(prisma.admin.findMany.mock.calls[0][0].where).toEqual({ rol: 'OWNER' })
    })
  })

  describe('crear', () => {
    beforeEach(() => {
      tx.marca.findUnique.mockResolvedValue(MARCA)
      tx.admin.findFirst.mockResolvedValue(null) // el email está libre
      tx.admin.create.mockImplementation(({ data }) =>
        Promise.resolve(filaDueno({ id: 'owner-nuevo', email: data.email, debeCambiarPassword: data.debeCambiarPassword })),
      )
    })

    it('crea un OWNER en la marca con contraseña generada y temporal, y la devuelve una sola vez', async () => {
      // Act
      const creado = await servicio.crear('marca-1', { email: 'juan@laparrilla.com' }, ROOT_USER)

      // Assert
      const { data, select } = tx.admin.create.mock.calls[0][0]
      expect(data).toMatchObject({ email: 'juan@laparrilla.com', rol: 'OWNER', marcaId: 'marca-1', debeCambiarPassword: true })
      expect(creado.passwordTemporal).toHaveLength(12)
      expect(await bcrypt.compare(creado.passwordTemporal as string, data.passwordHash)).toBe(true)
      expect(select).not.toHaveProperty('passwordHash')
      nadaPorFuera()
    })

    it('la respuesta tiene exactamente las claves del dueño más passwordTemporal, y no el hash', async () => {
      const creado = await servicio.crear('marca-1', { email: 'juan@laparrilla.com' }, ROOT_USER)

      expect(Object.keys(creado).sort()).toEqual(['debeCambiarPassword', 'email', 'id', 'marca', 'passwordTemporal'])
      expect(serializar(creado)).not.toContain('HASH-QUE-NO-DEBE-SALIR')
      expect(serializar(creado)).not.toContain(tx.admin.create.mock.calls[0][0].data.passwordHash)
    })

    it('deja EXACTAMENTE un registro, con quién, qué, sobre qué y la marca', async () => {
      // Act
      await servicio.crear('marca-1', { email: 'juan@laparrilla.com' }, ROOT_USER)

      // Assert
      const filas = filasDelHistorial(tx)
      expect(filas).toHaveLength(1)
      expect(filas[0]).toMatchObject({
        actorTipo: 'ROOT',
        actorId: 'root-1',
        actorNombre: EMAIL_DEL_ROOT,
        accion: 'DUENO_CREAR',
        entidadTipo: 'OWNER',
        entidadId: 'owner-nuevo',
        entidadNombre: 'juan@laparrilla.com',
        marcaId: 'marca-1',
        marcaNombre: 'La Parrilla',
      })
      expect(filas[0].detalle).toEqual([
        { campo: 'Email', antes: null, despues: 'juan@laparrilla.com' },
        { campo: 'Marca', antes: null, despues: 'La Parrilla' },
        CAMBIO_PASSWORD.generada,
      ])
    })

    it('el registro se escribe después del cambio y con la misma transacción', async () => {
      await servicio.crear('marca-1', { email: 'juan@laparrilla.com' }, ROOT_USER)

      expect(tx.admin.create.mock.invocationCallOrder[0]).toBeLessThan(tx.historialRoot.create.mock.invocationCallOrder[0])
      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    })

    it('ni la contraseña ni el hash llegan al historial ni a ninguna consulta que no sea el alta de la cuenta', async () => {
      // Act
      const creado = await servicio.crear('marca-1', { email: 'juan@laparrilla.com' }, ROOT_USER)

      // Assert
      const { passwordHash } = tx.admin.create.mock.calls[0][0].data
      const historial = serializar(tx.historialRoot.create.mock.calls)
      expect(historial).not.toContain(creado.passwordTemporal as string)
      expect(historial).not.toContain(passwordHash)
      expect(historial).not.toMatch(/\$2[abxy]?\$/)
    })

    it('si ROOT elige la contraseña: se guarda, NO se devuelve, y el historial lo dice sin mostrarla', async () => {
      // Act
      const creado = await servicio.crear('marca-1', { email: 'juan@laparrilla.com', password: 'Caracol-Violeta-48' }, ROOT_USER)

      // Assert
      const { data } = tx.admin.create.mock.calls[0][0]
      expect(await bcrypt.compare('Caracol-Violeta-48', data.passwordHash)).toBe(true)
      expect(data.debeCambiarPassword).toBe(true)
      expect(creado.passwordTemporal).toBeNull()
      expect(serializar(creado)).not.toContain('Caracol-Violeta-48')
      expect(filasDelHistorial(tx)[0].detalle).toContainEqual(CAMBIO_PASSWORD.elegida)
      expect(serializar(tx.historialRoot.create.mock.calls)).not.toContain('Caracol-Violeta-48')
    })

    it('con una contraseña elegida débil responde 400 sin abrir la transacción', async () => {
      // Act
      const alta = servicio.crear('marca-1', { email: 'juan@laparrilla.com', password: 'corta' }, ROOT_USER)

      // Assert
      await expect(alta).rejects.toThrow(BadRequestException)
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('si la marca no existe responde 404 y no escribe nada', async () => {
      tx.marca.findUnique.mockResolvedValue(null)

      await expect(servicio.crear('m-999', { email: 'juan@laparrilla.com' }, ROOT_USER)).rejects.toThrow(new NotFoundException('Marca no encontrada'))

      expect(tx.admin.create).not.toHaveBeenCalled()
      expect(tx.historialRoot.create).not.toHaveBeenCalled()
    })

    it('acepta ids de marca que no son UUID, como m-001', async () => {
      await servicio.crear('m-001', { email: 'juan@laparrilla.com' }, ROOT_USER)

      expect(tx.marca.findUnique).toHaveBeenCalledWith({ where: { id: 'm-001' }, select: { id: true, nombre: true, activo: true } })
    })

    it('si la marca está dada de baja responde 409 y no escribe nada', async () => {
      tx.marca.findUnique.mockResolvedValue({ ...MARCA, activo: false })

      await expect(servicio.crear('marca-1', { email: 'juan@laparrilla.com' }, ROOT_USER)).rejects.toThrow(ConflictException)

      expect(tx.admin.create).not.toHaveBeenCalled()
      expect(tx.historialRoot.create).not.toHaveBeenCalled()
    })

    it.each([
      ['otra cuenta de admin', 'admin'],
      ['un mozo', 'mozo'],
      ['un cliente', 'cliente'],
    ])('si el email ya lo usa %s responde 409 y no escribe nada', async (_quien, tabla) => {
      // Arrange
      tx.admin.findFirst.mockResolvedValue(null)
      tx[tabla].findFirst.mockResolvedValue({ id: 'otro' })

      // Act
      const alta = servicio.crear('marca-1', { email: 'juan@laparrilla.com' }, ROOT_USER)

      // Assert
      await expect(alta).rejects.toThrow(ConflictException)
      expect(tx.admin.create).not.toHaveBeenCalled()
      expect(tx.historialRoot.create).not.toHaveBeenCalled()
    })

    it('si dos altas con el mismo email chocan en la base, responde 409 (no 500) y no registra nada', async () => {
      tx.admin.create.mockRejectedValue(errorDeClaveUnica())

      await expect(servicio.crear('marca-1', { email: 'juan@laparrilla.com' }, ROOT_USER)).rejects.toThrow(ConflictException)

      expect(tx.historialRoot.create).not.toHaveBeenCalled()
    })

    it('si la cuenta ROOT que actúa ya no existe (token vigente), responde 401 y no escribe nada', async () => {
      tx.admin.findUnique.mockResolvedValue(null)

      await expect(servicio.crear('marca-1', { email: 'juan@laparrilla.com' }, ROOT_USER)).rejects.toThrow(UnauthorizedException)

      expect(tx.admin.create).not.toHaveBeenCalled()
      expect(tx.historialRoot.create).not.toHaveBeenCalled()
    })

    it('si el historial no se puede escribir, el error sale (la transacción se revierte y el dueño no queda creado) y no se devuelve la contraseña', async () => {
      // Arrange
      tx.historialRoot.create.mockRejectedValue(new Error('sin espacio en disco'))

      // Act
      const alta = servicio.crear('marca-1', { email: 'juan@laparrilla.com' }, ROOT_USER)

      // Assert
      await expect(alta).rejects.toThrow('sin espacio en disco')
    })
  })

  describe('cambiarEmail', () => {
    beforeEach(() => {
      tx.admin.update.mockImplementation(({ data }) => Promise.resolve(filaDueno({ email: data.email })))
    })

    it('cambia el email, deja un registro con el antes y el después, y no toca la contraseña', async () => {
      // Arrange
      tx.admin.findFirst.mockResolvedValueOnce(filaDueno()).mockResolvedValueOnce(null)

      // Act
      const dueno = await servicio.cambiarEmail('owner-1', { email: 'administracion@laparrilla.com' }, ROOT_USER)

      // Assert
      expect(tx.admin.update.mock.calls[0][0].data).toEqual({ email: 'administracion@laparrilla.com' })
      expect(dueno.email).toBe('administracion@laparrilla.com')
      expect(Object.keys(dueno).sort()).toEqual(['debeCambiarPassword', 'email', 'id', 'marca'])
      const filas = filasDelHistorial(tx)
      expect(filas).toHaveLength(1)
      expect(filas[0]).toMatchObject({
        accion: 'DUENO_CAMBIAR_EMAIL',
        entidadTipo: 'OWNER',
        entidadId: 'owner-1',
        entidadNombre: 'administracion@laparrilla.com',
        marcaId: 'marca-1',
        actorNombre: EMAIL_DEL_ROOT,
      })
      expect(filas[0].detalle).toEqual([{ campo: 'Email', antes: 'juan@laparrilla.com', despues: 'administracion@laparrilla.com' }])
      nadaPorFuera()
    })

    it('solo actúa sobre cuentas OWNER: una de otro rol (GERENTE, ROOT) o inexistente responde 404', async () => {
      // Arrange
      tx.admin.findFirst.mockResolvedValueOnce(null)

      // Act
      const cambio = servicio.cambiarEmail('gerente-1', { email: 'otro@laparrilla.com' }, ROOT_USER)

      // Assert
      await expect(cambio).rejects.toThrow(new NotFoundException('Dueño no encontrado'))
      expect(tx.admin.findFirst.mock.calls[0][0].where).toEqual({ id: 'gerente-1', rol: 'OWNER' })
      expect(tx.admin.update).not.toHaveBeenCalled()
      expect(tx.historialRoot.create).not.toHaveBeenCalled()
    })

    it('con el mismo email no hace nada y no deja registro', async () => {
      tx.admin.findFirst.mockResolvedValueOnce(filaDueno())

      const dueno = await servicio.cambiarEmail('owner-1', { email: 'juan@laparrilla.com' }, ROOT_USER)

      expect(dueno.email).toBe('juan@laparrilla.com')
      expect(tx.admin.update).not.toHaveBeenCalled()
      expect(tx.historialRoot.create).not.toHaveBeenCalled()
    })

    it('si el email lo usa otra cuenta responde 409; la propia cuenta no cuenta como "otra"', async () => {
      // Arrange
      tx.admin.findFirst.mockResolvedValueOnce(filaDueno()).mockResolvedValueOnce({ id: 'otro' })

      // Act
      const cambio = servicio.cambiarEmail('owner-1', { email: 'ocupado@laparrilla.com' }, ROOT_USER)

      // Assert
      await expect(cambio).rejects.toThrow(ConflictException)
      expect(tx.admin.findFirst.mock.calls[1][0].where.id).toEqual({ not: 'owner-1' })
      expect(tx.admin.update).not.toHaveBeenCalled()
      expect(tx.historialRoot.create).not.toHaveBeenCalled()
    })

    it('si lo usa un mozo o un cliente responde 409', async () => {
      tx.admin.findFirst.mockResolvedValueOnce(filaDueno()).mockResolvedValueOnce(null)
      tx.mozo.findFirst.mockResolvedValue({ id: 'mozo-1' })

      await expect(servicio.cambiarEmail('owner-1', { email: 'mozo@laparrilla.com' }, ROOT_USER)).rejects.toThrow(ConflictException)
    })

    it('si choca en la base con la clave única responde 409', async () => {
      tx.admin.findFirst.mockResolvedValueOnce(filaDueno()).mockResolvedValueOnce(null)
      tx.admin.update.mockRejectedValue(errorDeClaveUnica())

      await expect(servicio.cambiarEmail('owner-1', { email: 'otro@laparrilla.com' }, ROOT_USER)).rejects.toThrow(ConflictException)
      expect(tx.historialRoot.create).not.toHaveBeenCalled()
    })

    it('si el historial falla, el error sale', async () => {
      tx.admin.findFirst.mockResolvedValueOnce(filaDueno()).mockResolvedValueOnce(null)
      tx.historialRoot.create.mockRejectedValue(new Error('sin espacio'))

      await expect(servicio.cambiarEmail('owner-1', { email: 'otro@laparrilla.com' }, ROOT_USER)).rejects.toThrow('sin espacio')
    })
  })

  describe('restablecerPassword', () => {
    beforeEach(() => {
      tx.admin.findFirst.mockResolvedValue(filaDueno())
      tx.admin.update.mockImplementation(({ data }) => Promise.resolve(filaDueno({ debeCambiarPassword: data.debeCambiarPassword })))
    })

    it('genera otra contraseña, la marca como temporal, cierra las sesiones renovables y la devuelve una sola vez', async () => {
      // Act
      const r = await servicio.restablecerPassword('owner-1', ROOT_USER)

      // Assert
      const { where, data } = tx.admin.update.mock.calls[0][0]
      expect(where).toEqual({ id: 'owner-1' })
      expect(data.debeCambiarPassword).toBe(true)
      expect(await bcrypt.compare(r.passwordTemporal as string, data.passwordHash)).toBe(true)
      expect(tx.refreshToken.updateMany.mock.calls[0][0].where).toEqual({ userId: 'owner-1', userTipo: 'admin', revokedAt: null })
      expect(Object.keys(r).sort()).toEqual(['debeCambiarPassword', 'email', 'id', 'marca', 'passwordTemporal'])
      nadaPorFuera()
    })

    it('deja un registro que dice "restablecida" sin la contraseña ni el hash', async () => {
      // Act
      const r = await servicio.restablecerPassword('owner-1', ROOT_USER)

      // Assert
      const filas = filasDelHistorial(tx)
      expect(filas).toHaveLength(1)
      expect(filas[0]).toMatchObject({ accion: 'DUENO_RESTABLECER', entidadId: 'owner-1', entidadNombre: 'juan@laparrilla.com', marcaNombre: 'La Parrilla' })
      expect(filas[0].detalle).toEqual([CAMBIO_PASSWORD.restablecida])
      const todo = serializar(tx.historialRoot.create.mock.calls)
      expect(todo).not.toContain(r.passwordTemporal as string)
      expect(todo).not.toContain(tx.admin.update.mock.calls[0][0].data.passwordHash)
    })

    it('dos restablecimientos dan contraseñas distintas', async () => {
      const a = await servicio.restablecerPassword('owner-1', ROOT_USER)
      const b = await servicio.restablecerPassword('owner-1', ROOT_USER)

      expect(a.passwordTemporal).not.toBe(b.passwordTemporal)
    })

    it('solo actúa sobre cuentas OWNER: otra cosa responde 404 y no cambia nada', async () => {
      tx.admin.findFirst.mockResolvedValue(null)

      await expect(servicio.restablecerPassword('root-2', ROOT_USER)).rejects.toThrow(NotFoundException)

      expect(tx.admin.findFirst.mock.calls[0][0].where).toEqual({ id: 'root-2', rol: 'OWNER' })
      expect(tx.admin.update).not.toHaveBeenCalled()
      expect(tx.refreshToken.updateMany).not.toHaveBeenCalled()
      expect(tx.historialRoot.create).not.toHaveBeenCalled()
    })

    it('si el historial falla, el error sale', async () => {
      tx.historialRoot.create.mockRejectedValue(new Error('sin espacio'))

      await expect(servicio.restablecerPassword('owner-1', ROOT_USER)).rejects.toThrow('sin espacio')
    })

    it('si la cuenta ROOT que actúa ya no existe responde 401', async () => {
      tx.admin.findUnique.mockResolvedValue(null)

      await expect(servicio.restablecerPassword('owner-1', ROOT_USER)).rejects.toThrow(UnauthorizedException)
      expect(tx.admin.update).not.toHaveBeenCalled()
    })
  })

  describe('eliminar', () => {
    beforeEach(() => {
      tx.admin.findFirst.mockResolvedValue(filaDueno())
      tx.admin.count.mockResolvedValue(1) // queda otro dueño en la marca
    })

    it('elimina la cuenta, cierra sus sesiones y deja un registro', async () => {
      // Act
      await servicio.eliminar('owner-1', ROOT_USER)

      // Assert
      expect(tx.admin.delete).toHaveBeenCalledWith({ where: { id: 'owner-1' } })
      expect(tx.refreshToken.updateMany.mock.calls[0][0].where).toEqual({ userId: 'owner-1', userTipo: 'admin', revokedAt: null })
      const filas = filasDelHistorial(tx)
      expect(filas).toHaveLength(1)
      expect(filas[0]).toMatchObject({
        accion: 'DUENO_ELIMINAR',
        entidadTipo: 'OWNER',
        entidadId: 'owner-1',
        entidadNombre: 'juan@laparrilla.com',
        marcaId: 'marca-1',
        actorNombre: EMAIL_DEL_ROOT,
      })
      expect(filas[0].detalle).toEqual([{ campo: 'Cuenta', antes: 'juan@laparrilla.com', despues: 'eliminada' }])
      nadaPorFuera()
    })

    it('cuenta a los otros dueños de la misma marca', async () => {
      await servicio.eliminar('owner-1', ROOT_USER)

      expect(tx.admin.count).toHaveBeenCalledWith({ where: { rol: 'OWNER', marcaId: 'marca-1', id: { not: 'owner-1' } } })
    })

    it('no elimina al único dueño de una marca activa: 409 y no cambia nada', async () => {
      // Arrange
      tx.admin.count.mockResolvedValue(0)

      // Act
      const baja = servicio.eliminar('owner-1', ROOT_USER)

      // Assert
      await expect(baja).rejects.toThrow(ConflictException)
      await expect(baja).rejects.toThrow(/único dueño de «La Parrilla»/)
      expect(tx.admin.delete).not.toHaveBeenCalled()
      expect(tx.refreshToken.updateMany).not.toHaveBeenCalled()
      expect(tx.historialRoot.create).not.toHaveBeenCalled()
    })

    it('si la marca está dada de baja, sí se puede eliminar al último dueño (sin contar)', async () => {
      // Arrange
      tx.admin.findFirst.mockResolvedValue(filaDueno({ marca: { ...MARCA, activo: false } }))
      tx.admin.count.mockResolvedValue(0)

      // Act
      await servicio.eliminar('owner-1', ROOT_USER)

      // Assert
      expect(tx.admin.count).not.toHaveBeenCalled()
      expect(tx.admin.delete).toHaveBeenCalledTimes(1)
      expect(filasDelHistorial(tx)).toHaveLength(1)
    })

    it('un dueño sin marca se puede eliminar y el registro no lleva marca', async () => {
      tx.admin.findFirst.mockResolvedValue(filaDueno({ marca: null }))

      await servicio.eliminar('owner-1', ROOT_USER)

      expect(tx.admin.delete).toHaveBeenCalledTimes(1)
      expect(filasDelHistorial(tx)[0]).toMatchObject({ marcaId: null, marcaNombre: null })
    })

    it('solo elimina cuentas OWNER: otra cosa (un ROOT, un GERENTE) responde 404', async () => {
      tx.admin.findFirst.mockResolvedValue(null)

      await expect(servicio.eliminar('root-2', ROOT_USER)).rejects.toThrow(NotFoundException)

      expect(tx.admin.findFirst.mock.calls[0][0].where).toEqual({ id: 'root-2', rol: 'OWNER' })
      expect(tx.admin.delete).not.toHaveBeenCalled()
    })

    it('corre en una transacción serializable (dos bajas simultáneas de los dos últimos dueños no pasan las dos)', async () => {
      await servicio.eliminar('owner-1', ROOT_USER)

      expect(prisma.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    })

    it('si el historial falla, el error sale (la transacción se revierte y la cuenta no se borra)', async () => {
      tx.historialRoot.create.mockRejectedValue(new Error('sin espacio'))

      await expect(servicio.eliminar('owner-1', ROOT_USER)).rejects.toThrow('sin espacio')
    })

    it('el registro se escribe después de borrar, con la misma transacción', async () => {
      await servicio.eliminar('owner-1', ROOT_USER)

      expect(tx.admin.delete.mock.invocationCallOrder[0]).toBeLessThan(tx.historialRoot.create.mock.invocationCallOrder[0])
    })
  })
})
