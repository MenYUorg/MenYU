import { Prisma } from '@prisma/client'
import { METODOS_ARQUEO } from '../common/caja.constant'
import { DatosDelEsperado, esperadoDeCaja } from './esperado-de-caja'

type Pago = DatosDelEsperado['pagos'][number]

const aprobado = (metodo: string, monto: number | string, propina: number | string = 0): Pago => ({
  metodo,
  estado: 'aprobado',
  monto,
  propina,
})

/** El esperado como texto con 2 decimales, para comparar sin depender de cómo representa Decimal cada número. */
const comoTexto = (esperado: Record<string, Prisma.Decimal>) =>
  Object.fromEntries(Object.entries(esperado).map(([metodo, monto]) => [metodo, monto.toFixed(2)]))

const ceros = { efectivo: '0.00', debito: '0.00', credito: '0.00', transferencia: '0.00' }

describe('esperadoDeCaja', () => {
  it.each<[string, DatosDelEsperado, Partial<typeof ceros>]>([
    ['una caja vacía: solo el fondo en efectivo', { fondoInicial: 1500, movimientos: [], pagos: [] }, { efectivo: '1500.00' }],
    ['un cobro en efectivo', { fondoInicial: 0, movimientos: [], pagos: [aprobado('efectivo', 1000)] }, { efectivo: '1000.00' }],
    ['un cobro con débito', { fondoInicial: 100, movimientos: [], pagos: [aprobado('debito', 2500)] }, { efectivo: '100.00', debito: '2500.00' }],
    ['un cobro con crédito', { fondoInicial: 0, movimientos: [], pagos: [aprobado('credito', 3000.5)] }, { credito: '3000.50' }],
    ['un cobro por transferencia', { fondoInicial: 0, movimientos: [], pagos: [aprobado('transferencia', 800)] }, { transferencia: '800.00' }],
    [
      'la propina va al método de su pago: una propina en débito suma en débito, no en efectivo',
      { fondoInicial: 0, movimientos: [], pagos: [aprobado('debito', 1000, 150), aprobado('efectivo', 500, 50)] },
      { efectivo: '550.00', debito: '1150.00' },
    ],
    [
      'los pagos pendientes, rechazados y cancelados no cuentan',
      {
        fondoInicial: 0,
        movimientos: [],
        pagos: [
          { metodo: 'efectivo', estado: 'pendiente', monto: 100, propina: 10 },
          { metodo: 'debito', estado: 'rechazado', monto: 200, propina: 0 },
          { metodo: 'credito', estado: 'cancelado', monto: 300, propina: 0 },
          aprobado('transferencia', 50),
        ],
      },
      { transferencia: '50.00' },
    ],
    [
      'mercadopago no entra al arqueo, ni su monto ni su propina',
      { fondoInicial: 200, movimientos: [], pagos: [aprobado('mercadopago', 5000, 500), aprobado('efectivo', 100)] },
      { efectivo: '300.00' },
    ],
    [
      'los ingresos suman y los egresos restan, solo en el efectivo',
      {
        fondoInicial: 1000,
        movimientos: [
          { tipo: 'INGRESO', monto: 300 },
          { tipo: 'EGRESO', monto: 450.25 },
        ],
        pagos: [aprobado('debito', 100)],
      },
      { efectivo: '849.75', debito: '100.00' },
    ],
    [
      'los egresos pueden dejar el efectivo en negativo',
      { fondoInicial: 100, movimientos: [{ tipo: 'EGRESO', monto: 250 }], pagos: [] },
      { efectivo: '-150.00' },
    ],
    [
      'exactitud decimal: tres pagos de 0,10 suman 0,30',
      { fondoInicial: 0, movimientos: [], pagos: [aprobado('efectivo', 0.1), aprobado('efectivo', 0.1), aprobado('efectivo', 0.1)] },
      { efectivo: '0.30' },
    ],
    [
      'acepta los montos como Decimal, que es como llegan de la base',
      {
        fondoInicial: new Prisma.Decimal('0.20'),
        movimientos: [{ tipo: 'INGRESO', monto: new Prisma.Decimal('0.10') }],
        pagos: [aprobado('efectivo', '0.10', '0.05')],
      },
      { efectivo: '0.45' },
    ],
  ])('%s', (_caso, datos, esperado) => {
    expect(comoTexto(esperadoDeCaja(datos))).toEqual({ ...ceros, ...esperado })
  })

  it('tres pagos de 0,10 dan exactamente 0,3 (no 0,30000000000000004 como con number)', () => {
    const { efectivo } = esperadoDeCaja({
      fondoInicial: 0,
      movimientos: [],
      pagos: [aprobado('efectivo', 0.1), aprobado('efectivo', 0.1), aprobado('efectivo', 0.1)],
    })

    expect(efectivo.equals(new Prisma.Decimal('0.3'))).toBe(true)
    expect(0.1 + 0.1 + 0.1).not.toBe(0.3)
  })

  it('siempre devuelve los 4 métodos del arqueo, y solo esos, como Decimal', () => {
    const esperado = esperadoDeCaja({ fondoInicial: 0, movimientos: [], pagos: [aprobado('mercadopago', 10)] })

    expect(Object.keys(esperado).sort()).toEqual([...METODOS_ARQUEO].sort())
    for (const monto of Object.values(esperado)) expect(monto).toBeInstanceOf(Prisma.Decimal)
  })
})
