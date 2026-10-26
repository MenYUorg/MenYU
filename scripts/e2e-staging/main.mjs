// E2E contra staging: lee la configuración del entorno, comprueba que nada apunte a producción, corre el flujo
// (flujo.mjs) con el usuario e2e_staging y deja el reporte en resultados/e2e-staging.json y en $GITHUB_STEP_SUMMARY.
// Uso (en el workflow .github/workflows/e2e-staging.yml): node scripts/e2e-staging/main.mjs
// Termina en 0 solo si la categoría final es ok. No imprime tokens, contraseñas, URLs ni la conexión a la base.
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { correrFlujo } from './flujo.mjs'
import { erroresDeDestino, marcadorDeCorrida, opcionesDeConexion, resumenMarkdown, variablesFaltantes } from './lib.mjs'

const env = process.env
const RUTA_REPORTE = env.E2E_REPORTE || 'resultados/e2e-staging.json'

function terminar(reporte) {
  mkdirSync(RUTA_REPORTE.replace(/[^/]+$/, '') || '.', { recursive: true })
  writeFileSync(RUTA_REPORTE, JSON.stringify(reporte, null, 2))
  const md = resumenMarkdown(reporte)
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, md)
  console.log(`\n${md}`)
  if (reporte.categoria !== 'ok') console.log(`::error::E2E contra staging: ${reporte.categoria}`)
  process.exit(reporte.categoria === 'ok' ? 0 : 1)
}

function sinEmpezar(marcador, detalle) {
  return {
    sha: env.EXPECTED_SHA || null,
    marcador,
    categoria: 'configuracion',
    pasos: [{ paso: 'configuración', categoria: 'configuracion', http: null, msApi: null, base: null, reintentos: 0, detalle }],
    limpieza: null,
    msTotal: 0,
  }
}

let marcador = null
try {
  marcador = marcadorDeCorrida(env, () => randomBytes(4).toString('hex'))
} catch (err) {
  terminar(sinEmpezar(null, err.message))
}

const faltan = variablesFaltantes(env)
if (faltan.length) terminar(sinEmpezar(marcador, `Faltan variables: ${faltan.join(', ')}`))

const errores = erroresDeDestino({
  apiUrl: env.SMOKE_API_URL,
  supabaseUrl: env.E2E_SUPABASE_URL,
  supabaseUrlProduccion: env.E2E_SUPABASE_URL_PRODUCCION,
  dbUrl: env.E2E_STAGING_DB_URL_LECTURA,
  prodHosts: env.PROD_HOSTS,
})
if (errores.length) terminar(sinEmpezar(marcador, errores.join('; ')))

// `pg` no es dependencia de la raíz del monorepo: el workflow lo instala fijado en scripts/e2e-staging/node_modules.
const { default: pg } = await import('pg')
const cliente = new pg.Client(opcionesDeConexion(env.E2E_STAGING_DB_URL_LECTURA.trim(), env.E2E_STAGING_DB_CA || undefined))
try {
  await cliente.connect()
  const { rows } = await cliente.query('SELECT current_user AS usuario')
  if (rows[0]?.usuario !== 'e2e_staging') {
    await cliente.end().catch(() => {})
    terminar(sinEmpezar(marcador, 'La conexión a la base no es con el usuario e2e_staging'))
  }
} catch (err) {
  await cliente.end().catch(() => {})
  const reporte = sinEmpezar(marcador, `No se pudo conectar a la base (${err.code ?? err.name})`)
  reporte.categoria = reporte.pasos[0].categoria = 'infraestructura'
  terminar(reporte)
}

let reporte
try {
  reporte = await correrFlujo({
    apiUrl: env.SMOKE_API_URL.trim().replace(/\/+$/, ''),
    supabaseUrl: env.E2E_SUPABASE_URL.trim(),
    publishableKey: env.E2E_SUPABASE_PUBLISHABLE_KEY.trim(),
    mozoEmail: env.E2E_STAGING_MOZO_EMAIL.trim(),
    mozoPassword: env.E2E_STAGING_MOZO_PASSWORD,
    restauranteId: env.E2E_STAGING_RESTAURANTE_ID.trim(),
    itemId: env.E2E_STAGING_ITEM_ID.trim(),
    marcador,
    sha: env.EXPECTED_SHA || null,
    db: cliente,
  })
} finally {
  await cliente.end().catch(() => {})
}
terminar(reporte)
