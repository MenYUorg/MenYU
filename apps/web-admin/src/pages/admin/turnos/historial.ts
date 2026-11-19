import type { FilaDeArqueo, TotalesDeMovimientos } from '@menyu/types'
import { clasificarDiferencia, ETIQUETA_DEL_METODO, formatearMonto, textoDeDiferencia } from '@menyu/ui/caja'

/**
 * Las diferencias del arqueo de una caja, con palabras y en el orden del backend: "Efectivo: Faltan $500". Solo las que
 * no son cero (comparadas en centavos); vacío = la caja cerró sin diferencias.
 */
export function diferenciasDelArqueo(arqueo: readonly FilaDeArqueo[]): string[] {
  return arqueo
    .filter((fila) => clasificarDiferencia(fila.diferencia) !== 'sin-diferencia')
    .map((fila) => `${ETIQUETA_DEL_METODO[fila.metodo]}: ${textoDeDiferencia(fila.diferencia)}`)
}

/** Los movimientos de una caja en una línea: "3 movimientos: ingresos $X, egresos $Y", o "Sin movimientos". */
export function textoDeMovimientos({ cantidad, ingresos, egresos }: TotalesDeMovimientos): string {
  if (cantidad === 0) return 'Sin movimientos'
  const cuantos = cantidad === 1 ? '1 movimiento' : `${cantidad} movimientos`
  return `${cuantos}: ingresos ${formatearMonto(ingresos)}, egresos ${formatearMonto(egresos)}`
}
