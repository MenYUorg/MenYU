import { Prisma } from '@prisma/client'
import { METODOS_ARQUEO } from '../common/caja.constant'
import { Acumulado, DatosDelResumen, resumenDeTurno } from './resumen-de-turno'

type Pago = DatosDelResumen['pagos'][number]

const aprobado = (metodo: string, monto: Pago['monto'], propina: Pago['propina'] = 0, mozoId: string | null = 'mozo-1'): Pago => ({
  metodo,
  estado: 'aprobado',
  monto,
  propina,
  mozoId,
})

/** Un acumulado como texto con 2 decimales, para comparar sin depender de cómo representa Decimal cada número. */
const comoTexto = ({ cantidad, monto, propina }: Acumulado) => ({ cantidad, monto: monto.toFixed(2), propina: propina.toFixed(2) })

/** El resumen entero como texto. */
function resumenComoTexto(datos: DatosDelResumen) {
  const { porMetodo, porMozo, total } = resumenDeTurno(datos)
  return {
    porMetodo: porMetodo.map(({ metodo, ...a }) => ({ metodo, ...comoTexto(a) })),
    porMozo: porMozo.map(({ mozoId, ...a }) => ({ mozoId, ...comoTexto(a) })),
    total: comoTexto(total),
  }
}

const cero = { cantidad: 0, monto: '0.00', propina: '0.00' }
/** Los 4 métodos en cero, con los que se indiquen pisados. */
const porMetodo = (pisados: Partial<Record<(typeof METODOS_ARQUEO)[number], typeof cero>> = {}) =>
  METODOS_ARQUEO.map((metodo) => ({ metodo, ...(pisados[metodo] ?? cero) }))

describe('resumenDeTurno', () => {
  it('sin pagos: los 4 métodos en cero, en el orden del arqueo, porMozo vacío y el total en cero', () => {
    expect(resumenComoTexto({ pagos: [] })).toEqual({ porMetodo: porMetodo(), porMozo: [], total: cero })
  })

  it('un pago por método: cada uno en su método, todos en el mismo mozo y en el total', () => {
    const pagos = [aprobado('efectivo', 1000, 100), aprobado('debito', 2500), aprobado('credito', 3000.5, 300), aprobado('transferencia', 800, 80)]

    expect(resumenComoTexto({ pagos })).toEqual({
      porMetodo: porMetodo({
        efectivo: { cantidad: 1, monto: '1000.00', propina: '100.00' },
        debito: { cantidad: 1, monto: '2500.00', propina: '0.00' },
        credito: { cantidad: 1, monto: '3000.50', propina: '300.00' },
        transferencia: { cantidad: 1, monto: '800.00', propina: '80.00' },
      }),
      // 1000 + 2500 + 3000,50 + 800 = 7300,50; 100 + 0 + 300 + 80 = 480.
      porMozo: [{ mozoId: 'mozo-1', cantidad: 4, monto: '7300.50', propina: '480.00' }],
      total: { cantidad: 4, monto: '7300.50', propina: '480.00' },
    })
  })

  it('los pagos pendientes, cancelados y rechazados no cuentan en ningún lado', () => {
    const pagos: Pago[] = [
      { metodo: 'efectivo', estado: 'pendiente', monto: 100, propina: 10, mozoId: 'mozo-2' },
      { metodo: 'debito', estado: 'cancelado', monto: 200, propina: 20, mozoId: 'mozo-2' },
      { metodo: 'credito', estado: 'rechazado', monto: 300, propina: 30, mozoId: null },
      aprobado('transferencia', 50, 5),
    ]

    expect(resumenComoTexto({ pagos })).toEqual({
      porMetodo: porMetodo({ transferencia: { cantidad: 1, monto: '50.00', propina: '5.00' } }),
      porMozo: [{ mozoId: 'mozo-1', cantidad: 1, monto: '50.00', propina: '5.00' }],
      total: { cantidad: 1, monto: '50.00', propina: '5.00' },
    })
  })

  it('mercadopago se ignora: no es un método del resumen ni suma al total ni a porMozo (tampoco su cantidad)', () => {
    const pagos = [aprobado('mercadopago', 5000, 500, 'mozo-mp'), aprobado('mercadopago', 700, 0, 'mozo-1'), aprobado('efectivo', 100, 10)]

    expect(resumenComoTexto({ pagos })).toEqual({
      porMetodo: porMetodo({ efectivo: { cantidad: 1, monto: '100.00', propina: '10.00' } }),
      porMozo: [{ mozoId: 'mozo-1', cantidad: 1, monto: '100.00', propina: '10.00' }],
      total: { cantidad: 1, monto: '100.00', propina: '10.00' },
    })
  })

  it('la propina nunca entra al monto: van separadas en el método, en el mozo y en el total', () => {
    const pagos = [aprobado('debito', 1000, 150), aprobado('efectivo', 500, 50)]

    expect(resumenComoTexto({ pagos })).toEqual({
      porMetodo: porMetodo({
        efectivo: { cantidad: 1, monto: '500.00', propina: '50.00' },
        debito: { cantidad: 1, monto: '1000.00', propina: '150.00' },
      }),
      porMozo: [{ mozoId: 'mozo-1', cantidad: 2, monto: '1500.00', propina: '200.00' }],
      total: { cantidad: 2, monto: '1500.00', propina: '200.00' },
    })
  })

  it('decimales exactos: 0,10 + 0,20 dan 0,30 y una propina de 0,05 queda en 0,05, como Decimal', () => {
    const { porMetodo: metodos, porMozo, total } = resumenDeTurno({ pagos: [aprobado('efectivo', 0.1, 0.05), aprobado('efectivo', '0.20')] })

    expect(0.1 + 0.2).not.toBe(0.3)
    for (const acumulado of [metodos[0], porMozo[0], total]) {
      expect(acumulado.monto).toBeInstanceOf(Prisma.Decimal)
      expect(acumulado.propina).toBeInstanceOf(Prisma.Decimal)
      expect(acumulado.monto.toString()).toBe('0.3')
      expect(acumulado.propina.toString()).toBe('0.05')
    }
  })

  it('acepta los montos como Decimal, que es como llegan de la base', () => {
    const pagos = [aprobado('credito', new Prisma.Decimal('10.10'), new Prisma.Decimal('1.01'))]

    expect(resumenComoTexto({ pagos }).total).toEqual({ cantidad: 1, monto: '10.10', propina: '1.01' })
  })

  it('el mismo mozo en varios métodos suma en un solo elemento de porMozo, en el orden en que aparecen los mozos', () => {
    const pagos = [
      aprobado('efectivo', 100, 10, 'mozo-b'),
      aprobado('debito', 200, 0, 'mozo-a'),
      aprobado('credito', 300, 30, 'mozo-b'),
      aprobado('transferencia', 400, 40, 'mozo-b'),
    ]

    expect(resumenComoTexto({ pagos }).porMozo).toEqual([
      { mozoId: 'mozo-b', cantidad: 3, monto: '800.00', propina: '80.00' },
      { mozoId: 'mozo-a', cantidad: 1, monto: '200.00', propina: '0.00' },
    ])
  })

  it('los pagos sin mozo (null) forman su propio grupo y no se mezclan con ningún mozo', () => {
    const pagos = [
      aprobado('efectivo', 100, 10, 'mozo-1'),
      aprobado('efectivo', 250, 0, null),
      aprobado('debito', 50, 5, null),
      aprobado('credito', 30, 3, 'mozo-2'),
    ]

    expect(resumenComoTexto({ pagos }).porMozo).toEqual([
      { mozoId: 'mozo-1', cantidad: 1, monto: '100.00', propina: '10.00' },
      { mozoId: null, cantidad: 2, monto: '300.00', propina: '5.00' },
      { mozoId: 'mozo-2', cantidad: 1, monto: '30.00', propina: '3.00' },
    ])
  })

  it('las cantidades cuentan pagos (no montos), también con montos y propinas en cero', () => {
    const pagos = [
      aprobado('efectivo', 0, 0),
      aprobado('efectivo', 10, 0),
      aprobado('efectivo', 20, 2),
      aprobado('debito', 5, 0, null),
      aprobado('mercadopago', 99, 0),
      { ...aprobado('credito', 7), estado: 'pendiente' },
    ]

    const { porMetodo: metodos, porMozo, total } = resumenDeTurno({ pagos })

    expect(metodos.map((m) => [m.metodo, m.cantidad])).toEqual([
      ['efectivo', 3],
      ['debito', 1],
      ['credito', 0],
      ['transferencia', 0],
    ])
    expect(porMozo.map((m) => [m.mozoId, m.cantidad])).toEqual([
      ['mozo-1', 3],
      [null, 1],
    ])
    expect(total.cantidad).toBe(4)
  })

  it('el total es la suma de porMetodo y la de porMozo (cantidad, monto y propina)', () => {
    const pagos = [
      aprobado('efectivo', 1234.56, 12.34, 'mozo-1'),
      aprobado('debito', 99.99, 0, null),
      aprobado('credito', 0.01, 0.01, 'mozo-2'),
      aprobado('transferencia', 500, 50, 'mozo-1'),
      aprobado('efectivo', 0.44, 0.66, null),
      aprobado('mercadopago', 1000, 100, 'mozo-1'),
      { ...aprobado('debito', 10, 1), estado: 'cancelado' },
    ]

    const { porMetodo: metodos, porMozo, total } = resumenDeTurno({ pagos })
    const sumar = (grupos: Acumulado[]) =>
      comoTexto(
        grupos.reduce(
          (acc, g) => ({ cantidad: acc.cantidad + g.cantidad, monto: acc.monto.plus(g.monto), propina: acc.propina.plus(g.propina) }),
          { cantidad: 0, monto: new Prisma.Decimal(0), propina: new Prisma.Decimal(0) },
        ),
      )

    // 1234,56 + 99,99 + 0,01 + 500 + 0,44 = 1835; 12,34 + 0 + 0,01 + 50 + 0,66 = 63,01.
    expect(comoTexto(total)).toEqual({ cantidad: 5, monto: '1835.00', propina: '63.01' })
    expect(sumar(metodos)).toEqual(comoTexto(total))
    expect(sumar(porMozo)).toEqual(comoTexto(total))
  })
})
