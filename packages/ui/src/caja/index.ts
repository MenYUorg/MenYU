// Lo puro del cobro y de los montos de caja (#358, #359, #360): lo usan web-staff y web-admin.
export { leerMonto, MONTO_MAXIMO, type ErrorDeMonto, type MontoLeido } from './monto'
export { parsearPropina, PROPINA_MAXIMA, type PropinaLeida } from './propina'
export { cajaDelCobro, type CajaParaElCobro } from './cajaDelCobro'
export { MENSAJE_OPERACION_SIMULTANEA, MENSAJES_DE_TURNO_CAMBIADO } from './mensajes'
