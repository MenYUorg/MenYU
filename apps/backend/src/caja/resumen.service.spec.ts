import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { accesoDeTest, CUENTAS, MUNDO } from '../test/acceso-de-test'
import { BaseDeCaja, baseDeCajaVacia, conectarBaseDeCaja } from '../test/caja-en-memoria'
import { comoPrisma, crearPrismaMock, PrismaMock } from '../test/prisma-mock'
import { ResumenService } from './resumen.service'

const REST = MUNDO.REST_1
const D = (monto: number | string) => new Prisma.Decimal(monto)
const T = (iso: string) => new Date(iso)

// El turno cerrado de casi todos los casos: la franja de Mercado Pago es [ABRE, CIERRA], con los dos extremos.
const ABRE = T('2026-11-10T20:00:00.000Z')
const CIERRA = T('2026-11-11T02:00:00.000Z')

type Pago = BaseDeCaja['pagos'][number]

describe('ResumenService', () => {
  let prisma: PrismaMock
  let base: BaseDeCaja
  let service: ResumenService
  let siguiente = 0

  const resumen = (turnoId = 't1', cuenta = CUENTAS.JEFE_SALON) => service.resumen(turnoId, cuenta)
  /** Un pago de una caja (aprobado, de la sesión s1, sin Mercado Pago), con lo que se pise. */
  const enCaja = (turnoCajaId: string | null, metodo: string, monto: number | string, propina: number | string, mozoId: string | null, extra: Partial<Pago> = {}) =>
    base.pagos.push({ id: `p${++siguiente}`, turnoCajaId, metodo, estado: 'aprobado', monto: D(monto), propina: D(propina), sesionId: 's1', mozoId, ...extra })
  /** Un pago de Mercado Pago aprobado (sin caja), cobrado en esa fecha, con lo que se pise. */
  const mp = (id: string, fechaCobro: string, monto: number | string, extra: Partial<Pago> = {}) =>
    base.pagos.push({ id, turnoCajaId: null, metodo: 'mercadopago', estado: 'aprobado', monto: D(monto), propina: D(0), sesionId: 's1', mozoId: null, fechaCobro: T(fechaCobro), ...extra })

  beforeEach(() => {
    siguiente = 0
    prisma = crearPrismaMock()
    base = baseDeCajaVacia()
    base.mesas.push(
      { id: 'mesa-1', restauranteId: REST, numero: '1', activo: true },
      { id: 'mesa-2', restauranteId: REST, numero: '2', activo: true },
      { id: 'mesa-ajena', restauranteId: MUNDO.REST_B, numero: '9', activo: true },
    )
    base.sesiones.push(
      { id: 's1', mesaId: 'mesa-1', estado: 'activa', iniciadaEn: ABRE },
      { id: 's2', mesaId: 'mesa-2', estado: 'cerrada', iniciadaEn: ABRE },
      { id: 's-ajena', mesaId: 'mesa-ajena', estado: 'activa', iniciadaEn: ABRE },
    )
    base.mozos.push(
      { id: 'm-zoe', restauranteId: REST, nombre: 'Zoe', activo: true, usuarioId: 'u-zoe' },
      { id: 'm-ana', restauranteId: REST, nombre: 'Ana', activo: true, usuarioId: 'u-ana' },
      { id: 'm-beto', restauranteId: REST, nombre: 'Beto', activo: true, usuarioId: null },
    )
    base.turnos.push(
      { id: 't1', restauranteId: REST, abiertoPorUsuarioId: 'u', abiertoEn: ABRE, cerradoEn: CIERRA, observaciones: null },
      { id: 't-otro', restauranteId: REST, abiertoPorUsuarioId: 'u', abiertoEn: T('2026-11-09T20:00:00Z'), cerradoEn: T('2026-11-10T02:00:00Z'), observaciones: null },
      { id: 't-ajeno', restauranteId: MUNDO.REST_B, abiertoPorUsuarioId: 'u', abiertoEn: ABRE, cerradoEn: null, observaciones: null },
    )
    base.turnoCajas.push(
      { id: 'ap-1', turnoId: 't1', cajaId: 'caja-1', fondoInicial: D(1000), abiertoEn: ABRE, cerradoEn: CIERRA },
      { id: 'ap-2', turnoId: 't1', cajaId: 'caja-2', fondoInicial: D(0), abiertoEn: ABRE, cerradoEn: CIERRA },
      { id: 'ap-otro', turnoId: 't-otro', cajaId: 'caja-1', fondoInicial: D(0), abiertoEn: ABRE, cerradoEn: CIERRA },
    )
    conectarBaseDeCaja(prisma, base)
    service = new ResumenService(comoPrisma(prisma), accesoDeTest())
  })

  afterEach(() => jest.useRealTimers())

  describe('lo cobrado en las cajas del turno', () => {
    it('con pagos en dos cajas: por método, por mozo y el total, con la plata y la propina por separado', async () => {
      enCaja('ap-1', 'efectivo', 1000, 100, 'm-zoe')
      enCaja('ap-1', 'debito', 2500, 0, 'm-ana')
      enCaja('ap-1', 'credito', '300.50', 30, null)
      enCaja('ap-2', 'efectivo', 500, 50, 'm-ana')
      enCaja('ap-2', 'transferencia', 800, 80, 'm-zoe')
      enCaja('ap-2', 'efectivo', 999, 9, 'm-zoe', { estado: 'pendiente' })

      const r = await resumen()

      expect(r.turno).toEqual({ id: 't1', abiertoEn: ABRE, cerradoEn: CIERRA })
      expect(r.porMetodo).toEqual([
        { metodo: 'efectivo', cantidad: 2, monto: 1500, propina: 150 },
        { metodo: 'debito', cantidad: 1, monto: 2500, propina: 0 },
        { metodo: 'credito', cantidad: 1, monto: 300.5, propina: 30 },
        { metodo: 'transferencia', cantidad: 1, monto: 800, propina: 80 },
      ])
      // Ana: 2500 + 500 y 0 + 50. Zoe: 1000 + 800 y 100 + 80. Sin mozo: 300,50 y 30.
      expect(r.porMozo).toEqual([
        { mozoId: 'm-ana', mozoNombre: 'Ana', cantidad: 2, monto: 3000, propina: 50 },
        { mozoId: 'm-zoe', mozoNombre: 'Zoe', cantidad: 2, monto: 1800, propina: 180 },
        { mozoId: null, mozoNombre: null, cantidad: 1, monto: 300.5, propina: 30 },
      ])
      expect(r.total).toEqual({ cantidad: 5, monto: 5100.5, propina: 260 })
    })

    it('no cuentan los pagos de las cajas de otro turno ni los que no tienen caja', async () => {
      enCaja('ap-1', 'efectivo', 100, 10, 'm-ana')
      enCaja('ap-otro', 'efectivo', 7000, 700, 'm-ana')
      enCaja(null, 'debito', 3000, 300, 'm-zoe')

      const r = await resumen()

      expect(r.total).toEqual({ cantidad: 1, monto: 100, propina: 10 })
      expect(r.porMozo).toEqual([{ mozoId: 'm-ana', mozoNombre: 'Ana', cantidad: 1, monto: 100, propina: 10 }])
    })

    it('porMozo va por nombre, con el grupo sin mozo al final y mozoNombre null', async () => {
      enCaja('ap-1', 'efectivo', 1, 0, null)
      enCaja('ap-1', 'efectivo', 2, 0, 'm-zoe')
      enCaja('ap-2', 'debito', 3, 0, 'm-beto')
      enCaja('ap-1', 'credito', 4, 0, 'm-ana')

      const r = await resumen()

      expect(r.porMozo.map((m) => [m.mozoId, m.mozoNombre, m.monto])).toEqual([
        ['m-ana', 'Ana', 4],
        ['m-beto', 'Beto', 3],
        ['m-zoe', 'Zoe', 2],
        [null, null, 1],
      ])
    })

    it('dos mozos con el mismo nombre quedan separados y ordenados por id', async () => {
      base.mozos.push({ id: 'm-ana-2', restauranteId: REST, nombre: 'Ana', activo: true, usuarioId: 'u-ana-2' })
      enCaja('ap-1', 'efectivo', 20, 0, 'm-ana-2')
      enCaja('ap-1', 'efectivo', 10, 0, 'm-ana')

      const r = await resumen()

      expect(r.porMozo.map((m) => [m.mozoId, m.mozoNombre, m.monto])).toEqual([
        ['m-ana', 'Ana', 10],
        ['m-ana-2', 'Ana', 20],
      ])
    })

    it('sin pagos: los 4 métodos en cero, porMozo vacío, el total en cero y Mercado Pago vacío', async () => {
      const r = await resumen()

      expect(r.porMetodo.map((m) => [m.metodo, m.cantidad, m.monto, m.propina])).toEqual([
        ['efectivo', 0, 0, 0],
        ['debito', 0, 0, 0],
        ['credito', 0, 0, 0],
        ['transferencia', 0, 0, 0],
      ])
      expect(r.porMozo).toEqual([])
      expect(r.total).toEqual({ cantidad: 0, monto: 0, propina: 0 })
      expect(r.mercadoPago).toEqual({ desde: ABRE, hasta: CIERRA, cantidad: 0, monto: 0, propina: 0, pagos: [] })
    })
  })

  describe('Mercado Pago de la franja del turno (informativo)', () => {
    it('entran los aprobados del restaurante entre abiertoEn y cerradoEn, con los extremos, por fecha de cobro', async () => {
      // Cargados fuera de orden: la lista sale por fechaCobro.
      mp('mp-revision', '2026-11-10T23:00:00.000Z', 450, { requiereRevision: true })
      mp('mp-hasta', '2026-11-11T02:00:00.000Z', 50, { propina: D(5), sesionId: 's2' })
      mp('mp-dentro', '2026-11-10T21:00:00.000Z', 1200)
      mp('mp-desde', '2026-11-10T20:00:00.000Z', 100)
      // Registrado por el staff a mano: tiene mozo, y entra igual.
      mp('mp-staff', '2026-11-10T22:00:00.000Z', 300, { propina: D(30), mozoId: 'm-zoe' })
      // Los que no entran.
      mp('mp-pendiente', '2026-11-10T21:30:00.000Z', 1, { estado: 'pendiente' })
      mp('mp-cancelado', '2026-11-10T21:30:00.000Z', 2, { estado: 'cancelado' })
      mp('mp-ajeno', '2026-11-10T21:30:00.000Z', 4, { sesionId: 's-ajena' })
      mp('mp-antes', '2026-11-10T19:59:59.999Z', 8)
      mp('mp-despues', '2026-11-11T02:00:00.001Z', 16)
      mp('efectivo-sin-caja', '2026-11-10T21:30:00.000Z', 32, { metodo: 'efectivo' })

      const r = await resumen()

      expect(r.mercadoPago).toEqual({
        desde: ABRE,
        hasta: CIERRA,
        cantidad: 5,
        monto: 2100,
        propina: 35,
        pagos: [
          { id: 'mp-desde', mesaNumero: '1', monto: 100, propina: 0, fechaCobro: T('2026-11-10T20:00:00.000Z'), requiereRevision: false },
          { id: 'mp-dentro', mesaNumero: '1', monto: 1200, propina: 0, fechaCobro: T('2026-11-10T21:00:00.000Z'), requiereRevision: false },
          { id: 'mp-staff', mesaNumero: '1', monto: 300, propina: 30, fechaCobro: T('2026-11-10T22:00:00.000Z'), requiereRevision: false },
          { id: 'mp-revision', mesaNumero: '1', monto: 450, propina: 0, fechaCobro: T('2026-11-10T23:00:00.000Z'), requiereRevision: true },
          { id: 'mp-hasta', mesaNumero: '2', monto: 50, propina: 5, fechaCobro: T('2026-11-11T02:00:00.000Z'), requiereRevision: false },
        ],
      })
    })

    it('con el turno abierto, la franja llega hasta ahora: entra un pago de hace un minuto y no uno de después', async () => {
      const ahora = T('2026-11-11T12:00:00.000Z')
      jest.useFakeTimers({ now: ahora })
      base.turnos.push({ id: 't-abierto', restauranteId: REST, abiertoPorUsuarioId: 'u', abiertoEn: T('2026-11-11T10:00:00.000Z'), cerradoEn: null, observaciones: null })
      mp('mp-hace-un-minuto', '2026-11-11T11:59:00.000Z', 700)
      mp('mp-despues-de-ahora', '2026-11-11T12:00:00.001Z', 900)

      const r = await resumen('t-abierto')

      expect(r.turno.cerradoEn).toBeNull()
      expect(r.mercadoPago.hasta).toEqual(ahora)
      expect(r.mercadoPago.pagos.map((p) => p.id)).toEqual(['mp-hace-un-minuto'])
    })

    it('los montos salen como number, y Mercado Pago no suma a porMetodo, a porMozo ni al total', async () => {
      enCaja('ap-1', 'efectivo', '100.25', '0.75', 'm-ana')
      mp('mp-1', '2026-11-10T21:00:00.000Z', '999.99', { propina: D('9.01'), mozoId: 'm-ana' })

      const r = await resumen()

      expect(r.total).toEqual({ cantidad: 1, monto: 100.25, propina: 0.75 })
      expect(r.porMetodo.map((m) => m.metodo)).toEqual(['efectivo', 'debito', 'credito', 'transferencia'])
      expect(r.porMetodo[0]).toEqual({ metodo: 'efectivo', cantidad: 1, monto: 100.25, propina: 0.75 })
      expect(r.porMozo).toEqual([{ mozoId: 'm-ana', mozoNombre: 'Ana', cantidad: 1, monto: 100.25, propina: 0.75 }])
      expect(r.mercadoPago).toMatchObject({ cantidad: 1, monto: 999.99, propina: 9.01 })
      for (const n of [r.total.monto, r.total.propina, r.mercadoPago.monto, r.mercadoPago.pagos[0].monto, r.mercadoPago.pagos[0].propina]) {
        expect(typeof n).toBe('number')
      }
    })
  })

  describe('los permisos', () => {
    it('un turno que no existe es 404, sin leer pagos', async () => {
      await expect(resumen('no-existe', CUENTAS.OWNER_A)).rejects.toThrow(NotFoundException)
      expect(prisma.pago.findMany).not.toHaveBeenCalled()
    })

    it.each([
      ['el MOZO', CUENTAS.MOZO, 't1'],
      ['COCINA', CUENTAS.COCINA, 't1'],
      ['el OWNER de otra marca', CUENTAS.OWNER_B, 't1'],
      ['el GERENTE, con un turno de otro restaurante', CUENTAS.GERENTE, 't-ajeno'],
    ])('%s recibe 403, y el rol se exige antes de leer ningún pago', async (_caso, cuenta, turnoId) => {
      enCaja('ap-1', 'efectivo', 100, 0, 'm-ana')

      await expect(resumen(turnoId, cuenta)).rejects.toThrow(ForbiddenException)
      expect(prisma.pago.findMany).not.toHaveBeenCalled()
    })

    it.each([
      ['el OWNER de la marca', CUENTAS.OWNER_A],
      ['el GERENTE', CUENTAS.GERENTE],
      ['el JEFE_SALON', CUENTAS.JEFE_SALON],
    ])('%s ve el resumen', async (_caso, cuenta) => {
      enCaja('ap-1', 'efectivo', 100, 0, 'm-ana')

      expect((await resumen('t1', cuenta)).total).toEqual({ cantidad: 1, monto: 100, propina: 0 })
    })
  })
})
