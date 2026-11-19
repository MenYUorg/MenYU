import type { AsignacionDelTurno, FilaDeArqueo, MovimientoDeCaja, TotalesDeMovimientos } from '@menyu/types'
import { clasificarDiferencia, ETIQUETA_DEL_METODO, formatearMonto, ordenarMesas, textoDeDiferencia } from '@menyu/ui/caja'

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

/** Cuánto suman los ingresos y los egresos de una caja, sumados en centavos enteros (no en flotantes). */
export function totalesDeMovimientos(movimientos: readonly MovimientoDeCaja[]): Pick<TotalesDeMovimientos, 'ingresos' | 'egresos'> {
  let ingresos = 0
  let egresos = 0
  for (const { tipo, monto } of movimientos) {
    const centavos = Math.round(monto * 100)
    if (tipo === 'INGRESO') ingresos += centavos
    else egresos += centavos
  }
  return { ingresos: ingresos / 100, egresos: egresos / 100 }
}

/** Las mesas que atiende un mozo durante el turno, en orden natural. */
export interface MesasDeUnMozo {
  mozoId: string
  mozoNombre: string
  mesas: string[]
}

const POR_NOMBRE = new Intl.Collator('es', { sensitivity: 'base' })

/** Las asignaciones del turno agrupadas por mozo (por su id), los mozos por nombre y sus mesas en orden natural. */
export function mesasPorMozo(asignaciones: readonly AsignacionDelTurno[]): MesasDeUnMozo[] {
  const porMozo = new Map<string, MesasDeUnMozo>()
  for (const { mozoId, mozoNombre, mesaNumero } of asignaciones) {
    const grupo = porMozo.get(mozoId) ?? { mozoId, mozoNombre, mesas: [] }
    grupo.mesas.push(mesaNumero)
    porMozo.set(mozoId, grupo)
  }
  return [...porMozo.values()]
    .sort((a, b) => POR_NOMBRE.compare(a.mozoNombre, b.mozoNombre))
    .map((grupo) => ({ ...grupo, mesas: ordenarMesas(grupo.mesas.map((numero) => ({ numero }))).map((m) => m.numero) }))
}

/** El mensaje de un error de la API para mostrar; si no trae uno, `porDefecto`. */
export function mensajeDeError(error: unknown, porDefecto: string): string {
  return error instanceof Error && error.message ? error.message : porDefecto
}
