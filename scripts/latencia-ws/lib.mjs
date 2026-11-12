// La parte pura de la medición de latencia de order:new (RNF-07): percentiles y resumen de las muestras.
// main.mjs la usa con la red real; lib.test.mjs la prueba sin red.

/** La espera máxima por el evento de un pedido: si no llega en este tiempo, el evento cuenta como perdido. */
export const ESPERA_EVENTO_MS = 10_000

/** La meta de RNF-07. */
export const META_MS = 500

/** Percentil por rango más cercano (sin interpolar): el valor de la posición ⌈p/100 · n⌉ de la lista ordenada. */
export function percentil(valores, p) {
  if (!valores.length) return null
  if (!(p > 0 && p <= 100)) throw new RangeError('El percentil va de 0 (excluido) a 100')
  const orden = [...valores].sort((a, b) => a - b)
  return orden[Math.ceil((p / 100) * orden.length) - 1]
}

function estadisticas(valores) {
  return {
    n: valores.length,
    min: valores.length ? Math.min(...valores) : null,
    p50: percentil(valores, 50),
    p95: percentil(valores, 95),
    max: valores.length ? Math.max(...valores) : null,
  }
}

const redondear = (ms) => (ms === null ? null : Math.round(ms * 10) / 10)

function redondearTodo(e) {
  return Object.fromEntries(Object.entries(e).map(([k, v]) => [k, k === 'n' ? v : redondear(v)]))
}

/**
 * Resume las muestras de una corrida. Cada muestra es un pedido:
 * - `msEnvio`: cuándo se mandó el POST; `msRespuesta`: cuándo llegó su respuesta (los encabezados).
 * - `msEvento`: cuándo llegó su order:new al socket de cocina, o null si no llegó dentro de ESPERA_EVENTO_MS.
 * Los tres salen del mismo reloj monotónico del proceso (performance.now), así que se pueden restar.
 *
 * La latencia es la del pedido de RNF-07: del fin del POST al evento. El servidor emite antes de responder, así que
 * el evento puede llegar antes que la respuesta y dar una latencia negativa: se cuenta aparte y no se descarta.
 * También va la latencia desde el envío del POST, que no puede ser negativa.
 */
export function resumir(muestras, { esperaMs = ESPERA_EVENTO_MS, metaMs = META_MS } = {}) {
  const recibidas = muestras.filter((m) => m.msEvento !== null && m.msEvento - m.msRespuesta <= esperaMs)
  const desdeRespuesta = recibidas.map((m) => m.msEvento - m.msRespuesta)
  const desdeEnvio = recibidas.map((m) => m.msEvento - m.msEnvio)
  const http = muestras.map((m) => m.msRespuesta - m.msEnvio)
  return {
    pedidos: muestras.length,
    eventosRecibidos: recibidas.length,
    eventosPerdidos: muestras.length - recibidas.length,
    eventoAntesQueLaRespuesta: desdeRespuesta.filter((ms) => ms < 0).length,
    sobreLaMeta: desdeRespuesta.filter((ms) => ms >= metaMs).length,
    metaMs,
    esperaMs,
    desdeLaRespuestaMs: redondearTodo(estadisticas(desdeRespuesta)),
    desdeElEnvioMs: redondearTodo(estadisticas(desdeEnvio)),
    respuestaHttpMs: redondearTodo(estadisticas(http)),
  }
}

/** El resumen como tabla en Markdown, para pegar en la bitácora. */
export function resumenMarkdown(r, { sha, marcador, inicio }) {
  const fila = (nombre, e) => `| ${nombre} | ${e.n} | ${e.min} | ${e.p50} | ${e.p95} | ${e.max} |`
  return [
    `### Latencia de order:new (RNF-07, meta < ${r.metaMs} ms)`,
    '',
    `Inicio ${inicio} · SHA en staging \`${sha ?? 'desconocido'}\` · marcador \`${marcador}\``,
    '',
    `Pedidos: ${r.pedidos} · eventos recibidos: ${r.eventosRecibidos} · **perdidos: ${r.eventosPerdidos}** (sin llegar en ${r.esperaMs / 1000} s)`,
    `Evento antes que la respuesta: ${r.eventoAntesQueLaRespuesta} · en la meta o arriba (≥ ${r.metaMs} ms): ${r.sobreLaMeta}`,
    '',
    '| Medida (ms) | n | mín | p50 | p95 | máx |',
    '|---|---|---|---|---|---|',
    fila('Respuesta del POST → order:new', r.desdeLaRespuestaMs),
    fila('Envío del POST → order:new', r.desdeElEnvioMs),
    fila('Envío → respuesta del POST', r.respuestaHttpMs),
    '',
  ].join('\n')
}
