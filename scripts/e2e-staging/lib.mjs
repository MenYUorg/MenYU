// E2E contra staging (docs/calidad/e2e-supabase.md): funciones puras, sin red ni base, que testea lib.test.mjs.
// Nunca imprimen ni devuelven URLs con credenciales, tokens o contraseñas.
import { hostDe, hostsDeProduccion } from '../carga/guardas.mjs'

/** Esperas entre reintentos de una lectura (e2e-supabase.md:110): 10, 20 y 40 segundos. */
export const ESPERAS_LECTURA_MS = [10_000, 20_000, 40_000]
/** Antes de revisar si una escritura que falló por infraestructura llegó a la base. */
export const ESPERA_ESCRITURA_MS = 10_000

/** Las categorías del reporte (e2e-supabase.md:113-121), más `configuracion`: el job no pudo ni empezar el flujo. */
export const CATEGORIAS = ['ok', 'infraestructura', 'producto', 'configuracion']

/** Una falla de un paso, con su categoría. */
export class FallaE2E extends Error {
  constructor(categoria, mensaje, { http = null } = {}) {
    super(mensaje)
    this.name = 'FallaE2E'
    this.categoria = categoria
    this.http = http
  }
}

/** Mismo formato que valida el SQL (scripts/e2e-staging/sql/e2e-staging.sql, e2e_preparar y e2e_limpiar). */
const FORMA_MARCADOR = /^e2e-([0-9]{1,20}-[0-9]{1,3}|local-[0-9a-f]{8})-$/

export function marcadorValido(marcador) {
  return typeof marcador === 'string' && FORMA_MARCADOR.test(marcador)
}

/**
 * El marcador de la corrida: `e2e-<GITHUB_RUN_ID>-<GITHUB_RUN_ATTEMPT>-` en Actions (como los e2e del backend,
 * apps/backend/src/sessions/sessions.e2e-spec.ts:18-20) o `e2e-local-<8 hex>-` fuera de Actions.
 */
export function marcadorDeCorrida(env, hexAlAzar) {
  const marcador = env.GITHUB_RUN_ID
    ? `e2e-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT || '1'}-`
    : `e2e-local-${hexAlAzar()}-`
  if (!marcadorValido(marcador)) throw new FallaE2E('configuracion', 'El marcador de la corrida no tiene el formato esperado')
  return marcador
}

/** Las variables que el job necesita. Devuelve los nombres que faltan, sin sus valores. */
export const VARIABLES = [
  'SMOKE_API_URL',
  'E2E_SUPABASE_URL',
  'E2E_SUPABASE_PUBLISHABLE_KEY',
  'E2E_SUPABASE_URL_PRODUCCION',
  'E2E_STAGING_DB_URL_LECTURA',
  'E2E_STAGING_MOZO_EMAIL',
  'E2E_STAGING_MOZO_PASSWORD',
  'E2E_STAGING_RESTAURANTE_ID',
  'E2E_STAGING_ITEM_ID',
]

export function variablesFaltantes(env) {
  return VARIABLES.filter((nombre) => !env[nombre]?.trim())
}

/** El ref del proyecto de una URL https://<ref>.supabase.co, o null. */
export function refDeSupabase(url) {
  const m = /^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/.exec(String(url ?? '').trim())
  return m ? m[1] : null
}

/**
 * Errores que impiden correr contra estos destinos (lista vacía si se puede). Nunca contra producción:
 * - La API: https y un host que no sea de producción (la misma lista que las pruebas de carga, scripts/carga/guardas.mjs).
 * - Supabase: una URL https://<ref>.supabase.co distinta de la de producción.
 * - La base: el usuario es e2e_staging y, si la URL nombra un proyecto (en el usuario del pooler o en el host directo),
 *   es el mismo que el de Supabase de staging.
 */
export function erroresDeDestino({ apiUrl, supabaseUrl, supabaseUrlProduccion, dbUrl, prodHosts }) {
  const errores = []
  const hostApi = hostDe(apiUrl)
  if (!String(apiUrl ?? '').trim().startsWith('https://') || !hostApi) errores.push('La URL de la API no es https')
  else if (hostsDeProduccion(prodHosts).includes(hostApi)) errores.push('La URL de la API es de producción')
  if (!/\/api\/?$/.test(String(apiUrl ?? '').trim())) errores.push('La URL de la API tiene que terminar en /api')

  const ref = refDeSupabase(supabaseUrl)
  const refProd = refDeSupabase(supabaseUrlProduccion)
  if (!ref) errores.push('La URL de Supabase de staging no tiene la forma https://<ref>.supabase.co')
  if (!refProd) errores.push('No se pudo leer la URL de Supabase de producción para compararla')
  if (ref && refProd && ref === refProd) errores.push('La URL de Supabase de staging es la de producción')

  let url
  try {
    url = new URL(String(dbUrl ?? ''))
  } catch {
    errores.push('La URL de la base no es válida')
    return errores
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) errores.push('La URL de la base no es postgres://')
  const usuario = decodeURIComponent(url.username)
  const [rol, refDelUsuario] = usuario.split('.')
  if (rol !== 'e2e_staging') errores.push('La URL de la base no usa el usuario e2e_staging')
  const refDelHost = /^db\.([a-z0-9]+)\.supabase\.co$/.exec(url.hostname)?.[1]
  for (const otro of [refDelUsuario, refDelHost].filter(Boolean)) {
    if (ref && otro !== ref) errores.push('La URL de la base es de otro proyecto de Supabase que el de staging')
  }
  return [...new Set(errores)]
}

/**
 * Opciones de conexión de `pg`: la URL sin los parámetros ssl* (si quedan, `pg` los usa en lugar de `ssl`) y TLS siempre.
 * Con `ca` (el certificado de Supabase, opcional) verifica el servidor; sin él, cifra pero no verifica el certificado.
 */
export function opcionesDeConexion(dbUrl, ca) {
  const url = new URL(dbUrl)
  for (const clave of [...url.searchParams.keys()]) if (clave.startsWith('ssl')) url.searchParams.delete(clave)
  return {
    connectionString: url.toString(),
    ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
    statement_timeout: 15_000,
    connectionTimeoutMillis: 15_000,
  }
}

/** Categoría de una respuesta HTTP que no es la esperada: 502, 503 y 504 son de infraestructura; el resto, de producto. */
export function categoriaDeHttp(status) {
  return [502, 503, 504].includes(status) ? 'infraestructura' : 'producto'
}

/** Un error lanzado por fetch o por la base (no una FallaE2E): red, timeout o conexión. */
export function categoriaDeError(err) {
  return err instanceof FallaE2E ? err.categoria : 'infraestructura'
}

/**
 * Corre una lectura con hasta 3 reintentos (10, 20 y 40 s) si falla por infraestructura. Una falla de producto (el dato
 * no es el esperado) no se reintenta: la base ya respondió. Devuelve el resultado y cuántos reintentos hizo.
 */
export async function conReintentos(leer, { esperas = ESPERAS_LECTURA_MS, dormir }) {
  for (let intento = 0; ; intento++) {
    try {
      return { valor: await leer(), reintentos: intento }
    } catch (err) {
      if (categoriaDeError(err) !== 'infraestructura' || intento >= esperas.length) throw err
      await dormir(esperas[intento])
    }
  }
}

/** La categoría de la corrida: la del primer paso que no dio ok, o ok. */
export function categoriaFinal(pasos) {
  return pasos.find((p) => p.categoria !== 'ok')?.categoria ?? 'ok'
}

/**
 * Compara lo que creó la corrida (contado con e2e_staging) con lo que borró e2e_limpiar, tabla por tabla.
 * Devuelve las diferencias: lista vacía si coinciden.
 */
export function diferenciasDeLimpieza(creadas, borradas) {
  const diferencias = []
  for (const [tabla, n] of Object.entries(creadas)) {
    const b = borradas?.[tabla] ?? 0
    if (b !== n) diferencias.push(`${tabla}: creadas ${n}, borradas ${b}`)
  }
  return diferencias
}

/** Duración legible: "850 ms" o "12,4 s". */
export function duracion(ms) {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1).replace('.', ',')} s`
}

/** Tabla en markdown para $GITHUB_STEP_SUMMARY (e2e-supabase.md:167). Sin URLs, tokens ni la conexión a la base. */
export function resumenMarkdown(reporte) {
  const filas = reporte.pasos.map((p) =>
    `| ${p.paso} | ${p.categoria} | ${p.http ?? '—'} | ${p.msApi == null ? '—' : duracion(p.msApi)} | ` +
    `${p.base === null ? '—' : p.base ? 'sí' : 'no'} | ${p.reintentos} | ${p.detalle ? String(p.detalle).replace(/\|/g, '/') : ''} |`,
  )
  return [
    `## E2E contra staging: ${reporte.categoria}`,
    '',
    `SHA probado: \`${reporte.sha ?? 'no lo sé'}\` · marcador \`${reporte.marcador}\` · duración ${duracion(reporte.msTotal)}`,
    '',
    '| Paso | Categoría | HTTP | Duración API | Base ok | Reintentos | Detalle |',
    '|---|---|---|---|---|---|---|',
    ...filas,
    '',
    reporte.limpieza
      ? `Limpieza: ${reporte.limpieza.coincide ? 'borró lo mismo que creó' : 'NO coincide con lo creado'} ` +
        `(creadas ${JSON.stringify(reporte.limpieza.creadas)}; borradas ${JSON.stringify(reporte.limpieza.borradas)})`
      : 'Limpieza: no corrió (no se llegó a crear la mesa)',
    '',
  ].join('\n')
}
