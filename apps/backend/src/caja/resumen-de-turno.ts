import { Prisma } from '@prisma/client'
import { METODOS_ARQUEO, MetodoArqueo } from '../common/caja.constant'
import { ESTADO_PAGO_APROBADO } from '../common/estado-pago.constant'

type Monto = Prisma.Decimal | number | string

export interface DatosDelResumen {
  pagos: { metodo: string; estado: string; monto: Monto; propina: Monto; mozoId: string | null }[]
}

/** Cuántos pagos y cuánto suman, con la plata y la propina por separado. */
export interface Acumulado {
  cantidad: number
  monto: Prisma.Decimal
  propina: Prisma.Decimal
}

export interface ResumenDeTurno {
  porMetodo: ({ metodo: MetodoArqueo } & Acumulado)[]
  porMozo: ({ mozoId: string | null } & Acumulado)[]
  total: Acumulado
}

const esMetodoDeArqueo = (metodo: string): metodo is MetodoArqueo => (METODOS_ARQUEO as readonly string[]).includes(metodo)

const vacio = (): Acumulado => ({ cantidad: 0, monto: new Prisma.Decimal(0), propina: new Prisma.Decimal(0) })

function sumar(acumulado: Acumulado, monto: Monto, propina: Monto): void {
  acumulado.cantidad += 1
  acumulado.monto = acumulado.monto.plus(monto)
  acumulado.propina = acumulado.propina.plus(propina)
}

/**
 * Lo cobrado en las cajas de un turno (#357), por método y por quién cobró. Con Prisma.Decimal: nunca floats.
 * - Cuentan solo los pagos aprobados; los métodos que no entran al arqueo (mercadopago) se ignoran en todo.
 * - El monto y la propina van siempre por separado: la propina nunca se suma al monto.
 * - "Por mozo" es quien cobró (`Pago.mozoId`); los pagos sin mozo forman su propio grupo (`mozoId: null`), en el orden
 *   en que aparecen. Ordenarlos por nombre es cosa del service.
 * Siempre devuelve los 4 métodos de METODOS_ARQUEO, en ese orden.
 */
export function resumenDeTurno({ pagos }: DatosDelResumen): ResumenDeTurno {
  const porMetodo = new Map<MetodoArqueo, Acumulado>(METODOS_ARQUEO.map((m) => [m, vacio()]))
  const porMozo = new Map<string | null, Acumulado>()
  const total = vacio()

  for (const { metodo, estado, monto, propina, mozoId } of pagos) {
    if (estado !== ESTADO_PAGO_APROBADO || !esMetodoDeArqueo(metodo)) continue
    sumar(porMetodo.get(metodo) as Acumulado, monto, propina)
    if (!porMozo.has(mozoId)) porMozo.set(mozoId, vacio())
    sumar(porMozo.get(mozoId) as Acumulado, monto, propina)
    sumar(total, monto, propina)
  }

  return {
    porMetodo: [...porMetodo].map(([metodo, acumulado]) => ({ metodo, ...acumulado })),
    porMozo: [...porMozo].map(([mozoId, acumulado]) => ({ mozoId, ...acumulado })),
    total,
  }
}
