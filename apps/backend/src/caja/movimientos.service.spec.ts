import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { accesoDeTest, CUENTAS, MUNDO } from '../test/acceso-de-test'
import { BaseDeCaja, baseDeCajaVacia, conectarBaseDeCaja } from '../test/caja-en-memoria'
import { comoPrisma, crearPrismaMock, PrismaMock } from '../test/prisma-mock'
import { MENSAJE_OPERACION_SIMULTANEA, MENSAJE_TURNO_CERRADO } from './conflictos'
import { RegistrarMovimientoDto } from './dto/registrar-movimiento.dto'
import { MENSAJE_CAJA_NO_ABIERTA, MovimientosService } from './movimientos.service'

const REST = MUNDO.REST_1

const p2034 = () => new Prisma.PrismaClientKnownRequestError('write conflict', { code: 'P2034', clientVersion: 'test' })

const errorDe = async (promesa: Promise<unknown>) => {
  const e = await promesa.then(
    () => undefined,
    (err: unknown) => err,
  )
  if (e === undefined) throw new Error('se esperaba un error')
  return e as Error
}

describe('MovimientosService', () => {
  let prisma: PrismaMock
  let base: BaseDeCaja
  let service: MovimientosService

  const EGRESO: RegistrarMovimientoDto = { cajaId: 'caja-1', tipo: 'EGRESO', monto: 1500.25, motivo: 'Compra de hielo' }
  const registrar = (dto: RegistrarMovimientoDto = EGRESO, cuenta = CUENTAS.JEFE_SALON, turnoId = 't1') =>
    service.registrar(turnoId, dto, cuenta)

  beforeEach(() => {
    prisma = crearPrismaMock()
    base = baseDeCajaVacia()
    base.usuarios[CUENTAS.JEFE_SALON.id] = 'Jefa de salón'
    base.cajas.push(
      { id: 'caja-1', restauranteId: REST, nombre: 'Principal', activa: true },
      { id: 'caja-2', restauranteId: REST, nombre: 'Barra', activa: true },
    )
    base.turnos.push(
      { id: 't1', restauranteId: REST, abiertoPorUsuarioId: 'u', abiertoEn: new Date(), cerradoEn: null, observaciones: null },
      { id: 't-cerrado', restauranteId: REST, abiertoPorUsuarioId: 'u', abiertoEn: new Date(), cerradoEn: new Date(), observaciones: null },
      { id: 't-ajeno', restauranteId: MUNDO.REST_B, abiertoPorUsuarioId: 'u', abiertoEn: new Date(), cerradoEn: null, observaciones: null },
    )
    base.turnoCajas.push(
      { id: 'ap-1', turnoId: 't1', cajaId: 'caja-1', fondoInicial: new Prisma.Decimal(0), abiertoEn: new Date() },
      { id: 'ap-cerrada', turnoId: 't-cerrado', cajaId: 'caja-1', fondoInicial: new Prisma.Decimal(0), abiertoEn: new Date() },
    )
    conectarBaseDeCaja(prisma, base)
    service = new MovimientosService(comoPrisma(prisma), accesoDeTest())
  })

  it('registra el movimiento en la apertura de la caja, a nombre de la cuenta, y lo devuelve con el monto como number', async () => {
    const { movimiento } = await registrar()

    expect(base.movimientos).toEqual([
      expect.objectContaining({
        turnoCajaId: 'ap-1',
        tipo: 'EGRESO',
        monto: new Prisma.Decimal('1500.25'),
        motivo: 'Compra de hielo',
        usuarioId: CUENTAS.JEFE_SALON.id,
      }),
    ])
    expect(movimiento).toEqual({
      id: base.movimientos[0].id,
      cajaId: 'caja-1',
      cajaNombre: 'Principal',
      tipo: 'EGRESO',
      monto: 1500.25,
      motivo: 'Compra de hielo',
      usuario: { id: CUENTAS.JEFE_SALON.id, nombre: 'Jefa de salón' },
      createdAt: base.movimientos[0].createdAt,
    })
  })

  it('corre en una transacción serializable', async () => {
    await registrar()

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    })
  })

  it('un turno que no existe es 404', async () => {
    await expect(registrar(EGRESO, CUENTAS.OWNER_A, 'no-existe')).rejects.toThrow(NotFoundException)
  })

  it.each([
    ['el MOZO', CUENTAS.MOZO, 't1'],
    ['COCINA', CUENTAS.COCINA, 't1'],
    ['el OWNER de otra marca', CUENTAS.OWNER_B, 't1'],
    ['el GERENTE, con un turno de otro restaurante', CUENTAS.GERENTE, 't-ajeno'],
  ])('%s recibe 403 y no se registra nada', async (_caso, cuenta, turnoId) => {
    await expect(registrar(EGRESO, cuenta, turnoId)).rejects.toThrow(ForbiddenException)
    expect(base.movimientos).toEqual([])
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('un turno cerrado es 409 y no se registra nada', async () => {
    const error = await errorDe(registrar(EGRESO, CUENTAS.OWNER_A, 't-cerrado'))

    expect(error).toBeInstanceOf(ConflictException)
    expect(error.message).toBe(MENSAJE_TURNO_CERRADO)
    expect(base.movimientos).toEqual([])
  })

  it('una caja que no está abierta en el turno es 400 y no se registra nada', async () => {
    const error = await errorDe(registrar({ ...EGRESO, cajaId: 'caja-2' }))

    expect(error).toBeInstanceOf(BadRequestException)
    expect(error.message).toBe(MENSAJE_CAJA_NO_ABIERTA)
    expect(base.movimientos).toEqual([])
  })

  it('un P2034 que sobrevive al reintento es el 409 genérico', async () => {
    prisma.$transaction.mockRejectedValue(p2034())

    const error = await errorDe(registrar())
    expect(error).toBeInstanceOf(ConflictException)
    expect(error.message).toBe(MENSAJE_OPERACION_SIMULTANEA)
    expect(prisma.$transaction).toHaveBeenCalledTimes(2)
  })

  it('todo pasa por el cliente de la transacción', async () => {
    // El mock de $transaction normal le pasa al callback el mismo objeto de afuera; acá se arma uno distinto (sobre la
    // misma base) para ver qué se lee y escribe adentro de la transacción y qué no.
    const tx = crearPrismaMock()
    conectarBaseDeCaja(tx, base)
    prisma.$transaction.mockImplementationOnce((fn: (cliente: PrismaMock) => unknown) => fn(tx))

    await registrar()

    expect(tx.turno.findUniqueOrThrow).toHaveBeenCalledTimes(1)
    expect(tx.turnoCaja.findFirst).toHaveBeenCalledTimes(1)
    expect(tx.movimientoCaja.create).toHaveBeenCalledTimes(1)
    expect(prisma.turno.findUnique).toHaveBeenCalledTimes(1)
    expect(prisma.turno.findUniqueOrThrow).not.toHaveBeenCalled()
    expect(prisma.turnoCaja.findFirst).not.toHaveBeenCalled()
    expect(prisma.movimientoCaja.create).not.toHaveBeenCalled()
  })
})
