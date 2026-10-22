// Configuración común de las pruebas de carga (k6). Solo lecturas públicas: GET /health, /api/discovery,
// /api/discovery/buscar, /api/discovery/restaurantes/:id y /api/menu/:restauranteId. Nada escribe en la base.
// Proceso, umbrales y comandos: docs/calidad/k6.md.
import http from 'k6/http'
import { check, group, sleep } from 'k6'
import exec from 'k6/execution'
import { erroresDeConfiguracion, urlBackend } from './guardas.mjs'

// ── Guardas: corren al cargar el script, antes de cualquier request ──────────
const errores = erroresDeConfiguracion(__ENV)
if (errores.length > 0) {
  throw new Error(`No se corre la prueba de carga:\n- ${errores.join('\n- ')}\nVer docs/calidad/k6.md.`)
}

export const API = __ENV.BASE_URL.trim().replace(/\/+$/, '')
export const BACKEND = urlBackend(API)
const BUSQUEDA = __ENV.K6_BUSQUEDA || 'pizza'

/**
 * Umbrales iniciales (docs/calidad/k6.md, "Umbrales iniciales"): a confirmar con la primera corrida de humo.
 * `abortOnFail` corta la prueba si la tasa de error se dispara, para no seguir cargando un staging caído.
 */
export function umbrales({ errorMax, p95Ms, p95HealthMs }) {
  return {
    http_req_failed: [{ threshold: `rate<${errorMax}`, abortOnFail: true, delayAbortEval: '30s' }],
    http_req_duration: [`p(95)<${p95Ms}`],
    'http_req_duration{endpoint:health}': [`p(95)<${p95HealthMs}`],
    checks: ['rate>0.99'],
  }
}

const PARAMS = (endpoint) => ({ tags: { endpoint }, timeout: '10s' })

/** Un restaurante del listado para las lecturas por id. Si no hay ninguno, esas lecturas se saltean. */
export function setup() {
  const res = http.get(`${API}/discovery`, PARAMS('discovery'))
  const restaurantes = res.status === 200 ? res.json('restaurantes') : null
  const ids = Array.isArray(restaurantes) ? restaurantes.map((r) => r.id).filter(Boolean) : []
  if (ids.length === 0) console.warn('GET /discovery no trajo restaurantes: se saltean las lecturas por id.')
  return { ids }
}

/** Una visita de un comensal anónimo: health, discovery, búsqueda y, si hay, un restaurante con su carta. */
export function visita({ ids }) {
  group('health', () => {
    const res = http.get(`${BACKEND}/health`, PARAMS('health'))
    check(res, {
      'health 200': (r) => r.status === 200,
      'health con la base ok': (r) => r.status === 200 && r.json('db') === 'ok',
    })
  })

  group('discovery', () => {
    const res = http.get(`${API}/discovery`, PARAMS('discovery'))
    check(res, { 'discovery 200': (r) => r.status === 200 })
  })
  sleep(1)

  group('buscar', () => {
    const res = http.get(`${API}/discovery/buscar?q=${encodeURIComponent(BUSQUEDA)}`, PARAMS('buscar'))
    check(res, { 'buscar 200': (r) => r.status === 200 })
  })
  sleep(1)

  if (ids.length > 0) {
    const id = ids[exec.scenario.iterationInTest % ids.length]
    group('restaurante', () => {
      const res = http.get(`${API}/discovery/restaurantes/${id}`, PARAMS('restaurante'))
      check(res, { 'restaurante 200': (r) => r.status === 200 })
    })
    group('menu', () => {
      const res = http.get(`${API}/menu/${id}`, PARAMS('menu'))
      check(res, { 'menu 200': (r) => r.status === 200 })
    })
  }
  sleep(1 + Math.random() * 2)
}

/**
 * Resumen en JSON para el artifact (K6_RESUMEN, por defecto resultados/<escenario>-resumen.json) y un texto corto
 * por consola. No incluye la URL ni el host.
 */
export function resumen(escenario) {
  return (data) => {
    const ruta = __ENV.K6_RESUMEN || `resultados/${escenario}-resumen.json`
    const m = data.metrics
    const valor = (metrica, clave) => (m[metrica] && m[metrica].values ? m[metrica].values[clave] : undefined)
    const umbralesFallados = Object.entries(m)
      .filter(([, metrica]) => metrica.thresholds && Object.values(metrica.thresholds).some((t) => !t.ok))
      .map(([nombre]) => nombre)
    const lineas = [
      `Escenario: ${escenario}`,
      `Requests: ${valor('http_reqs', 'count')}`,
      `Tasa de error: ${valor('http_req_failed', 'rate')}`,
      `p95 de duración (ms): ${valor('http_req_duration', 'p(95)')}`,
      `Checks OK: ${valor('checks', 'rate')}`,
      `Umbrales fallados: ${umbralesFallados.length ? umbralesFallados.join(', ') : 'ninguno'}`,
      `Resumen JSON: ${ruta}`,
      '',
    ]
    return { [ruta]: JSON.stringify(data, null, 2), stdout: lineas.join('\n') }
  }
}
