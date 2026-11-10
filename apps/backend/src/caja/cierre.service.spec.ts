import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { accesoDeTest, CUENTAS, MUNDO } from '../test/acceso-de-test'
import { BaseDeCaja, baseDeCajaVacia, conectarBaseDeCaja } from '../test/caja-en-memoria'
import { comoPrisma, crearPrismaMock, PrismaMock } from '../test/prisma-mock'
import { CierreService } from './cierre.service'
import { MENSAJE_OPERACION_SIMULTANEA, MENSAJE_TURNO_CERRADO } from './conflictos'
import { CerrarTurnoDto } from './dto/cerrar-turno.dto'
import { MENSAJE_CAJA_NO_ABIERTA } from './movimientos.service'

const REST = MUNDO.REST_1
const D = (monto: number | string) => new Prisma.Decimal(monto)

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

/** Lo declarado de una caja: efectivo, débito, crédito y transferencia. */
const declarado = (efectivo: number, debito = 0, credito = 0, transferencia = 0) => ({ efectivo, debito, credito, transferencia })

describe('CierreService', () => {
  let prisma: PrismaMock
  let base: BaseDeCaja
  let service: CierreService

  const cerrar = (dto: CerrarTurnoDto, cuenta = CUENTAS.JEFE_SALON, turnoId = 't1') => service.cerrar(turnoId, dto, cuenta)
  const soloPrincipal = (efectivo = 1000): CerrarTurnoDto => ({ cajas: [{ cajaId: 'caja-1', declarado: declarado(efectivo) }] })
  /** Las filas de arqueo de una apertura, como texto con 2 decimales. */
  const arqueosDe = (turnoCajaId: string) =>
    base.arqueos
      .filter((a) => a.turnoCajaId === turnoCajaId)
      .map((a) => [a.metodo, a.esperado.toFixed(2), a.declarado.toFixed(2), a.diferencia.toFixed(2)])

  beforeEach(() => {
    prisma = crearPrismaMock()
    base = baseDeCajaVacia()
    base.cajas.push(
      { id: 'caja-1', restauranteId: REST, nombre: 'Principal', activa: true },
      { id: 'caja-2', restauranteId: REST, nombre: 'Barra', activa: true },
      { id: 'caja-ajena', restauranteId: MUNDO.REST_B, nombre: 'Ajena', activa: true },
    )
    base.mesas.push(
      { id: 'mesa-1', restauranteId: REST, numero: '1', activo: true },
      { id: 'mesa-2', restauranteId: REST, numero: '2', activo: true },
      { id: 'mesa-ajena', restauranteId: MUNDO.REST_B, numero: '1', activo: true },
    )
    base.turnos.push(
      { id: 't1', restauranteId: REST, abiertoPorUsuarioId: 'u', abiertoEn: new Date(), cerradoEn: null, observaciones: null },
      { id: 't-cerrado', restauranteId: REST, abiertoPorUsuarioId: 'u', abiertoEn: new Date(), cerradoEn: new Date(), observaciones: null },
      { id: 't-ajeno', restauranteId: MUNDO.REST_B, abiertoPorUsuarioId: 'u', abiertoEn: new Date(), cerradoEn: null, observaciones: null },
    )
    base.turnoCajas.push({ id: 'ap-1', turnoId: 't1', cajaId: 'caja-1', fondoInicial: D(1000), abiertoEn: new Date(), cerradoEn: null })
    conectarBaseDeCaja(prisma, base)
    service = new CierreService(comoPrisma(prisma), accesoDeTest())
  })

  describe('el cierre', () => {
    it('con una caja: 4 filas de arqueo (sobrante, faltante y cero), cierra el turno y la caja, y responde con number', async () => {
      base.movimientos.push(
        { id: 'm1', turnoCajaId: 'ap-1', tipo: 'INGRESO', monto: D(200), motivo: 'x', usuarioId: 'u', createdAt: new Date() },
        { id: 'm2', turnoCajaId: 'ap-1', tipo: 'EGRESO', monto: D(50), motivo: 'x', usuarioId: 'u', createdAt: new Date() },
      )
      base.pagos.push(
        { id: 'p1', turnoCajaId: 'ap-1', metodo: 'efectivo', estado: 'aprobado', monto: D(3000), propina: D(100) },
        { id: 'p2', turnoCajaId: 'ap-1', metodo: 'debito', estado: 'aprobado', monto: D(2000), propina: D(0) },
      )

      const res = await cerrar({ cajas: [{ cajaId: 'caja-1', declarado: declarado(4300, 1900) }] })

      // efectivo: 1000 + 3000 + 100 + 200 − 50 = 4250; débito: 2000.
      expect(arqueosDe('ap-1')).toEqual([
        ['efectivo', '4250.00', '4300.00', '50.00'],
        ['debito', '2000.00', '1900.00', '-100.00'],
        ['credito', '0.00', '0.00', '0.00'],
        ['transferencia', '0.00', '0.00', '0.00'],
      ])
      const turno = base.turnos[0]
      expect(turno.cerradoEn).toBeInstanceOf(Date)
      expect(turno.cerradoPorUsuarioId).toBe(CUENTAS.JEFE_SALON.id)
      expect(base.turnoCajas[0].cerradoEn).toBe(turno.cerradoEn)
      expect(res.arqueos).toEqual([
        {
          cajaId: 'caja-1',
          cajaNombre: 'Principal',
          fondoInicial: 1000,
          metodos: [
            { metodo: 'efectivo', esperado: 4250, declarado: 4300, diferencia: 50 },
            { metodo: 'debito', esperado: 2000, declarado: 1900, diferencia: -100 },
            { metodo: 'credito', esperado: 0, declarado: 0, diferencia: 0 },
            { metodo: 'transferencia', esperado: 0, declarado: 0, diferencia: 0 },
          ],
        },
      ])
      expect(res.turno).toMatchObject({ id: 't1', cerradoEn: turno.cerradoEn })
    })

    it('con dos cajas: cada una con su esperado (lo de una no cuenta en la otra), y por nombre', async () => {
      base.turnoCajas.push({ id: 'ap-2', turnoId: 't1', cajaId: 'caja-2', fondoInicial: D(500), abiertoEn: new Date(), cerradoEn: null })
      base.movimientos.push({ id: 'm1', turnoCajaId: 'ap-2', tipo: 'EGRESO', monto: D(100), motivo: 'x', usuarioId: 'u', createdAt: new Date() })
      base.pagos.push(
        { id: 'p1', turnoCajaId: 'ap-1', metodo: 'efectivo', estado: 'aprobado', monto: D(700), propina: D(0) },
        { id: 'p2', turnoCajaId: 'ap-2', metodo: 'credito', estado: 'aprobado', monto: D(900), propina: D(10) },
      )

      const res = await cerrar({
        cajas: [
          { cajaId: 'caja-1', declarado: declarado(1700) },
          { cajaId: 'caja-2', declarado: declarado(400, 0, 910) },
        ],
      })

      expect(arqueosDe('ap-1').map(([metodo, esperado]) => [metodo, esperado])).toEqual([
        ['efectivo', '1700.00'],
        ['debito', '0.00'],
        ['credito', '0.00'],
        ['transferencia', '0.00'],
      ])
      expect(arqueosDe('ap-2').map(([metodo, esperado]) => [metodo, esperado])).toEqual([
        ['efectivo', '400.00'],
        ['debito', '0.00'],
        ['credito', '910.00'],
        ['transferencia', '0.00'],
      ])
      expect(res.arqueos.map((a) => a.cajaNombre)).toEqual(['Barra', 'Principal'])
      expect(base.turnoCajas.every((tc) => tc.cerradoEn instanceof Date)).toBe(true)
    })

    it('de los pagos de la caja, solo cuenta el aprobado de un método del arqueo', async () => {
      base.pagos.push(
        { id: 'p1', turnoCajaId: 'ap-1', metodo: 'efectivo', estado: 'aprobado', monto: D(100), propina: D(0) },
        { id: 'p2', turnoCajaId: 'ap-1', metodo: 'efectivo', estado: 'pendiente', monto: D(999), propina: D(0) },
        { id: 'p3', turnoCajaId: 'ap-1', metodo: 'debito', estado: 'cancelado', monto: D(50), propina: D(0) },
        { id: 'p4', turnoCajaId: 'ap-1', metodo: 'mercadopago', estado: 'aprobado', monto: D(700), propina: D(70) },
        { id: 'p5', turnoCajaId: null, metodo: 'credito', estado: 'aprobado', monto: D(300), propina: D(0) },
      )

      await cerrar(soloPrincipal(1100))

      expect(arqueosDe('ap-1').map(([metodo, esperado]) => [metodo, esperado])).toEqual([
        ['efectivo', '1100.00'],
        ['debito', '0.00'],
        ['credito', '0.00'],
        ['transferencia', '0.00'],
      ])
    })

    it('corre en una transacción serializable', async () => {
      await cerrar(soloPrincipal())

      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      })
    })
  })

  describe('las observaciones', () => {
    it('sin anteriores, quedan como "Cierre: <texto>"', async () => {
      await cerrar({ ...soloPrincipal(), observaciones: 'Faltó cambio' })

      expect(base.turnos[0].observaciones).toBe('Cierre: Faltó cambio')
    })

    it('con anteriores, se suman en otra línea', async () => {
      base.turnos[0].observaciones = 'Noche de partido'

      await cerrar({ ...soloPrincipal(), observaciones: 'Faltó cambio' })

      expect(base.turnos[0].observaciones).toBe('Noche de partido\nCierre: Faltó cambio')
    })

    it.each([
      ['sin el campo', undefined],
      ['en null (lo que deja el DTO con un texto vacío)', null],
    ])('%s, no se tocan', async (_caso, observaciones) => {
      base.turnos[0].observaciones = 'Noche de partido'

      await cerrar({ ...soloPrincipal(), observaciones })

      expect(base.turnos[0].observaciones).toBe('Noche de partido')
      expect(prisma.turno.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.not.objectContaining({ observaciones: expect.anything() }) }))
    })
  })

  describe('las cajas del body', () => {
    it('si falta una caja abierta del turno es 400 con su nombre, y no se escribe nada', async () => {
      base.turnoCajas.push({ id: 'ap-2', turnoId: 't1', cajaId: 'caja-2', fondoInicial: D(0), abiertoEn: new Date(), cerradoEn: null })

      const error = await errorDe(cerrar(soloPrincipal()))

      expect(error).toBeInstanceOf(BadRequestException)
      expect(error.message).toBe('Falta el arqueo de la caja «Barra»')
      expect(base.arqueos).toEqual([])
      expect(base.turnos[0].cerradoEn).toBeNull()
    })

    it.each([
      ['de otro restaurante', 'caja-ajena'],
      ['del restaurante pero no abierta en este turno', 'caja-2'],
    ])('si sobra una caja %s es 400, y no se escribe nada', async (_caso, cajaId) => {
      const error = await errorDe(cerrar({ cajas: [...soloPrincipal().cajas, { cajaId, declarado: declarado(0) }] }))

      expect(error).toBeInstanceOf(BadRequestException)
      expect(error.message).toBe(MENSAJE_CAJA_NO_ABIERTA)
      expect(base.arqueos).toEqual([])
      expect(base.turnos[0].cerradoEn).toBeNull()
    })
  })

  describe('el rango del arqueo (Decimal(10,2))', () => {
    it('un esperado que supera el máximo es 400 y no se escribe nada', async () => {
      base.pagos.push({ id: 'p1', turnoCajaId: 'ap-1', metodo: 'efectivo', estado: 'aprobado', monto: D('99999999.99'), propina: D(0) })

      const error = await errorDe(cerrar(soloPrincipal(0)))

      expect(error).toBeInstanceOf(BadRequestException)
      expect(error.message).toBe('El arqueo de efectivo de la caja «Principal» supera el máximo que se puede registrar')
      expect(base.arqueos).toEqual([])
      expect(base.turnos[0].cerradoEn).toBeNull()
    })

    it('una diferencia que supera el máximo es 400 aunque el esperado entre', async () => {
      // efectivo esperado: 1000 − 1001 = −1; declarado 99999999.99 → diferencia 100000000.99.
      base.movimientos.push({ id: 'm1', turnoCajaId: 'ap-1', tipo: 'EGRESO', monto: D(1001), motivo: 'x', usuarioId: 'u', createdAt: new Date() })

      const error = await errorDe(cerrar(soloPrincipal(99_999_999.99)))

      expect(error).toBeInstanceOf(BadRequestException)
      expect(error.message).toBe('El arqueo de efectivo de la caja «Principal» supera el máximo que se puede registrar')
      expect(base.arqueos).toEqual([])
    })

    it('en el borde exacto del máximo, entra', async () => {
      base.pagos.push({ id: 'p1', turnoCajaId: 'ap-1', metodo: 'debito', estado: 'aprobado', monto: D('99999999.99'), propina: D(0) })

      await cerrar({ cajas: [{ cajaId: 'caja-1', declarado: declarado(1000, 0) }] })

      expect(arqueosDe('ap-1')[1]).toEqual(['debito', '99999999.99', '0.00', '-99999999.99'])
    })
  })

  describe('los permisos y el estado del turno', () => {
    it('un turno que no existe es 404', async () => {
      await expect(cerrar(soloPrincipal(), CUENTAS.OWNER_A, 'no-existe')).rejects.toThrow(NotFoundException)
    })

    it.each([
      ['el MOZO', CUENTAS.MOZO, 't1'],
      ['COCINA', CUENTAS.COCINA, 't1'],
      ['el OWNER de otra marca', CUENTAS.OWNER_B, 't1'],
      ['el GERENTE, con un turno de otro restaurante', CUENTAS.GERENTE, 't-ajeno'],
    ])('%s recibe 403 y no se cierra nada', async (_caso, cuenta, turnoId) => {
      await expect(cerrar(soloPrincipal(), cuenta, turnoId)).rejects.toThrow(ForbiddenException)
      expect(prisma.$transaction).not.toHaveBeenCalled()
      expect(base.arqueos).toEqual([])
    })

    it('un turno ya cerrado es 409 y no se escribe nada', async () => {
      // El turno cerrado tiene su apertura (cerrada) y el body coincide con ella: el único motivo del 409 es el chequeo.
      const cerradoEn = base.turnos[1].cerradoEn
      base.turnos[1].cerradoPorUsuarioId = 'quien-cerro'
      base.turnoCajas.push({ id: 'ap-c', turnoId: 't-cerrado', cajaId: 'caja-2', fondoInicial: D(0), abiertoEn: new Date(), cerradoEn })

      const error = await errorDe(cerrar({ cajas: [{ cajaId: 'caja-2', declarado: declarado(0) }] }, CUENTAS.OWNER_A, 't-cerrado'))

      expect(error).toBeInstanceOf(ConflictException)
      expect(error.message).toBe(MENSAJE_TURNO_CERRADO)
      expect(base.arqueos).toEqual([])
      expect(base.turnos[1]).toMatchObject({ cerradoEn, cerradoPorUsuarioId: 'quien-cerro' })
    })
  })

  describe('los choques', () => {
    it('el P2002 del arqueo (otro cierre ganó) es 409 con el mensaje de turno cerrado', async () => {
      prisma.$transaction.mockRejectedValue(p2002('ArqueoMetodo', ['turno_caja_id', 'metodo']))

      const error = await errorDe(cerrar(soloPrincipal()))
      expect(error).toBeInstanceOf(ConflictException)
      expect(error.message).toBe(MENSAJE_TURNO_CERRADO)
    })

    it('un P2034 que sobrevive al reintento es el 409 genérico, con dos llamadas a $transaction', async () => {
      prisma.$transaction.mockRejectedValue(p2034())

      const error = await errorDe(cerrar(soloPrincipal()))
      expect(error).toBeInstanceOf(ConflictException)
      expect(error.message).toBe(MENSAJE_OPERACION_SIMULTANEA)
      expect(prisma.$transaction).toHaveBeenCalledTimes(2)
    })

    it('otro error pasa tal cual', async () => {
      const otro = p2002('Turno', ['restaurante_id'])
      prisma.$transaction.mockRejectedValue(otro)

      await expect(cerrar(soloPrincipal())).rejects.toBe(otro)
    })
  })

  it('todo pasa por el cliente de la transacción, y las mesas abiertas se leen afuera, después', async () => {
    // El mock de $transaction normal le pasa al callback el mismo objeto de afuera; acá se arma uno distinto (sobre la
    // misma base) para ver qué se lee y escribe adentro de la transacción y qué no.
    const tx = crearPrismaMock()
    conectarBaseDeCaja(tx, base)
    prisma.$transaction.mockImplementationOnce((fn: (cliente: PrismaMock) => unknown) => fn(tx))

    await cerrar(soloPrincipal())

    for (const llamada of [
      tx.turno.findUniqueOrThrow,
      tx.turnoCaja.findMany,
      tx.movimientoCaja.findMany,
      tx.pago.findMany,
      tx.arqueoMetodo.createMany,
      tx.turnoCaja.updateMany,
      tx.turno.update,
    ]) {
      expect(llamada).toHaveBeenCalled()
    }
    for (const llamada of [
      prisma.turno.findUniqueOrThrow,
      prisma.turnoCaja.findMany,
      prisma.movimientoCaja.findMany,
      prisma.pago.findMany,
      prisma.arqueoMetodo.createMany,
      prisma.turnoCaja.updateMany,
      prisma.turno.update,
      tx.sesionMesa.findMany,
    ]) {
      expect(llamada).not.toHaveBeenCalled()
    }
    expect(prisma.turno.findUnique).toHaveBeenCalledTimes(1)
    expect(prisma.sesionMesa.findMany).toHaveBeenCalledTimes(1)
    // Después de la última lectura de adentro de la transacción.
    const ultimaDeAdentro = Math.max(...tx.turno.findUniqueOrThrow.mock.invocationCallOrder)
    expect(prisma.sesionMesa.findMany.mock.invocationCallOrder[0]).toBeGreaterThan(ultimaDeAdentro)
  })

  describe('las mesas abiertas (el aviso)', () => {
    it('sin sesiones activas, la lista está vacía', async () => {
      base.sesiones.push({ id: 's0', mesaId: 'mesa-1', estado: 'cerrada', iniciadaEn: new Date('2026-11-10T19:00:00Z') })

      const res = await cerrar(soloPrincipal())

      expect(res.avisos).toEqual({ mesasAbiertas: [] })
    })

    it('una vez por mesa (con su sesión más antigua), de la más antigua a la más nueva, solo del restaurante', async () => {
      base.sesiones.push(
        { id: 's1', mesaId: 'mesa-2', estado: 'activa', iniciadaEn: new Date('2026-11-10T21:00:00Z') },
        { id: 's2', mesaId: 'mesa-1', estado: 'activa', iniciadaEn: new Date('2026-11-10T22:00:00Z') },
        { id: 's3', mesaId: 'mesa-2', estado: 'activa', iniciadaEn: new Date('2026-11-10T20:00:00Z') },
        { id: 's4', mesaId: 'mesa-ajena', estado: 'activa', iniciadaEn: new Date('2026-11-10T18:00:00Z') },
      )

      const res = await cerrar(soloPrincipal())

      expect(res.avisos.mesasAbiertas).toEqual([
        { mesaId: 'mesa-2', mesaNumero: '2', iniciadaEn: new Date('2026-11-10T20:00:00Z') },
        { mesaId: 'mesa-1', mesaNumero: '1', iniciadaEn: new Date('2026-11-10T22:00:00Z') },
      ])
    })
  })
})
