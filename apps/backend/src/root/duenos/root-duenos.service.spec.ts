import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { InvitacionesService } from '../../auth/invitaciones/invitaciones.service'
import { PrismaMock, comoPrisma } from '../../test/prisma-mock'
import { EMAIL_DEL_ROOT, ROOT_USER, armarTransaccionRoot, filasDelHistorial, serializar } from '../../test/root-mock'
import { HistorialRootService } from '../historial/historial-root.service'
import { RootDuenosService } from './root-duenos.service'

const MARCA = { id: 'marca-1', nombre: 'La Parrilla', activo: true }

// Una membresía OWNER como la devolvería la base, con campos de más (que el servicio no tiene que dejar pasar).
const filaDueno = (extra: Record<string, unknown> = {}) => ({
  id: 'membresia-1',
  rol: 'OWNER',
  marcaId: 'marca-1',
  usuario: { id: 'usuario-juan', email: 'juan@laparrilla.com', nombre: 'Juan', activo: true, supabaseUserId: 'SUPABASE-ID-QUE-NO-SALE' },
  marca: MARCA,
  ...extra,
})

describe('RootDuenosService', () => {
  let prisma: PrismaMock
  let tx: PrismaMock
  let invitaciones: { invitar: jest.Mock }
  let servicio: RootDuenosService

  beforeEach(() => {
    ;({ prisma, tx } = armarTransaccionRoot())
    invitaciones = { invitar: jest.fn().mockResolvedValue({ usuarioId: 'usuario-juan', membresiaId: 'membresia-1', invitacionEnviada: true }) }
    servicio = new RootDuenosService(
      comoPrisma(prisma),
      new HistorialRootService(comoPrisma(prisma)),
      invitaciones as unknown as InvitacionesService,
    )
  })

  describe('listar', () => {
    it('trae solo membresías OWNER, con un select explícito (sin include) y ordenadas por email y marca', async () => {
      // Arrange
      prisma.membresia.findMany.mockResolvedValue([filaDueno()])

      // Act
      const lista = await servicio.listar({})

      // Assert
      const args = prisma.membresia.findMany.mock.calls[0][0]
      expect(args.where).toEqual({ rol: 'OWNER' })
      expect(args.select).toEqual({
        id: true,
        usuario: { select: { id: true, email: true, nombre: true, activo: true } },
        marca: { select: { id: true, nombre: true, activo: true } },
      })
      expect(args).not.toHaveProperty('include')
      expect(args.orderBy).toEqual([{ usuario: { email: 'asc' } }, { marca: { nombre: 'asc' } }])
      expect(lista).toHaveLength(1)
    })

    it('devuelve exactamente la membresía, la cuenta y la marca {id, nombre, activo}: nada de lo que traiga la fila de más', async () => {
      // Arrange
      prisma.membresia.findMany.mockResolvedValue([filaDueno({ marca: { ...MARCA, logoUrl: 'x', slug: 'la-parrilla' } })])

      // Act
      const [dueno] = await servicio.listar({})

      // Assert
      expect(dueno).toEqual({
        membresiaId: 'membresia-1',
        usuarioId: 'usuario-juan',
        email: 'juan@laparrilla.com',
        nombre: 'Juan',
        activo: true,
        marca: { id: 'marca-1', nombre: 'La Parrilla', activo: true },
      })
      expect(serializar(dueno)).not.toContain('SUPABASE-ID-QUE-NO-SALE')
    })

    it('una membresía sin marca (no debería pasar: lo impide un CHECK) figura con marca null', async () => {
      prisma.membresia.findMany.mockResolvedValue([filaDueno({ marca: null })])

      const [dueno] = await servicio.listar({})

      expect(dueno.marca).toBeNull()
    })

    it('q busca por el email de la cuenta o por el nombre de la marca, sin distinguir mayúsculas', async () => {
      // Arrange
      prisma.membresia.findMany.mockResolvedValue([])

      // Act
      await servicio.listar({ q: 'fiore' })

      // Assert
      expect(prisma.membresia.findMany.mock.calls[0][0].where).toEqual({
        rol: 'OWNER',
        OR: [
          { usuario: { is: { email: { contains: 'fiore', mode: 'insensitive' } } } },
          { marca: { is: { nombre: { contains: 'fiore', mode: 'insensitive' } } } },
        ],
      })
    })

    it('q vacía no filtra', async () => {
      prisma.membresia.findMany.mockResolvedValue([])

      await servicio.listar({ q: '' })

      expect(prisma.membresia.findMany.mock.calls[0][0].where).toEqual({ rol: 'OWNER' })
    })
  })

  describe('invitar', () => {
    it('es una invitación OWNER a la marca, con la cuenta ROOT que invita (ahí se valida la marca y se registra)', async () => {
      // Act
      const creada = await servicio.invitar('m-001', { email: 'juan@laparrilla.com', nombre: 'Juan' }, ROOT_USER)

      // Assert
      expect(invitaciones.invitar).toHaveBeenCalledWith({ email: 'juan@laparrilla.com', nombre: 'Juan', rol: 'OWNER', marcaId: 'm-001' }, ROOT_USER)
      expect(creada).toEqual({ usuarioId: 'usuario-juan', membresiaId: 'membresia-1', invitacionEnviada: true })
    })

    it('los errores de la invitación salen tal cual (404 si la marca no existe, 409 si está de baja)', async () => {
      invitaciones.invitar.mockRejectedValue(new ConflictException('La marca está dada de baja'))

      await expect(servicio.invitar('marca-1', { email: 'juan@laparrilla.com', nombre: 'Juan' }, ROOT_USER)).rejects.toThrow(
        new ConflictException('La marca está dada de baja'),
      )
    })
  })

  describe('quitar', () => {
    beforeEach(() => {
      tx.membresia.findFirst.mockResolvedValue(filaDueno())
      tx.membresia.count.mockResolvedValue(1) // queda otro dueño en la marca
    })

    it('borra la membresía (la cuenta queda) y deja un registro con la cuenta y la marca', async () => {
      // Act
      await servicio.quitar('membresia-1', ROOT_USER)

      // Assert
      expect(tx.membresia.delete).toHaveBeenCalledWith({ where: { id: 'membresia-1' } })
      expect(tx.usuario.delete).not.toHaveBeenCalled()
      expect(tx.usuario.update).not.toHaveBeenCalled()
      expect(filasDelHistorial(tx)).toEqual([
        {
          actorTipo: 'ROOT',
          actorId: ROOT_USER.id,
          actorNombre: EMAIL_DEL_ROOT,
          accion: 'DUENO_QUITAR',
          entidadTipo: 'OWNER',
          entidadId: 'usuario-juan',
          entidadNombre: 'juan@laparrilla.com',
          marcaId: 'marca-1',
          marcaNombre: 'La Parrilla',
          detalle: [{ campo: 'Dueño de', antes: 'La Parrilla', despues: null }],
        },
      ])
      expect(prisma.membresia.delete).not.toHaveBeenCalled()
      expect(prisma.historialRoot.create).not.toHaveBeenCalled()
    })

    it('cuenta a los otros dueños de la misma marca', async () => {
      await servicio.quitar('membresia-1', ROOT_USER)

      expect(tx.membresia.count).toHaveBeenCalledWith({ where: { rol: 'OWNER', marcaId: 'marca-1', id: { not: 'membresia-1' } } })
    })

    it('no quita al único dueño de una marca activa: 409 y no cambia nada', async () => {
      // Arrange
      tx.membresia.count.mockResolvedValue(0)

      // Act
      const quita = servicio.quitar('membresia-1', ROOT_USER)

      // Assert
      await expect(quita).rejects.toThrow(ConflictException)
      await expect(quita).rejects.toThrow(/único dueño de «La Parrilla»/)
      expect(tx.membresia.delete).not.toHaveBeenCalled()
      expect(tx.historialRoot.create).not.toHaveBeenCalled()
    })

    it('si la marca está dada de baja, sí se puede quitar al último dueño (sin contar)', async () => {
      // Arrange
      tx.membresia.findFirst.mockResolvedValue(filaDueno({ marca: { ...MARCA, activo: false } }))
      tx.membresia.count.mockResolvedValue(0)

      // Act
      await servicio.quitar('membresia-1', ROOT_USER)

      // Assert
      expect(tx.membresia.count).not.toHaveBeenCalled()
      expect(tx.membresia.delete).toHaveBeenCalledTimes(1)
      expect(filasDelHistorial(tx)).toHaveLength(1)
    })

    it('una membresía sin marca se quita y el registro no lleva marca', async () => {
      tx.membresia.findFirst.mockResolvedValue(filaDueno({ marca: null }))

      await servicio.quitar('membresia-1', ROOT_USER)

      expect(tx.membresia.delete).toHaveBeenCalledTimes(1)
      expect(filasDelHistorial(tx)[0]).toMatchObject({ marcaId: null, marcaNombre: null })
    })

    it('solo quita membresías OWNER: la de un GERENTE o una que no existe responde 404', async () => {
      tx.membresia.findFirst.mockResolvedValue(null)

      await expect(servicio.quitar('membresia-gerente', ROOT_USER)).rejects.toThrow(new NotFoundException('Dueño no encontrado'))

      expect(tx.membresia.findFirst.mock.calls[0][0].where).toEqual({ id: 'membresia-gerente', rol: 'OWNER' })
      expect(tx.membresia.delete).not.toHaveBeenCalled()
    })

    it('corre en una transacción serializable (dos quitas simultáneas de los dos últimos dueños no pasan las dos)', async () => {
      await servicio.quitar('membresia-1', ROOT_USER)

      expect(prisma.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    })

    it('si la cuenta que actúa ya no es ROOT, responde 401 sin buscar ni borrar nada', async () => {
      tx.usuario.findUnique.mockResolvedValue(null)

      await expect(servicio.quitar('membresia-1', ROOT_USER)).rejects.toThrow(UnauthorizedException)

      expect(tx.membresia.findFirst).not.toHaveBeenCalled()
      expect(tx.membresia.delete).not.toHaveBeenCalled()
    })

    it('si el historial falla, el error sale (la transacción se revierte y la membresía no se borra)', async () => {
      tx.historialRoot.create.mockRejectedValue(new Error('sin espacio'))

      await expect(servicio.quitar('membresia-1', ROOT_USER)).rejects.toThrow('sin espacio')
    })

    it('el registro se escribe después de borrar, con la misma transacción', async () => {
      await servicio.quitar('membresia-1', ROOT_USER)

      expect(tx.membresia.delete.mock.invocationCallOrder[0]).toBeLessThan(tx.historialRoot.create.mock.invocationCallOrder[0])
    })
  })
})
