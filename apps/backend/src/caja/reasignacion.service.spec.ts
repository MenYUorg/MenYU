import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { accesoDeTest, CUENTAS, MUNDO } from '../test/acceso-de-test'
import { BaseDeCaja, baseDeCajaVacia, conectarBaseDeCaja } from '../test/caja-en-memoria'
import { comoPrisma, crearPrismaMock, PrismaMock } from '../test/prisma-mock'
import { MENSAJE_OPERACION_SIMULTANEA, MENSAJE_TURNO_CERRADO } from './conflictos'
import { ReasignacionService } from './reasignacion.service'

const REST = MUNDO.REST_1
const OTRO = MUNDO.REST_B

const p2002 = (modelName: string, target: string[]) =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test', meta: { modelName, target } })
const p2034 = () => new Prisma.PrismaClientKnownRequestError('write conflict', { code: 'P2034', clientVersion: 'test' })

const errorDe = async (promesa: Promise<unknown>) => {
  const e = await promesa.then(
    () => undefined,
    (err: unknown) => err,
  )
  if (e === undefined) throw new Error('se esperaba un error')
  return e as Error
}

describe('ReasignacionService', () => {
  let prisma: PrismaMock
  let base: BaseDeCaja
  let service: ReasignacionService

  const ANTERIORES = [
    { turnoId: 't1', mesaId: 'mesa-1', mozoId: 'ana' },
    { turnoId: 't1', mesaId: 'mesa-2', mozoId: 'ana' },
  ]
  const reasignar = (asignaciones: { mesaId: string; mozoId: string }[], cuenta = CUENTAS.JEFE_SALON, turnoId = 't1') =>
    service.reasignar(turnoId, { asignaciones }, cuenta)
  const asignacionesDe = (turnoId: string) => base.asignaciones.filter((a) => a.turnoId === turnoId)

  beforeEach(() => {
    prisma = crearPrismaMock()
    base = baseDeCajaVacia()
    base.turnos.push(
      { id: 't1', restauranteId: REST, abiertoPorUsuarioId: 'u', abiertoEn: new Date(), cerradoEn: null, observaciones: null },
      { id: 't-cerrado', restauranteId: REST, abiertoPorUsuarioId: 'u', abiertoEn: new Date(), cerradoEn: new Date(), observaciones: null },
      { id: 't-ajeno', restauranteId: OTRO, abiertoPorUsuarioId: 'u', abiertoEn: new Date(), cerradoEn: null, observaciones: null },
    )
    base.mesas.push(
      { id: 'mesa-1', restauranteId: REST, numero: '1', activo: true },
      { id: 'mesa-2', restauranteId: REST, numero: '2', activo: true },
      { id: 'mesa-3', restauranteId: REST, numero: '3', activo: true },
      { id: 'mesa-de-baja', restauranteId: REST, numero: '9', activo: false },
      { id: 'mesa-ajena', restauranteId: OTRO, numero: '1', activo: true },
    )
    base.mozos.push(
      { id: 'ana', restauranteId: REST, nombre: 'Ana', activo: true, usuarioId: 'usuario-ana' },
      { id: 'beto', restauranteId: REST, nombre: 'Beto', activo: true, usuarioId: 'usuario-beto' },
      { id: 'mozo-de-baja', restauranteId: REST, nombre: 'Dado de baja', activo: false, usuarioId: 'usuario-x' },
      { id: 'mozo-sin-cuenta', restauranteId: REST, nombre: 'Sin cuenta', activo: true, usuarioId: null },
      { id: 'mozo-ajeno', restauranteId: OTRO, nombre: 'Ajeno', activo: true, usuarioId: 'usuario-ajeno' },
    )
    base.asignaciones.push(...ANTERIORES.map((a) => ({ ...a })), { turnoId: 't-cerrado', mesaId: 'mesa-1', mozoId: 'beto' })
    conectarBaseDeCaja(prisma, base)
    service = new ReasignacionService(comoPrisma(prisma), accesoDeTest())
  })

  it('reemplaza la lista entera: lo viejo se borra, queda exactamente lo nuevo, y devuelve el turno', async () => {
    const { turno } = await reasignar([
      { mesaId: 'mesa-2', mozoId: 'beto' },
      { mesaId: 'mesa-3', mozoId: 'beto' },
    ])

    expect(asignacionesDe('t1')).toEqual([
      { turnoId: 't1', mesaId: 'mesa-2', mozoId: 'beto' },
      { turnoId: 't1', mesaId: 'mesa-3', mozoId: 'beto' },
    ])
    expect(turno.asignaciones).toEqual([
      { mesaId: 'mesa-2', mesaNumero: '2', mozoId: 'beto', mozoNombre: 'Beto' },
      { mesaId: 'mesa-3', mesaNumero: '3', mozoId: 'beto', mozoNombre: 'Beto' },
    ])
    // Las de otro turno no se tocan.
    expect(asignacionesDe('t-cerrado')).toHaveLength(1)
  })

  it('con [] el turno queda sin asignaciones', async () => {
    const { turno } = await reasignar([])

    expect(asignacionesDe('t1')).toEqual([])
    expect(turno.asignaciones).toEqual([])
    expect(prisma.asignacionTurno.createMany).not.toHaveBeenCalled()
  })

  it('corre en una transacción serializable', async () => {
    await reasignar([])

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    })
  })

  it('un turno que no existe es 404', async () => {
    await expect(reasignar([], CUENTAS.OWNER_A, 'no-existe')).rejects.toThrow(NotFoundException)
  })

  it.each([
    ['el MOZO', CUENTAS.MOZO],
    ['COCINA', CUENTAS.COCINA],
    ['el OWNER de otra marca', CUENTAS.OWNER_B],
  ])('%s recibe 403 y las asignaciones no cambian', async (_caso, cuenta) => {
    await expect(reasignar([], cuenta)).rejects.toThrow(ForbiddenException)
    expect(asignacionesDe('t1')).toEqual(ANTERIORES)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('un turno de otro restaurante es 403 para quien no es de ahí', async () => {
    await expect(reasignar([], CUENTAS.GERENTE, 't-ajeno')).rejects.toThrow(ForbiddenException)
  })

  it('un turno cerrado es 409 y sus asignaciones no cambian', async () => {
    const error = await errorDe(reasignar([], CUENTAS.OWNER_A, 't-cerrado'))

    expect(error).toBeInstanceOf(ConflictException)
    expect(error.message).toBe(MENSAJE_TURNO_CERRADO)
    expect(asignacionesDe('t-cerrado')).toHaveLength(1)
    expect(prisma.asignacionTurno.deleteMany).not.toHaveBeenCalled()
  })

  it.each([
    ['una mesa de otro restaurante', { mesaId: 'mesa-ajena', mozoId: 'ana' }, 'Alguna de las mesas no existe o no es de este restaurante'],
    ['una mesa que no existe', { mesaId: 'mesa-x', mozoId: 'ana' }, 'Alguna de las mesas no existe o no es de este restaurante'],
    ['una mesa dada de baja', { mesaId: 'mesa-de-baja', mozoId: 'ana' }, 'La mesa 9 está dada de baja'],
    ['un mozo de otro restaurante', { mesaId: 'mesa-3', mozoId: 'mozo-ajeno' }, 'Alguno de los mozos no existe o no es de este restaurante'],
    ['un mozo dado de baja', { mesaId: 'mesa-3', mozoId: 'mozo-de-baja' }, 'El mozo «Dado de baja» está dado de baja'],
    ['un mozo sin cuenta', { mesaId: 'mesa-3', mozoId: 'mozo-sin-cuenta' }, 'El mozo «Sin cuenta» no tiene cuenta: no se le pueden asignar mesas'],
  ])('%s es 400 y las asignaciones anteriores quedan intactas', async (_caso, asignacion, mensaje) => {
    const error = await errorDe(reasignar([{ mesaId: 'mesa-1', mozoId: 'beto' }, asignacion]))

    expect(error).toBeInstanceOf(BadRequestException)
    expect(error.message).toBe(mensaje)
    expect(asignacionesDe('t1')).toEqual(ANTERIORES)
    expect(prisma.asignacionTurno.deleteMany).not.toHaveBeenCalled()
  })

  it('todo pasa por el cliente de la transacción', async () => {
    // El mock de $transaction normal le pasa al callback el mismo objeto de afuera; acá se arma uno distinto (sobre la
    // misma base) para ver qué se lee y escribe adentro de la transacción y qué no.
    const tx = crearPrismaMock()
    conectarBaseDeCaja(tx, base)
    prisma.$transaction.mockImplementationOnce((fn: (cliente: PrismaMock) => unknown) => fn(tx))

    await reasignar([{ mesaId: 'mesa-3', mozoId: 'beto' }])

    expect(tx.asignacionTurno.deleteMany).toHaveBeenCalledTimes(1)
    expect(tx.asignacionTurno.createMany).toHaveBeenCalledTimes(1)
    expect(tx.mesa.findMany).toHaveBeenCalled()
    expect(tx.mozo.findMany).toHaveBeenCalled()
    expect(tx.turno.findUniqueOrThrow).toHaveBeenCalled()
    expect(prisma.turno.findUnique).toHaveBeenCalledTimes(1)
    expect(prisma.asignacionTurno.deleteMany).not.toHaveBeenCalled()
    expect(prisma.asignacionTurno.createMany).not.toHaveBeenCalled()
    expect(prisma.mesa.findMany).not.toHaveBeenCalled()
    expect(prisma.mozo.findMany).not.toHaveBeenCalled()
    expect(prisma.turno.findUniqueOrThrow).not.toHaveBeenCalled()
  })

  describe('los choques', () => {
    it.each([
      ['el P2002 de la asignación', () => p2002('AsignacionTurno', ['turno_id', 'mesa_id'])],
      ['un P2034 que sobrevive al reintento', p2034],
    ])('%s es el 409 genérico', async (_caso, crearError) => {
      prisma.$transaction.mockRejectedValue(crearError())

      const error = await errorDe(reasignar([]))
      expect(error).toBeInstanceOf(ConflictException)
      expect(error.message).toBe(MENSAJE_OPERACION_SIMULTANEA)
    })

    it('el P2034 se reintenta una vez: dos llamadas a $transaction', async () => {
      prisma.$transaction.mockRejectedValue(p2034())

      await errorDe(reasignar([]))
      expect(prisma.$transaction).toHaveBeenCalledTimes(2)
    })

    it('otro error pasa tal cual', async () => {
      const otro = p2002('Turno', ['restaurante_id'])
      prisma.$transaction.mockRejectedValue(otro)

      await expect(reasignar([])).rejects.toBe(otro)
    })
  })
})
