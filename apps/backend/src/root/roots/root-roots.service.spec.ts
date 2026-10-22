import { BadGatewayException, ConflictException, UnauthorizedException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { InvitacionesService } from '../../auth/invitaciones/invitaciones.service'
import { PrismaMock, comoPrisma } from '../../test/prisma-mock'
import { EMAIL_DEL_ROOT, ROOT_USER, armarTransaccionRoot, filasDelHistorial, serializar } from '../../test/root-mock'
import { HistorialRootService } from '../historial/historial-root.service'
import { MENSAJE_EMAIL_CON_CUENTA, RootRootsService } from './root-roots.service'

const errorDeClaveUnica = () => new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' })

// Un Usuario ROOT como lo devolvería la base, con campos de más (que el servicio no tiene que dejar pasar).
const filaRoot = (extra: Record<string, unknown> = {}) => ({
  id: 'usuario-bruno',
  email: 'bruno@ejemplo.com',
  nombre: 'Bruno',
  activo: true,
  esRoot: true,
  supabaseUserId: 'SUPABASE-ID-QUE-NO-SALE',
  ...extra,
})

const CUENTA_DE_SUPABASE = { id: '6f1c2a40-7777-4a1b-9c3d-0000000000c1', email: 'carla@ejemplo.com' }
const CARLA = { email: 'carla@ejemplo.com', nombre: 'Carla' }

describe('RootRootsService', () => {
  let prisma: PrismaMock
  let tx: PrismaMock
  let invitaciones: { cuentaDeSupabase: jest.Mock }
  let servicio: RootRootsService

  beforeEach(() => {
    ;({ prisma, tx } = armarTransaccionRoot())
    invitaciones = { cuentaDeSupabase: jest.fn().mockResolvedValue({ cuenta: CUENTA_DE_SUPABASE, invitacionEnviada: true }) }
    servicio = new RootRootsService(
      comoPrisma(prisma),
      new HistorialRootService(comoPrisma(prisma)),
      invitaciones as unknown as InvitacionesService,
    )
    prisma.usuario.findUnique.mockResolvedValue(null) // el email no tiene cuenta en MenYU
    tx.usuario.create.mockResolvedValue({ id: 'usuario-carla', email: 'carla@ejemplo.com' })
  })

  /** Nada se escribió con el cliente suelto: todo fue por la transacción. */
  const nadaPorFuera = () => {
    expect(prisma.usuario.create).not.toHaveBeenCalled()
    expect(prisma.usuario.update).not.toHaveBeenCalled()
    expect(prisma.historialRoot.create).not.toHaveBeenCalled()
  }

  describe('listar', () => {
    it('trae los Usuario con esRoot, con un select explícito, y marca la propia', async () => {
      // Arrange
      prisma.usuario.findMany.mockResolvedValue([filaRoot({ id: ROOT_USER.id, email: EMAIL_DEL_ROOT, nombre: 'Ana' }), filaRoot()])

      // Act
      const lista = await servicio.listar(ROOT_USER)

      // Assert
      const args = prisma.usuario.findMany.mock.calls[0][0]
      expect(args.where).toEqual({ esRoot: true })
      expect(args.select).toEqual({ id: true, email: true, nombre: true, activo: true })
      expect(args.orderBy).toEqual({ email: 'asc' })
      expect(lista.map((c) => [c.email, c.esPropia])).toEqual([[EMAIL_DEL_ROOT, true], ['bruno@ejemplo.com', false]])
    })

    it('devuelve exactamente id, email, nombre, activo y esPropia', async () => {
      prisma.usuario.findMany.mockResolvedValue([filaRoot({ activo: false })])

      const [cuenta] = await servicio.listar(ROOT_USER)

      expect(cuenta).toEqual({ id: 'usuario-bruno', email: 'bruno@ejemplo.com', nombre: 'Bruno', activo: false, esPropia: false })
      expect(serializar(cuenta)).not.toContain('SUPABASE-ID-QUE-NO-SALE')
    })
  })

  describe('invitar', () => {
    it('primero la invitación de Supabase y después, en una transacción, el Usuario con esRoot y un registro', async () => {
      // Act
      const invitada = await servicio.invitar(CARLA, ROOT_USER)

      // Assert
      expect(invitada).toEqual({ usuarioId: 'usuario-carla', email: 'carla@ejemplo.com', invitacionEnviada: true })
      expect(invitaciones.cuentaDeSupabase).toHaveBeenCalledWith('carla@ejemplo.com')
      expect(invitaciones.cuentaDeSupabase.mock.invocationCallOrder[0]).toBeLessThan(prisma.$transaction.mock.invocationCallOrder[0])
      expect(tx.usuario.create).toHaveBeenCalledWith({
        data: { supabaseUserId: CUENTA_DE_SUPABASE.id, email: 'carla@ejemplo.com', nombre: 'Carla', esRoot: true },
        select: { id: true, email: true },
      })
      expect(filasDelHistorial(tx)).toEqual([
        {
          actorTipo: 'ROOT',
          actorId: ROOT_USER.id,
          actorNombre: EMAIL_DEL_ROOT,
          accion: 'ROOT_INVITAR',
          entidadTipo: 'ROOT',
          entidadId: 'usuario-carla',
          entidadNombre: 'carla@ejemplo.com',
          marcaId: null,
          marcaNombre: null,
          detalle: [
            { campo: 'Cuenta ROOT', antes: null, despues: 'carla@ejemplo.com' },
            { campo: 'Invitación', antes: null, despues: 'mail enviado' },
          ],
        },
      ])
      nadaPorFuera()
    })

    it('guarda el email que devuelve Supabase, en minúscula', async () => {
      invitaciones.cuentaDeSupabase.mockResolvedValue({ cuenta: { ...CUENTA_DE_SUPABASE, email: 'Carla@Ejemplo.com' }, invitacionEnviada: true })

      await servicio.invitar(CARLA, ROOT_USER)

      expect(tx.usuario.create.mock.calls[0][0].data.email).toBe('carla@ejemplo.com')
    })

    it('una cuenta de Supabase ya confirmada se usa sin mail, y el registro lo dice', async () => {
      invitaciones.cuentaDeSupabase.mockResolvedValue({ cuenta: CUENTA_DE_SUPABASE, invitacionEnviada: false })

      const invitada = await servicio.invitar(CARLA, ROOT_USER)

      expect(invitada.invitacionEnviada).toBe(false)
      expect(filasDelHistorial(tx)[0].detalle[1]).toEqual({ campo: 'Invitación', antes: null, despues: 'ya tenía cuenta: no se le mandó mail' })
    })

    it('un email que ya es de un Usuario (también el propio) responde 409 sin tocar Supabase: promover es del script', async () => {
      // Arrange
      prisma.usuario.findUnique.mockResolvedValue({ id: 'usuario-carla' })

      // Act
      const alta = servicio.invitar(CARLA, ROOT_USER)

      // Assert
      await expect(alta).rejects.toThrow(new ConflictException(MENSAJE_EMAIL_CON_CUENTA))
      expect(prisma.usuario.findUnique).toHaveBeenCalledWith({ where: { email: 'carla@ejemplo.com' }, select: { id: true } })
      expect(invitaciones.cuentaDeSupabase).not.toHaveBeenCalled()
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('si choca con la clave única (dos invitaciones a la vez), 409 y no 500', async () => {
      tx.usuario.create.mockRejectedValue(errorDeClaveUnica())

      await expect(servicio.invitar(CARLA, ROOT_USER)).rejects.toThrow(new ConflictException(MENSAJE_EMAIL_CON_CUENTA))
    })

    it('un error de Supabase sale tal cual y no se abre la transacción', async () => {
      invitaciones.cuentaDeSupabase.mockRejectedValue(new BadGatewayException('Supabase no pudo procesar la invitación'))

      await expect(servicio.invitar(CARLA, ROOT_USER)).rejects.toThrow(BadGatewayException)
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('si la cuenta que invita dejó de ser ROOT, responde 401 y no crea nada', async () => {
      tx.usuario.findUnique.mockResolvedValue({ id: ROOT_USER.id, email: EMAIL_DEL_ROOT, esRoot: false, activo: true })

      await expect(servicio.invitar(CARLA, ROOT_USER)).rejects.toThrow(UnauthorizedException)
      expect(tx.usuario.create).not.toHaveBeenCalled()
      nadaPorFuera()
    })

    it('si el historial falla, el error sale (la transacción se revierte y la cuenta no queda)', async () => {
      tx.historialRoot.create.mockRejectedValue(new Error('sin espacio'))

      await expect(servicio.invitar(CARLA, ROOT_USER)).rejects.toThrow('sin espacio')
      nadaPorFuera()
    })
  })

  // Decisión 15: no hay forma de borrar una cuenta ROOT, quitarle el ROOT ni cambiarle la contraseña desde la API.
  it('el servicio solo sabe listar e invitar', () => {
    const metodos = Object.getOwnPropertyNames(RootRootsService.prototype).filter((m) => m !== 'constructor')

    expect(metodos.sort()).toEqual(['invitar', 'listar'])
  })
})
