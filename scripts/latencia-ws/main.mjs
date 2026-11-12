// Latencia de order:new contra staging (RNF-07, meta < 500 ms): cuánto tarda en llegar el evento a un socket unido a la
// sala de cocina (con el token de Supabase del mozo de prueba) desde que responde el POST /pedidos de ese pedido.
//
// Usa la misma infraestructura que el E2E contra staging (docs/calidad/e2e-supabase.md): las mismas variables, las
// mismas guardas para no tocar nunca producción y las funciones de base e2e.e2e_preparar (una mesa nueva en el
// restaurante de prueba, marcada con el marcador de la corrida) y e2e.e2e_limpiar (borra esa mesa y todo lo que cuelga
// de ella). La limpieza corre siempre que se creó la mesa, aunque la medición falle a la mitad.
//
// Los pedidos van de a uno: se manda el POST, se espera su order:new (hasta lib.ESPERA_EVENTO_MS) y recién ahí el
// siguiente, así cada evento se empareja por el id del pedido y la medición no se mezcla con la cola de otro.
//
// Uso (desde la raíz del repo; pg y socket.io-client se instalan aparte, como en el E2E):
//   npm install --prefix scripts/latencia-ws --no-save --no-package-lock --no-audit --no-fund pg@8.20.0 socket.io-client@4.8.3
//   node --env-file=<archivo con las variables de scripts/e2e-staging/lib.mjs (VARIABLES)> scripts/latencia-ws/main.mjs [--pedidos 100]
// Además de esas variables lee PROD_HOSTS (opcional, los hosts de producción separados por coma).
// Deja el reporte en resultados/latencia-ws-<fecha>.json (o LATENCIA_REPORTE). No imprime tokens, contraseñas ni la URL de
// la base.
import { mkdirSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { parseArgs } from 'node:util'
import { erroresDeDestino, marcadorDeCorrida, opcionesDeConexion, variablesFaltantes } from '../e2e-staging/lib.mjs'
import { ESPERA_EVENTO_MS, resumir, resumenMarkdown } from './lib.mjs'

const TIMEOUT_HTTP_MS = 15_000
const PAUSA_ENTRE_PEDIDOS_MS = 100

const { values: opciones } = parseArgs({ options: { pedidos: { type: 'string', default: '100' } } })
const cantidad = Number(opciones.pedidos)
if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 500) {
  console.error('--pedidos tiene que ser un entero entre 1 y 500')
  process.exit(1)
}

const env = process.env
const faltan = variablesFaltantes(env)
if (faltan.length) {
  console.error(`Faltan variables: ${faltan.join(', ')}`)
  process.exit(1)
}
const errores = erroresDeDestino({
  apiUrl: env.SMOKE_API_URL,
  supabaseUrl: env.E2E_SUPABASE_URL,
  supabaseUrlProduccion: env.E2E_SUPABASE_URL_PRODUCCION,
  dbUrl: env.E2E_STAGING_DB_URL_LECTURA,
  prodHosts: env.PROD_HOSTS,
})
if (errores.length) {
  console.error(`No se corre: ${errores.join('; ')}`)
  process.exit(1)
}

const apiUrl = env.SMOKE_API_URL.trim().replace(/\/+$/, '')
const backendUrl = apiUrl.replace(/\/api$/, '')
const restauranteId = env.E2E_STAGING_RESTAURANTE_ID.trim()
const itemId = env.E2E_STAGING_ITEM_ID.trim()
const marcador = marcadorDeCorrida(env, () => randomBytes(4).toString('hex'))
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
const inicio = new Date().toISOString()

async function http(metodo, url, { token, body, headers } = {}) {
  try {
    const res = await fetch(url, {
      method: metodo,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_HTTP_MS),
    })
    return { status: res.status, body: await res.json().catch(() => null) }
  } catch (err) {
    // Solo el método y la ruta: el host y los parámetros pueden ser de la configuración.
    throw new Error(`${metodo} ${new URL(url).pathname}: ${err.message}`)
  }
}

function exigir(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje)
}

// pg y socket.io-client no son dependencias de la raíz del monorepo: se instalan fijados en scripts/latencia-ws.
const { default: pg } = await import('pg')
const { io } = await import('socket.io-client')

const db = new pg.Client(opcionesDeConexion(env.E2E_STAGING_DB_URL_LECTURA.trim(), env.E2E_STAGING_DB_CA || undefined))
await db.connect()
const { rows: [{ usuario }] } = await db.query('SELECT current_user AS usuario')
if (usuario !== 'e2e_staging') {
  await db.end()
  console.error('La conexión a la base no es con el usuario e2e_staging')
  process.exit(1)
}

let socket = null
let mesaCreada = false
let limpieza = null
let reporte = null
let falla = null
try {
  const health = await http('GET', `${backendUrl}/health`)
  exigir(health.status === 200, `/health respondió ${health.status}`)
  const sha = typeof health.body?.sha === 'string' ? health.body.sha : null
  console.log(`staging en ${sha} · marcador ${marcador}`)

  // El mozo de prueba (MOZO del restaurante de prueba, que entra a la sala de cocina: TODO_EL_PERSONAL).
  const login = await http('POST', `${env.E2E_SUPABASE_URL.trim().replace(/\/$/, '')}/auth/v1/token?grant_type=password`, {
    headers: { apikey: env.E2E_SUPABASE_PUBLISHABLE_KEY.trim() },
    body: { email: env.E2E_STAGING_MOZO_EMAIL.trim(), password: env.E2E_STAGING_MOZO_PASSWORD },
  })
  exigir(login.status === 200 && typeof login.body?.access_token === 'string', `El login del mozo en Supabase respondió ${login.status}`)

  // El socket, como el de web-staff (apps/web-staff/src/services/socket.ts): namespace /ws, solo websocket, token en auth.
  const llegadas = new Map()
  socket = io(`${backendUrl}/ws`, { transports: ['websocket'], auth: { token: login.body.access_token }, reconnection: false })
  socket.on('order:new', (pedido) => {
    const t = performance.now()
    if (typeof pedido?.id === 'string' && !llegadas.has(pedido.id)) llegadas.set(pedido.id, t)
  })
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve)
    socket.once('connect_error', (err) => reject(new Error(`No conectó el socket: ${err.message}`)))
  })
  const join = await socket.timeout(TIMEOUT_HTTP_MS).emitWithAck('cocina:join', { restauranteId })
  exigir(join?.ok === true, 'cocina:join no respondió ok')

  const { rows: mesas } = await db.query('SELECT id_mesa, qr FROM e2e.e2e_preparar($1, $2)', [marcador, restauranteId])
  exigir(mesas.length === 1, 'e2e_preparar no devolvió la mesa')
  mesaCreada = true
  const [{ id_mesa: mesaId, qr }] = mesas

  const sesion = await http('POST', `${apiUrl}/sessions/open`, { body: { tableCode: qr, restauranteId } })
  exigir(sesion.status === 200 && typeof sesion.body?.jwt === 'string', `POST /sessions/open respondió ${sesion.status}`)
  const { jwt, sesionId } = sesion.body

  const muestras = []
  for (let i = 1; i <= cantidad; i++) {
    const msEnvio = performance.now()
    const res = await fetch(`${apiUrl}/pedidos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ sesionId, mesaId, items: [{ itemId, cantidad: 1 }] }),
      signal: AbortSignal.timeout(TIMEOUT_HTTP_MS),
    })
    const msRespuesta = performance.now()
    const body = await res.json().catch(() => null)
    exigir([200, 201].includes(res.status) && typeof body?.id === 'string', `POST /pedidos (${i}) respondió ${res.status}`)

    while (!llegadas.has(body.id) && performance.now() - msRespuesta < ESPERA_EVENTO_MS) await dormir(2)
    const msEvento = llegadas.get(body.id) ?? null
    muestras.push({ i, pedidoId: body.id, http: res.status, msEnvio, msRespuesta, msEvento })
    if (i % 10 === 0) console.log(`${i}/${cantidad}`)
    await dormir(PAUSA_ENTRE_PEDIDOS_MS)
  }

  const resumen = resumir(muestras)
  reporte = { inicio, fin: new Date().toISOString(), sha, marcador, restauranteId, pedidos: cantidad, resumen, muestras }
} catch (err) {
  falla = err
  console.error(`FALLA: ${err.message}`)
} finally {
  socket?.disconnect()
  if (mesaCreada) {
    try {
      const { rows: [{ e2e_limpiar: borradas }] } = await db.query('SELECT e2e.e2e_limpiar($1)', [marcador])
      limpieza = borradas
      console.log(`limpieza: ${JSON.stringify(borradas)}`)
    } catch (err) {
      limpieza = { error: err.message }
      console.error(`FALLA la limpieza: ${err.message}. Borrar a mano: SELECT e2e.e2e_limpiar('${marcador}')`)
    }
  }
  await db.end().catch(() => {})
}

if (reporte) {
  reporte.limpieza = limpieza
  const ruta = env.LATENCIA_REPORTE || `resultados/latencia-ws-${inicio.replace(/[:.]/g, '-')}.json`
  mkdirSync(ruta.replace(/[^/]+$/, '') || '.', { recursive: true })
  writeFileSync(ruta, JSON.stringify(reporte, null, 2))
  console.log(`\n${resumenMarkdown(reporte.resumen, reporte)}\nReporte: ${ruta}`)
}
process.exit(falla || limpieza?.error ? 1 : 0)
