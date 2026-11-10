import { Prisma } from '@prisma/client'
import { METODOS_ARQUEO, MetodoArqueo } from '../common/caja.constant'
import { ESTADO_PAGO_APROBADO } from '../common/estado-pago.constant'

type Monto = Prisma.Decimal | number | string

export interface DatosDelEsperado {
  fondoInicial: Monto
  movimientos: { tipo: string; monto: Monto }[]
  pagos: { metodo: string; estado: string; monto: Monto; propina: Monto }[]
}

const esMetodoDeArqueo = (metodo: string): metodo is MetodoArqueo => (METODOS_ARQUEO as readonly string[]).includes(metodo)

/**
 * Lo que tendría que haber en una caja al cerrarla, por método de arqueo (#357). Con Prisma.Decimal: nunca floats.
 * - Cuentan solo los pagos aprobados; los métodos que no entran al arqueo (mercadopago) se ignoran.
 * - Cada método suma el monto y la propina de sus pagos.
 * - El efectivo suma además el fondo inicial y los ingresos, y resta los egresos. Puede dar negativo.
 * Siempre devuelve los 4 métodos de METODOS_ARQUEO.
 */
export function esperadoDeCaja({ fondoInicial, movimientos, pagos }: DatosDelEsperado): Record<MetodoArqueo, Prisma.Decimal> {
  const esperado = Object.fromEntries(METODOS_ARQUEO.map((m) => [m, new Prisma.Decimal(0)])) as Record<
    MetodoArqueo,
    Prisma.Decimal
  >

  for (const pago of pagos) {
    if (pago.estado !== ESTADO_PAGO_APROBADO || !esMetodoDeArqueo(pago.metodo)) continue
    esperado[pago.metodo] = esperado[pago.metodo].plus(pago.monto).plus(pago.propina)
  }

  esperado.efectivo = esperado.efectivo.plus(fondoInicial)
  for (const { tipo, monto } of movimientos) {
    esperado.efectivo = tipo === 'EGRESO' ? esperado.efectivo.minus(monto) : esperado.efectivo.plus(monto)
  }
  return esperado
}
