// Revisión automática de accesibilidad con axe (RNF-20, WCAG 2.2 nivel AA) sobre las pantallas principales de staging:
// web-auth, web-cliente, web-staff y web-admin. No reemplaza la prueba con lector de pantalla (VoiceOver y TalkBack),
// que hace una persona: axe solo encuentra lo que se puede comprobar desde el DOM.
//
// Tres fases, cada una en un contexto de navegador nuevo:
// 1. Públicas: web-auth y web-cliente sin sesión (la carta del restaurante de prueba del E2E).
// 2. Mesa: las pantallas de web-cliente con una sesión de mesa. Abre una mesa nueva en el restaurante de prueba con
//    e2e.e2e_preparar, entra por el mismo link que el QR impreso (/check-in) y al final la borra con e2e.e2e_limpiar
//    (docs/calidad/e2e-supabase.md). Sin E2E_STAGING_DB_URL_LECTURA se saltea.
// 3. Personal: inicia sesión en web-auth con AXE_PERSONAL_EMAIL y AXE_PERSONAL_PASSWORD (una cuenta OWNER de prueba) y
//    revisa web-admin y web-staff. Solo navega: no crea ni cambia nada. Sin esas variables se saltea.
//
// Uso (desde la raíz del repo; playwright y @axe-core/playwright se instalan aparte, como pg en el E2E):
//   npm install --prefix scripts/accesibilidad --no-save --no-package-lock --no-audit --no-fund playwright@1.60.0 @axe-core/playwright@4.14.0 pg@8.20.0
//   node --env-file=<archivo> scripts/accesibilidad/main.mjs [--canal chrome]
// Variables: SMOKE_API_URL y WEB_AUTH_URL, WEB_CLIENTE_URL, WEB_STAFF_URL y WEB_ADMIN_URL (las del smoke de staging),
// E2E_STAGING_RESTAURANTE_ID y E2E_STAGING_ITEM_ID; para la fase 2, además, las de scripts/e2e-staging/lib.mjs
// (VARIABLES); para la 3, AXE_PERSONAL_EMAIL y AXE_PERSONAL_PASSWORD. PROD_HOSTS es opcional.
// `--canal chrome` usa el Chrome instalado en lugar del Chromium de Playwright (que pide `npx playwright install chromium`).
// Deja el reporte en resultados/axe-<fecha>.json (o AXE_REPORTE). No imprime contraseñas, tokens ni la URL de la base.
import { mkdirSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { parseArgs } from 'node:util'
import { hostDe, hostsDeProduccion } from '../carga/guardas.mjs'
import { erroresDeDestino, marcadorDeCorrida, opcionesDeConexion, variablesFaltantes } from '../e2e-staging/lib.mjs'
import { ETIQUETAS_WCAG, observaciones, resumenMarkdown, totales } from './lib.mjs'

const { values: opciones } = parseArgs({ options: { canal: { type: 'string' } } })
const env = process.env
const sinBarra = (url) => String(url ?? '').trim().replace(/\/+$/, '')
const URLS = {
  api: sinBarra(env.SMOKE_API_URL),
  'web-auth': sinBarra(env.WEB_AUTH_URL),
  'web-cliente': sinBarra(env.WEB_CLIENTE_URL),
  'web-staff': sinBarra(env.WEB_STAFF_URL),
  'web-admin': sinBarra(env.WEB_ADMIN_URL),
}
const restauranteId = env.E2E_STAGING_RESTAURANTE_ID?.trim()
const itemId = env.E2E_STAGING_ITEM_ID?.trim()

const prod = hostsDeProduccion(env.PROD_HOSTS)
const errores = []
for (const [nombre, url] of Object.entries(URLS)) {
  const host = hostDe(url)
  if (!host || !url.startsWith('https://')) errores.push(`La URL de ${nombre} no es https`)
  else if (prod.includes(host)) errores.push(`La URL de ${nombre} es de producción`)
}
if (!restauranteId || !itemId) errores.push('Faltan E2E_STAGING_RESTAURANTE_ID o E2E_STAGING_ITEM_ID')
if (errores.length) {
  console.error(`No se corre: ${errores.join('; ')}`)
  process.exit(1)
}

const conMesa = Boolean(env.E2E_STAGING_DB_URL_LECTURA?.trim())
if (conMesa) {
  const faltan = variablesFaltantes(env)
  const destino = erroresDeDestino({
    apiUrl: env.SMOKE_API_URL,
    supabaseUrl: env.E2E_SUPABASE_URL,
    supabaseUrlProduccion: env.E2E_SUPABASE_URL_PRODUCCION,
    dbUrl: env.E2E_STAGING_DB_URL_LECTURA,
    prodHosts: env.PROD_HOSTS,
  })
  if (faltan.length || destino.length) {
    console.error(`No se corre la fase de mesa: ${[...faltan.map((v) => `falta ${v}`), ...destino].join('; ')}`)
    process.exit(1)
  }
}
const conPersonal = Boolean(env.AXE_PERSONAL_EMAIL?.trim() && env.AXE_PERSONAL_PASSWORD)

const PUBLICAS = [
  ['web-auth', 'Ingresar', '/'],
  ['web-auth', 'Crear cuenta', '/crear-cuenta'],
  ['web-auth', 'Olvidé la contraseña', '/olvide-contrasena'],
  ['web-auth', 'Privacidad', '/privacidad'],
  ['web-cliente', 'Discovery (inicio)', '/'],
  ['web-cliente', 'Ficha del restaurante', `/restaurante/${restauranteId}`],
  ['web-cliente', 'Carta (solo lectura)', `/restaurante/${restauranteId}/carta`],
  ['web-cliente', 'Ingreso a la mesa (PIN)', `/restaurante/${restauranteId}/mesa`],
]
const DE_MESA = [
  ['web-cliente', 'Menú de la mesa', '/menu'],
  ['web-cliente', 'Detalle del plato', `/menu/${itemId}`],
  ['web-cliente', 'Carrito', '/carrito'],
  ['web-cliente', 'Mis pedidos', '/pedidos'],
  ['web-cliente', 'Pagar', '/pagar'],
]
const DEL_PERSONAL = [
  ['web-admin', 'Dashboard', '/admin/dashboard'],
  ['web-admin', 'Menú', '/admin/menu'],
  ['web-admin', 'Mesas', '/admin/tables'],
  ['web-admin', 'Pedidos', '/admin/pedidos'],
  ['web-admin', 'Personal', '/admin/mozos'],
  ['web-admin', 'Pagos', '/admin/pagos'],
  ['web-admin', 'Reportes', '/admin/reportes'],
  ['web-admin', 'Auditoría', '/admin/auditoria'],
  ['web-admin', 'Historial de sesiones', '/admin/historial'],
  ['web-admin', 'Marca', '/admin/marca'],
  ['web-admin', 'Asistente', '/admin/asistente'],
  ['web-staff', 'Selector de vista', '/selector'],
  ['web-staff', 'Cocina', '/cocina'],
  ['web-staff', 'Mozo: mesas', '/mozo/mesas'],
  ['web-staff', 'Mozo: pedidos', '/mozo/pedidos'],
  ['web-staff', 'Mozo: toma de pedidos', '/mozo/toma-pedidos'],
  ['web-staff', 'Mozo: pagos', '/mozo/pagos'],
  ['web-staff', 'Mozo: historial', '/mozo/historial'],
]

const { chromium } = await import('playwright')
const { default: AxeBuilder } = await import('@axe-core/playwright')
const navegador = await chromium.launch(opciones.canal ? { channel: opciones.canal } : {})
const inicio = new Date().toISOString()
const resultados = []
let versionAxe = null

/**
 * Espera a que la URL cumpla `condicion`, mirando page.url() cada 250 ms. Con waitForURL, el fin del login venció en dos
 * de tres corridas (12/11/2026) aunque la página ya estaba en web-admin.
 */
async function esperarUrl(page, condicion, ms = 30_000) {
  const hasta = Date.now() + ms
  while (!condicion(new URL(page.url()))) {
    if (Date.now() > hasta) throw new Error(`la URL no cambió en ${ms / 1000} s (sigue en ${new URL(page.url()).host})`)
    await page.waitForTimeout(250)
  }
}

/** Espera a que la pantalla termine de cargar: la red quieta (sin contar el socket) y un momento para el render. */
async function esperarCarga(page) {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  await page.waitForTimeout(1_000)
}

async function revisar(page, [app, pantalla, ruta], { navegar = true } = {}) {
  const url = `${URLS[app]}${ruta}`
  const fila = { app, pantalla, ruta }
  try {
    if (navegar) await page.goto(url, { waitUntil: 'load', timeout: 30_000 })
    await esperarCarga(page)
    const final = new URL(page.url())
    fila.rutaFinal = final.pathname
    if (final.host !== new URL(URLS[app]).host) throw new Error(`terminó en otra app (${final.host}${final.pathname})`)
    // Una ruta que el rol no ve redirige a otra pantalla de la app: se revisaría esa otra dos veces.
    if (navegar && final.pathname.replace(/\/+$/, '') !== ruta.replace(/\/+$/, '')) throw new Error(`redirigió a ${final.pathname}`)
    const r = await new AxeBuilder({ page }).withTags(ETIQUETAS_WCAG).analyze()
    versionAxe ??= r.testEngine?.version ?? null
    fila.violaciones = r.violations
    fila.incompletas = r.incomplete.length
    fila.reglasQuePasaron = r.passes.length
    console.log(`ok    ${app} ${pantalla}: ${r.violations.length} violaciones`)
  } catch (err) {
    fila.error = err.message.split('\n')[0]
    console.log(`FALLA ${app} ${pantalla}: ${fila.error}`)
  }
  resultados.push(fila)
}

let falla = null
try {
  // ── 1. Públicas ──────────────────────────────────────────────────────────
  {
    const ctx = await navegador.newContext({ locale: 'es-AR' })
    const page = await ctx.newPage()
    for (const p of PUBLICAS) await revisar(page, p)
    await ctx.close()
  }

  // ── 2. Mesa ──────────────────────────────────────────────────────────────
  if (conMesa) {
    const { default: pg } = await import('pg')
    const marcador = marcadorDeCorrida(env, () => randomBytes(4).toString('hex'))
    const db = new pg.Client(opcionesDeConexion(env.E2E_STAGING_DB_URL_LECTURA.trim(), env.E2E_STAGING_DB_CA || undefined))
    await db.connect()
    let mesaCreada = false
    try {
      const { rows: [{ usuario }] } = await db.query('SELECT current_user AS usuario')
      if (usuario !== 'e2e_staging') throw new Error('La conexión a la base no es con el usuario e2e_staging')
      const { rows } = await db.query('SELECT id_mesa, qr FROM e2e.e2e_preparar($1, $2)', [marcador, restauranteId])
      if (rows.length !== 1) throw new Error('e2e_preparar no devolvió la mesa')
      mesaCreada = true
      const ctx = await navegador.newContext({ locale: 'es-AR' })
      const page = await ctx.newPage()
      // El mismo link que el QR impreso: abre la sesión y sigue al menú (o a elegir el nombre, según la mesa).
      await page.goto(`${URLS['web-cliente']}/check-in?restaurantId=${restauranteId}&tableCode=${encodeURIComponent(rows[0].qr)}`)
      await esperarUrl(page, (u) => !u.pathname.startsWith('/check-in'))
      const primera = new URL(page.url()).pathname
      if (primera !== '/menu') await revisar(page, ['web-cliente', `Primera pantalla después del QR (${primera})`, primera], { navegar: false })
      for (const p of DE_MESA) await revisar(page, p)
      await ctx.close()
    } finally {
      if (mesaCreada) {
        const { rows: [{ e2e_limpiar: borradas }] } = await db.query('SELECT e2e.e2e_limpiar($1)', [marcador])
        console.log(`limpieza (${marcador}): ${JSON.stringify(borradas)}`)
      }
      await db.end().catch(() => {})
    }
  } else {
    for (const [app, pantalla, ruta] of DE_MESA) resultados.push({ app, pantalla, ruta, error: 'fase de mesa salteada (sin la base)' })
  }

  // ── 3. Personal ──────────────────────────────────────────────────────────
  if (conPersonal) {
    const ctx = await navegador.newContext({ locale: 'es-AR' })
    const page = await ctx.newPage()
    const destino = `${URLS['web-admin']}/admin/dashboard`
    await page.goto(`${URLS['web-auth']}/?redirect=${encodeURIComponent(destino)}`)
    await page.locator('input[type="email"]').fill(env.AXE_PERSONAL_EMAIL.trim())
    await page.locator('input[type="password"]').fill(env.AXE_PERSONAL_PASSWORD)
    await page.locator('button[type="submit"]').first().click()
    await esperarUrl(page, (u) => u.host === new URL(URLS['web-admin']).host)
    for (const p of DEL_PERSONAL) await revisar(page, p)
    await ctx.close()
  } else {
    for (const [app, pantalla, ruta] of DEL_PERSONAL) resultados.push({ app, pantalla, ruta, error: 'fase del personal salteada (sin la cuenta)' })
  }
} catch (err) {
  falla = err
  console.error(`FALLA: ${err.message.split('\n')[0]}`)
} finally {
  await navegador.close()
}

const health = await fetch(`${URLS.api.replace(/\/api$/, '')}/health`).then((r) => r.json()).catch(() => null)
const obs = observaciones(resultados)
const reporte = {
  inicio,
  fin: new Date().toISOString(),
  sha: typeof health?.sha === 'string' ? health.sha : null,
  axe: versionAxe,
  etiquetas: ETIQUETAS_WCAG,
  navegador: opciones.canal ?? 'chromium',
  pantallas: resultados.map(({ violaciones, ...resto }) => ({ ...resto, violaciones: violaciones?.length })),
  observaciones: obs,
  totales: totales(obs),
}
const ruta = env.AXE_REPORTE || `resultados/axe-${inicio.replace(/[:.]/g, '-')}.json`
mkdirSync(ruta.replace(/[^/]+$/, '') || '.', { recursive: true })
writeFileSync(ruta, JSON.stringify(reporte, null, 2))
console.log(`\n${resumenMarkdown({ inicio, axe: versionAxe, sha: reporte.sha, pantallas: resultados, totales: reporte.totales })}\nReporte: ${ruta}`)
process.exit(falla ? 1 : 0)
