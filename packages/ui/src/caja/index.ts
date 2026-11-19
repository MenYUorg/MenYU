// Lo puro de caja y turnos (#358, #359, #360) que comparten web-staff y web-admin: el cobro, los montos, el arqueo, las
// fechas y el orden de las mesas.
export { leerMonto, MONTO_MAXIMO, type ErrorDeMonto, type MontoLeido } from './monto'
export { parsearPropina, PROPINA_MAXIMA, type PropinaLeida } from './propina'
export { cajaDelCobro, type CajaParaElCobro } from './cajaDelCobro'
export { MENSAJE_OPERACION_SIMULTANEA, MENSAJES_DE_TURNO_CAMBIADO } from './mensajes'
export { formatearFechaHora, formatearFechaHoraCompleta, formatearMonto } from './formato'
export {
  clasificarDiferencia,
  ETIQUETA_DEL_METODO,
  METODOS_DE_ARQUEO,
  textoDeDiferencia,
  type ClaseDeDiferencia,
} from './arqueo'
export { ordenarMesas } from './mesas'
