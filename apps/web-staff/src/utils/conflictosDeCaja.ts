/**
 * El 409 de las operaciones sobre un turno que ya se cerró (reasignar mesas, registrar un movimiento):
 * apps/backend/src/caja/conflictos.ts (MENSAJE_TURNO_CERRADO). Si cambia allá, cambia acá. Con este la pantalla vuelve a
 * leer el turno actual.
 */
export const MENSAJE_TURNO_CERRADO = 'El turno está cerrado'
