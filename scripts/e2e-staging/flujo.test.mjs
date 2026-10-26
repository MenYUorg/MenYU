// node --test scripts/e2e-staging/
// El flujo entero contra un "staging" en memoria: la API (fetch) y la base (query) comparten el mismo estado.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { correrFlujo } from './flujo.mjs'

const API = 'https://api.staging.test/api'
const SUPABASE = 'https://refstaging.supabase.co'
const RESTAURANTE = 'rest-e2e'
const ITEM = 'item-e2e'
const MARCADOR = 'e2e-99-1-'

function respuesta(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body }
}

/** Un staging en memoria. `fallas` cambia el comportamiento de un endpoint o de la base para un test. */
function staging(fallas = {}) {
  const db = { mesa: new Map(), sesion: new Map(), smc: [], pedido: new Map(), item: [], pago: new Map(), cliente: new Map() }
  const llamadas = []
  let n = 0
  const id = (p) => `${p}-${++n}`

  async function fetchFn(url, init = {}) {
    const metodo = init.method ?? 'GET'
    const ruta = url.replace(API, '').replace('https://api.staging.test', '')
    llamadas.push(`${metodo} ${ruta}`)
    const body = init.body ? JSON.parse(init.body) : undefined
    const f = fallas[`${metodo} ${ruta.split('?')[0]}`]
    if (f) {
      const r = await f({ db, body })
      if (r) return r
    }
    if (url.startsWith(SUPABASE)) return respuesta(200, { access_token: 'token-mozo' })
    if (metodo === 'GET' && ruta === '/health') return respuesta(200, { status: 'ok', db: 'ok', sha: 'abc' })
    if (metodo === 'POST' && ruta === '/sessions/open') {
      const mesa = [...db.mesa.values()].find((m) => m.qr_token === body.tableCode)
      if (!mesa) return respuesta(404, { message: 'Mesa no encontrada' })
      const sesionId = id('ses')
      const clienteId = id('cli')
      db.cliente.set(clienteId, { id: clienteId, nombre: 'Invitado' })
      db.sesion.set(sesionId, { id: sesionId, mesa_id: mesa.id, estado: 'activa', cerrada_en: null })
      db.smc.push({ sesion_id: sesionId, cliente_id: clienteId })
      mesa.estado = 'ocupada'
      return respuesta(200, { sesionId, mesaId: mesa.id, clienteId, jwt: 'jwt-sesion', esAnfitrion: true })
    }
    if (metodo === 'POST' && ruta === '/pedidos') {
      const pedidoId = id('ped')
      db.pedido.set(pedidoId, { id: pedidoId, sesion_id: body.sesionId, mesa_id: body.mesaId })
      db.item.push({ pedido_id: pedidoId, item_id: body.items[0].itemId, cantidad: 1, precio_unitario: '1000.00' })
      return respuesta(201, { id: pedidoId })
    }
    if (metodo === 'POST' && ruta === '/payments/solicitar-efectivo') {
      const pagoId = id('pago')
      db.pago.set(pagoId, { id: pagoId, sesion_id: body.sesionId, metodo: 'efectivo', estado: 'pendiente', monto: '1000.00', fecha_cobro: null })
      return respuesta(201, { pagoId, sesionId: body.sesionId, estado: 'efectivo_solicitado' })
    }
    if (metodo === 'POST' && ruta === '/payments/confirmar-efectivo') {
      const pago = db.pago.get(body.pagoId)
      pago.estado = 'aprobado'
      pago.fecha_cobro = new Date()
      const sesion = db.sesion.get(pago.sesion_id)
      sesion.estado = 'cerrada'
      sesion.cerrada_en = new Date()
      db.mesa.get(sesion.mesa_id).estado = 'libre'
      return respuesta(200, { sesionId: sesion.id, estado: 'cerrada' })
    }
    return respuesta(404, {})
  }

  const sesionesDeMesa = (m) => [...db.sesion.values()].filter((s) => s.mesa_id === m)
  const pedidosDeMesa = (m) => [...db.pedido.values()].filter((p) => p.mesa_id === m)

  async function query(sql, [p1, p2] = []) {
    llamadas.push(`SQL ${sql.slice(0, 40)}`)
    const f = fallas.db?.(sql)
    if (f) return f
    const filas = (rows) => ({ rows })
    if (sql.includes('e2e.e2e_preparar')) {
      const mesaId = id('mesa')
      db.mesa.set(mesaId, { id: mesaId, restaurante_id: p2, qr_token: `${p1}mesa`, estado: 'libre' })
      return filas([{ id_mesa: mesaId, qr: `${p1}mesa` }])
    }
    if (sql.includes('e2e.e2e_limpiar')) {
      const mesa = [...db.mesa.values()].find((m) => m.qr_token === `${p1}mesa`)
      if (!mesa) return filas([{ resultado: { mesa_encontrada: false, borradas: {} } }])
      const ses = sesionesDeMesa(mesa.id).map((s) => s.id)
      const peds = pedidosDeMesa(mesa.id).map((p) => p.id)
      const borradas = {
        mesa: 1, sesion_mesa: ses.length, pedido: peds.length,
        sesion_mesa_cliente: db.smc.filter((x) => ses.includes(x.sesion_id)).length,
        pedido_item: db.item.filter((i) => peds.includes(i.pedido_id)).length,
        pago: [...db.pago.values()].filter((x) => ses.includes(x.sesion_id)).length,
        llamado_mozo: 1, cliente: db.smc.filter((x) => ses.includes(x.sesion_id)).length,
      }
      if (!fallas.limpiezaIncompleta) {
        for (const x of db.smc.filter((y) => ses.includes(y.sesion_id))) db.cliente.delete(x.cliente_id)
        db.smc = db.smc.filter((x) => !ses.includes(x.sesion_id))
        db.item = db.item.filter((i) => !peds.includes(i.pedido_id))
        for (const [k, v] of db.pago) if (ses.includes(v.sesion_id)) db.pago.delete(k)
        for (const k of peds) db.pedido.delete(k)
        for (const k of ses) db.sesion.delete(k)
        db.mesa.delete(mesa.id)
      }
      return filas([{ resultado: { mesa_encontrada: true, borradas } }])
    }
    if (sql.startsWith('SELECT count(*) AS n FROM mesa')) return filas([{ n: String(db.mesa.has(p1) ? 1 : 0) }])
    if (sql.startsWith('SELECT count(*) AS n FROM sesion_mesa_cliente')) {
      const ses = sesionesDeMesa(p1).map((s) => s.id)
      return filas([{ n: String(db.smc.filter((x) => ses.includes(x.sesion_id)).length) }])
    }
    if (sql.startsWith('SELECT count(*) AS n FROM sesion_mesa')) return filas([{ n: String(sesionesDeMesa(p1).length) }])
    if (sql.startsWith('SELECT count(*) AS n FROM pedido_item')) {
      const peds = pedidosDeMesa(p1).map((p) => p.id)
      return filas([{ n: String(db.item.filter((i) => peds.includes(i.pedido_id)).length) }])
    }
    if (sql.startsWith('SELECT count(*) AS n FROM pedido')) return filas([{ n: String(pedidosDeMesa(p1).length) }])
    if (sql.startsWith('SELECT count(*) AS n FROM pago')) {
      const ses = sesionesDeMesa(p1).map((s) => s.id)
      return filas([{ n: String([...db.pago.values()].filter((x) => ses.includes(x.sesion_id)).length) }])
    }
    if (sql.startsWith('SELECT estado, restaurante_id, qr_token FROM mesa')) return filas(db.mesa.has(p1) ? [db.mesa.get(p1)] : [])
    if (sql.startsWith('SELECT estado FROM mesa')) return filas(db.mesa.has(p1) ? [db.mesa.get(p1)] : [])
    if (sql.startsWith('SELECT 1 FROM mesa')) return filas(db.mesa.has(p1) ? [{}] : [])
    if (sql.startsWith('SELECT id FROM sesion_mesa WHERE mesa_id')) return filas(sesionesDeMesa(p1))
    if (sql.startsWith('SELECT estado, mesa_id FROM sesion_mesa') || sql.startsWith('SELECT estado, cerrada_en FROM sesion_mesa'))
      return filas(db.sesion.has(p1) ? [db.sesion.get(p1)] : [])
    if (sql.startsWith('SELECT 1 FROM sesion_mesa')) return filas(db.sesion.has(p1) ? [{}] : [])
    if (sql.startsWith('SELECT cliente_id FROM sesion_mesa_cliente')) return filas(db.smc.filter((x) => x.sesion_id === p1))
    if (sql.startsWith('SELECT id FROM pedido WHERE sesion_id')) return filas([...db.pedido.values()].filter((p) => p.sesion_id === p1))
    if (sql.startsWith('SELECT sesion_id, mesa_id FROM pedido')) return filas(db.pedido.has(p1) ? [db.pedido.get(p1)] : [])
    if (sql.startsWith('SELECT 1 FROM pedido')) return filas(db.pedido.has(p1) ? [{}] : [])
    if (sql.startsWith('SELECT item_id, cantidad, precio_unitario FROM pedido_item')) return filas(db.item.filter((i) => i.pedido_id === p1))
    if (sql.startsWith('SELECT id FROM pago WHERE sesion_id'))
      return filas([...db.pago.values()].filter((x) => x.sesion_id === p1 && x.estado === 'pendiente'))
    if (sql.startsWith("SELECT id FROM pago WHERE id = $1 AND estado = 'aprobado'"))
      return filas(db.pago.get(p1)?.estado === 'aprobado' ? [db.pago.get(p1)] : [])
    if (sql.startsWith('SELECT sesion_id, metodo, estado, monto FROM pago') || sql.startsWith('SELECT estado, fecha_cobro FROM pago'))
      return filas(db.pago.has(p1) ? [db.pago.get(p1)] : [])
    if (sql.startsWith('SELECT 1 FROM pago')) return filas(db.pago.has(p1) ? [{}] : [])
    if (sql.startsWith('SELECT 1 FROM cliente')) return filas(db.cliente.has(p1) ? [{}] : [])
    throw new Error(`SQL sin simular: ${sql}`)
  }

  return { db, llamadas, fetchFn, query }
}

function correr(s, extra = {}) {
  const esperas = []
  return correrFlujo({
    apiUrl: API, supabaseUrl: SUPABASE, publishableKey: 'pk', mozoEmail: 'mozo@x', mozoPassword: 'pw',
    restauranteId: RESTAURANTE, itemId: ITEM, marcador: MARCADOR, sha: 'abc',
    db: { query: s.query }, fetchFn: s.fetchFn, dormir: async (ms) => esperas.push(ms), log: () => {}, ...extra,
  }).then((reporte) => ({ reporte, esperas }))
}

test('camino feliz: los 7 pasos en ok, la limpieza borra lo que creó y no queda nada', async () => {
  const s = staging()
  const { reporte } = await correr(s)
  assert.equal(reporte.categoria, 'ok')
  assert.equal(reporte.sha, 'abc', 'el SHA probado sale de /health')
  assert.deepEqual(reporte.pasos.map((p) => [p.paso, p.categoria]), [
    ['0. preparación', 'ok'], ['1. QR: abrir la sesión', 'ok'], ['2. pedido', 'ok'], ['3. pedido de efectivo', 'ok'],
    ['4. el mozo confirma el efectivo', 'ok'], ['5. cierre', 'ok'], ['6. limpieza', 'ok'],
  ])
  assert.ok(reporte.pasos.every((p) => p.base === true))
  assert.equal(reporte.limpieza.coincide, true)
  assert.deepEqual(reporte.limpieza.creadas, { mesa: 1, sesion_mesa: 1, sesion_mesa_cliente: 1, pedido: 1, pedido_item: 1, pago: 1 })
  assert.equal(s.db.mesa.size + s.db.sesion.size + s.db.pedido.size + s.db.pago.size + s.db.cliente.size, 0)
})

test('las llamadas a la API: QR sin token, pedido y efectivo con el token de sesión, confirmación con el del mozo', async () => {
  const s = staging()
  const vistas = []
  const fetchFn = async (url, init) => { vistas.push([url, init?.headers?.authorization ?? null]); return s.fetchFn(url, init) }
  await correr(s, { fetchFn })
  const por = (fin) => vistas.find(([u]) => u.endsWith(fin))?.[1]
  assert.equal(por('/sessions/open'), null)
  assert.equal(por('/pedidos'), 'Bearer jwt-sesion')
  assert.equal(por('/payments/solicitar-efectivo'), 'Bearer jwt-sesion')
  assert.equal(por('/payments/confirmar-efectivo'), 'Bearer token-mozo')
  assert.ok(vistas.some(([u]) => u === 'https://api.staging.test/health'), '/health se pide sin el /api')
})

test('un 4xx inesperado es de producto: corta ahí, no reintenta y la limpieza corre igual', async () => {
  const s = staging({ 'POST /pedidos': () => respuesta(400, { message: 'La sesión no está activa' }) })
  const { reporte } = await correr(s)
  assert.equal(reporte.categoria, 'producto')
  assert.deepEqual(reporte.pasos.map((p) => p.paso), ['0. preparación', '1. QR: abrir la sesión', '2. pedido', '6. limpieza'])
  const pedido = reporte.pasos[2]
  assert.equal(pedido.http, 400)
  assert.equal(pedido.reintentos, 0)
  assert.match(pedido.detalle, /La sesión no está activa/)
  assert.equal(reporte.pasos[3].categoria, 'ok')
  assert.equal(s.db.mesa.size, 0)
})

test('la base sin la fila esperada es de producto', async () => {
  const s = staging({ db: (sql) => (sql.startsWith('SELECT item_id, cantidad, precio_unitario') ? { rows: [] } : null) })
  const { reporte } = await correr(s)
  assert.equal(reporte.categoria, 'producto')
  const pedido = reporte.pasos.find((p) => p.paso === '2. pedido')
  assert.equal(pedido.base, false)
  assert.match(pedido.detalle, /ítem de prueba/)
})

test('un 502 en una escritura: espera, mira la base y, si el efecto ya está, sigue sin repetirla', async () => {
  let veces = 0
  const s = staging({
    'POST /payments/solicitar-efectivo': async ({ db, body }) => {
      veces++
      db.pago.set('pago-x', { id: 'pago-x', sesion_id: body.sesionId, metodo: 'efectivo', estado: 'pendiente', monto: '1000.00' })
      return respuesta(502, {})
    },
  })
  const { reporte, esperas } = await correr(s)
  assert.equal(reporte.categoria, 'ok')
  assert.equal(veces, 1, 'no se repite el POST si el pago ya está en la base')
  assert.equal(reporte.pasos.find((p) => p.paso === '3. pedido de efectivo').reintentos, 1)
  assert.ok(esperas.includes(10_000))
})

test('un 502 en una escritura sin efecto en la base: reintenta una sola vez y, si vuelve a fallar, es infraestructura', async () => {
  let veces = 0
  const s = staging({ 'POST /pedidos': () => { veces++; return respuesta(503, {}) } })
  const { reporte } = await correr(s)
  assert.equal(veces, 2)
  assert.equal(reporte.categoria, 'infraestructura')
  assert.equal(reporte.pasos.find((p) => p.paso === '2. pedido').http, 503)
  assert.equal(reporte.pasos.at(-1).paso, '6. limpieza')
})

test('/health degraded es infraestructura y no se crea nada (no hay limpieza que hacer)', async () => {
  const s = staging({ 'GET /health': () => respuesta(200, { status: 'degraded', db: 'error' }) })
  const { reporte, esperas } = await correr(s)
  assert.equal(reporte.categoria, 'infraestructura')
  assert.deepEqual(esperas, [10_000, 20_000, 40_000])
  assert.deepEqual(reporte.pasos.map((p) => p.paso), ['0. preparación'])
  assert.equal(reporte.limpieza, null)
  assert.ok(!s.llamadas.some((l) => l.includes('e2e_preparar')))
})

test('si /health no muestra el SHA desplegado es infraestructura, después de reintentar, y no se crea nada', async () => {
  const s = staging()
  const { reporte, esperas } = await correr(s, { sha: 'otro-sha' })
  assert.equal(reporte.categoria, 'infraestructura')
  assert.match(reporte.pasos[0].detalle, /no muestra el SHA desplegado/)
  assert.deepEqual(esperas, [10_000, 20_000, 40_000])
  assert.ok(!s.llamadas.some((l) => l.includes('e2e_preparar')))
})

test('sin SHA esperado (a mano) no se compara, y el reporte guarda el que muestra /health', async () => {
  const { reporte } = await correr(staging(), { sha: null })
  assert.equal(reporte.categoria, 'ok')
  assert.equal(reporte.sha, 'abc')
  assert.equal(reporte.shaEsperado, null)
})

test('el login del mozo rechazado es de configuración, y la limpieza corre igual', async () => {
  const s = staging({ 'POST https://refstaging.supabase.co/auth/v1/token': () => respuesta(400, { error_code: 'invalid_credentials' }) })
  const fetchFn = async (url, init) =>
    url.startsWith(SUPABASE) ? respuesta(400, { error_code: 'invalid_credentials' }) : s.fetchFn(url, init)
  const { reporte } = await correr(s, { fetchFn })
  assert.equal(reporte.categoria, 'configuracion')
  assert.equal(reporte.pasos.at(-1).categoria, 'ok')
  assert.equal(s.db.mesa.size, 0)
})

test('si la limpieza deja filas, el paso 6 es de producto y lo dice', async () => {
  const s = staging({ limpiezaIncompleta: true })
  const { reporte } = await correr(s)
  assert.equal(reporte.categoria, 'producto')
  assert.match(reporte.pasos.at(-1).detalle, /quedan filas en: mesa, sesion_mesa, pedido, pago, cliente/)
  assert.equal(reporte.limpieza.coincide, false)
})

test('el reporte no lleva tokens, contraseñas ni la clave pública', async () => {
  const { reporte } = await correr(staging())
  const texto = JSON.stringify(reporte)
  for (const secreto of ['jwt-sesion', 'token-mozo', '"pw"', '"pk"']) assert.ok(!texto.includes(secreto), secreto)
})
