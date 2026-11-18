/**
 * El 409 del backend cuando dos operaciones chocan: se reintenta, no es la advertencia de pagos pendientes. El texto
 * es el de apps/backend/src/caja/conflictos.ts (MENSAJE_OPERACION_SIMULTANEA); si cambia allá, cambia acá.
 */
export const MENSAJE_OPERACION_SIMULTANEA = 'Otra operación modificó esto al mismo tiempo; probá de nuevo'

/**
 * Los 400 que dicen que las cajas del turno cambiaron: apps/backend/src/caja/conflictos.ts (MENSAJE_SIN_TURNO y
 * MENSAJE_ELEGIR_CAJA) y apps/backend/src/caja/movimientos.service.ts (MENSAJE_CAJA_NO_ABIERTA). Con cualquiera, el
 * cobro vuelve a leer las cajas abiertas.
 */
export const MENSAJES_DE_TURNO_CAMBIADO: readonly string[] = [
  'No hay un turno abierto',
  'La caja no está abierta en este turno',
  'Hay más de una caja abierta: indicá en cuál se cobra',
]
