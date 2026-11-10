// Valores de la caja (#355). Los dos se repiten en un CHECK de la migración: si cambian acá, hay que cambiar también
// el CHECK, y un test los mantiene alineados.

/** El tipo de un movimiento de caja. Se repite en el CHECK `movimiento_caja_tipo_check`. */
export const TIPOS_MOVIMIENTO_CAJA = ['INGRESO', 'EGRESO'] as const

/**
 * Los métodos que entran al arqueo: `mercadopago` no, porque no pasa por la caja. Se repiten en el CHECK
 * `arqueo_metodo_metodo_check`.
 */
export const METODOS_ARQUEO = ['efectivo', 'debito', 'credito', 'transferencia'] as const

export type TipoMovimientoCaja = (typeof TIPOS_MOVIMIENTO_CAJA)[number]
export type MetodoArqueo = (typeof METODOS_ARQUEO)[number]
