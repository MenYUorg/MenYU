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

/**
 * Un staging en memoria. `fallas` cambia el comportamiento de un endpoint o de la base para un test. `cajas` y
 * `turnos` son lo que ya había en el restaurante de prueba (de corridas anteriores). Con `backendViejo`, la
 * confirmación no le pone caja al pago (el backend de antes de #358); con `cajaDelPago`, se la pone a otra.
 */
function staging(fallas = {}, { cajas = [], turnos = [], backendViejo = false, cajaDelPago = null } = {}) {
  const db = {
    mesa: new Map(), sesion: new Map(), smc: [], pedido: new Map(), item: [], pago: new Map(), cliente: new Map(),
    cajas: cajas.map((c) => ({ ...c })), turnos: turnos.map((t) => ({ ...t, cajas: t.cajas.map((x) => ({ ...x })) })), cierres: [],
  }
  const turnoAbierto = () => db.turnos.find((t) => !t.cerrado) ?? null
  const comoTurno = (t) => ({ id: t.id, cajas: t.cajas.map((x) => ({ id: x.id, cajaId: x.cajaId })) })
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
    if (url.startsWith(SUPABASE)) return respuesta(200, { access_token: body.email === 'owner@x' ? 'token-owner' : 'token-mozo' })
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
      const turno = turnoAbierto()
      if (!turno && !backendViejo) return respuesta(400, { message: 'No hay un turno abierto' })
      pago.estado = 'aprobado'
      pago.fecha_cobro = new Date()
      pago.turno_caja_id = backendViejo ? null : (cajaDelPago ?? turno.cajas[0].id)
      const sesion = db.sesion.get(pago.sesion_id)
      sesion.estado = 'cerrada'
      sesion.cerrada_en = new Date()
      db.mesa.get(sesion.mesa_id).estado = 'libre'
      return respuesta(200, { sesionId: sesion.id, estado: 'cerrada' })
    }
    if (metodo === 'GET' && ruta.startsWith('/cajas?')) return respuesta(200, db.cajas)
    if (metodo === 'POST' && ruta === '/cajas') {
      const caja = { id: id('caja'), nombre: body.nombre, activa: true }
      db.cajas.push(caja)
      return respuesta(201, caja)
    }
    if (metodo === 'PATCH' && ruta.startsWith('/cajas/')) {
      const caja = db.cajas.find((c) => c.id === ruta.split('/')[2])
      Object.assign(caja, body)
      return respuesta(200, caja)
    }
    if (metodo === 'GET' && ruta.startsWith('/turnos/actual?')) {
      const turno = turnoAbierto()
      return respuesta(200, { turno: turno ? comoTurno(turno) : null })
    }
    if (metodo === 'POST' && ruta === '/turnos') {
      if (turnoAbierto()) return respuesta(409, { message: 'Ya hay un turno abierto en este restaurante' })
      const turno = { id: id('turno'), cerrado: false, cajas: body.cajas.map((x) => ({ id: id('apertura'), cajaId: x.cajaId })) }
      db.turnos.push(turno)
      return respuesta(201, { turno: comoTurno(turno) })
    }
    const cierre = /^\/turnos\/([^/]+)\/cierre$/.exec(ruta)
    if (metodo === 'POST' && cierre) {
      const turno = db.turnos.find((t) => t.id === cierre[1])
      if (turno.cerrado) return respuesta(409, { message: 'El turno está cerrado' })
      turno.cerrado = true
      db.cierres.push({ turnoId: turno.id, cajas: body.cajas })
      // El esperado de efectivo: los pagos en efectivo aprobados de la apertura (el fondo es 0 y no hay movimientos).
      const arqueos = turno.cajas.map((apertura) => {
        const declarado = body.cajas.find((x) => x.cajaId === apertura.cajaId).declarado
        const cobrado = [...db.pago.values()]
          .filter((p) => p.turno_caja_id === apertura.id && p.estado === 'aprobado' && p.metodo === 'efectivo')
          .reduce((acc, p) => acc + Number(p.monto), 0)
        const metodos = ['efectivo', 'debito', 'credito', 'transferencia'].map((metodo) => {
          const esperado = (metodo === 'efectivo' ? cobrado : 0) + (fallas.arqueoDesfasado && metodo === 'efectivo' ? 1 : 0)
          return { metodo, esperado, declarado: declarado[metodo], diferencia: declarado[metodo] - esperado }
        })
        return { cajaId: apertura.cajaId, metodos }
      })
      return respuesta(200, { turno: { id: turno.id }, arqueos })
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
    if (sql.startsWith('SELECT sesion_id, metodo, estado, monto FROM pago') || sql.startsWith('SELECT estado, fecha_cobro, turno_caja_id FROM pago'))
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
    ownerEmail: 'owner@x', ownerPassword: 'pw-owner',
    restauranteId: RESTAURANTE, itemId: ITEM, marcador: MARCADOR, sha: 'abc',
    db: { query: s.query }, fetchFn: s.fetchFn, dormir: async (ms) => esperas.push(ms), log: () => {}, ...extra,
  }).then((reporte) => ({ reporte, esperas }))
}

test('camino feliz: los 9 pasos en ok, el cobro en la caja del turno, el turno cerrado y no queda nada', async () => {
  const s = staging()
  const { reporte } = await correr(s)
  assert.equal(reporte.categoria, 'ok')
  assert.equal(reporte.sha, 'abc', 'el SHA probado sale de /health')
  assert.deepEqual(reporte.pasos.map((p) => [p.paso, p.categoria]), [
    ['0. preparación', 'ok'], ['1. QR: abrir la sesión', 'ok'], ['2. pedido', 'ok'], ['3. pedido de efectivo', 'ok'],
    ['3b. abrir el turno', 'ok'], ['4. el mozo confirma el efectivo', 'ok'], ['5. cierre', 'ok'], ['5b. cerrar el turno', 'ok'],
    ['6. limpieza', 'ok'],
  ])
  // El turno y su cierre se miran por la API: e2e_staging no ve las tablas de caja.
  for (const p of reporte.pasos) assert.equal(p.base, ['3b. abrir el turno', '5b. cerrar el turno'].includes(p.paso) ? null : true, p.paso)
  assert.equal(s.db.turnos.length, 1)
  assert.equal(s.db.turnos[0].cerrado, true)
  assert.deepEqual(s.db.cierres[0].cajas[0].declarado, { efectivo: 1000, debito: 0, credito: 0, transferencia: 0 })
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
  assert.equal(por('/turnos'), 'Bearer token-owner')
  assert.equal(vistas.find(([u]) => u.endsWith('/cierre'))?.[1], 'Bearer token-owner')
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

/** Supabase rechaza el login de esa cuenta; las demás pasan. */
const rechazarLogin = (s, email) => async (url, init) =>
  url.startsWith(SUPABASE) && JSON.parse(init.body).email === email ? respuesta(400, { error_code: 'invalid_credentials' }) : s.fetchFn(url, init)

test('el login del mozo rechazado es de configuración, y el turno se cierra y la limpieza corre igual', async () => {
  const s = staging()
  const { reporte } = await correr(s, { fetchFn: rechazarLogin(s, 'mozo@x') })
  assert.equal(reporte.categoria, 'configuracion')
  assert.match(reporte.pasos.find((p) => p.paso === '4. el mozo confirma el efectivo').detalle, /login del mozo/)
  assert.deepEqual(reporte.pasos.slice(-2).map((p) => [p.paso, p.categoria]), [['5b. cerrar el turno', 'ok'], ['6. limpieza', 'ok']])
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
  for (const secreto of ['jwt-sesion', 'token-mozo', 'token-owner', '"pw"', 'pw-owner', '"pk"']) assert.ok(!texto.includes(secreto), secreto)
})

// ── El turno de la caja (#358) ────────────────────────────────────────────

const CAJA_ACTIVA = { id: 'caja-vieja', nombre: 'Caja E2E', activa: true }
const nombresDe = (reporte) => reporte.pasos.map((p) => p.paso)

test('sin "Caja E2E" en el restaurante: la crea, abre el turno con ella y no toca ninguna otra caja', async () => {
  const s = staging({}, { cajas: [{ id: 'caja-otra', nombre: 'Barra', activa: true }] })
  const { reporte } = await correr(s)
  assert.equal(reporte.categoria, 'ok')
  const creada = s.db.cajas.find((c) => c.nombre === 'Caja E2E')
  assert.ok(creada?.activa)
  assert.deepEqual(s.db.turnos[0].cajas.map((x) => x.cajaId), [creada.id])
  assert.ok(s.llamadas.includes('POST /cajas'))
})

test('con "Caja E2E" activa: la reutiliza, sin crear ni modificar cajas', async () => {
  const s = staging({}, { cajas: [CAJA_ACTIVA] })
  const { reporte } = await correr(s)
  assert.equal(reporte.categoria, 'ok')
  assert.equal(s.db.cajas.length, 1)
  assert.ok(!s.llamadas.some((l) => l.startsWith('POST /cajas') || l.startsWith('PATCH /cajas')))
  assert.equal(s.db.turnos[0].cajas[0].cajaId, 'caja-vieja')
})

test('con "Caja E2E" inactiva: la reactiva (PATCH activa: true) y la usa', async () => {
  const s = staging({}, { cajas: [{ ...CAJA_ACTIVA, activa: false }] })
  const { reporte } = await correr(s)
  assert.equal(reporte.categoria, 'ok')
  assert.ok(s.llamadas.includes('PATCH /cajas/caja-vieja'))
  assert.equal(s.db.cajas[0].activa, true)
  assert.equal(s.db.turnos.at(-1).cajas[0].cajaId, 'caja-vieja')
})

test('un turno abierto de una corrida anterior: primero lo cierra en cero, después abre uno nuevo y lo usa', async () => {
  const previo = { id: 'turno-previo', cerrado: false, cajas: [{ id: 'apertura-previa', cajaId: 'caja-vieja' }] }
  const s = staging({}, { cajas: [CAJA_ACTIVA], turnos: [previo] })
  const { reporte } = await correr(s)
  assert.equal(reporte.categoria, 'ok')
  const [cierrePrevio, cierreNuevo] = s.db.cierres
  assert.deepEqual(cierrePrevio, {
    turnoId: 'turno-previo',
    cajas: [{ cajaId: 'caja-vieja', declarado: { efectivo: 0, debito: 0, credito: 0, transferencia: 0 } }],
  })
  const nuevo = s.db.turnos.at(-1)
  assert.notEqual(nuevo.id, 'turno-previo')
  assert.equal(cierreNuevo.turnoId, nuevo.id)
  assert.ok(s.db.turnos.every((t) => t.cerrado))
  assert.ok(s.llamadas.indexOf('POST /turnos/turno-previo/cierre') < s.llamadas.indexOf('POST /turnos'))
  assert.match(reporte.pasos.find((p) => p.paso === '3b. abrir el turno').detalle, /había quedado abierto/)
})

test('si falla el paso 4, el turno se cierra igual (en cero) y antes de la limpieza', async () => {
  const s = staging({ 'POST /payments/confirmar-efectivo': () => respuesta(400, { message: 'No hay un turno abierto' }) })
  const { reporte } = await correr(s)
  assert.equal(reporte.categoria, 'producto')
  assert.deepEqual(nombresDe(reporte).slice(-3), ['4. el mozo confirma el efectivo', '5b. cerrar el turno', '6. limpieza'])
  assert.equal(reporte.pasos.find((p) => p.paso === '5b. cerrar el turno').categoria, 'ok')
  assert.equal(s.db.cierres[0].cajas[0].declarado.efectivo, 0)
  assert.ok(s.db.turnos.every((t) => t.cerrado))
  assert.ok(s.llamadas.findIndex((l) => l.endsWith('/cierre')) < s.llamadas.findIndex((l) => l.includes('e2e.e2e_limpiar')))
})

test('el login del OWNER rechazado es de configuración: no se abre turno ni se cobra, y la limpieza corre', async () => {
  const s = staging()
  const { reporte } = await correr(s, { fetchFn: rechazarLogin(s, 'owner@x') })
  assert.equal(reporte.categoria, 'configuracion')
  assert.deepEqual(nombresDe(reporte).slice(-2), ['3b. abrir el turno', '6. limpieza'])
  assert.match(reporte.pasos.find((p) => p.paso === '3b. abrir el turno').detalle, /login del OWNER/)
  assert.equal(s.db.turnos.length, 0)
  assert.equal(reporte.pasos.at(-1).categoria, 'ok')
})

test('con SHA, el pago en otra caja es de producto (y el turno se cierra igual)', async () => {
  const s = staging({}, { cajaDelPago: 'apertura-ajena' })
  const { reporte } = await correr(s)
  assert.equal(reporte.categoria, 'producto')
  const paso4 = reporte.pasos.find((p) => p.paso === '4. el mozo confirma el efectivo')
  assert.equal(paso4.categoria, 'producto')
  assert.match(paso4.detalle, /caja apertura-ajena/)
  assert.ok(s.db.turnos.every((t) => t.cerrado))
})

test('con SHA, el pago sin caja (turno_caja_id null) es de producto', async () => {
  const s = staging({}, { backendViejo: true })
  const { reporte } = await correr(s)
  assert.equal(reporte.categoria, 'producto')
  assert.match(reporte.pasos.find((p) => p.paso === '4. el mozo confirma el efectivo').detalle, /caja ninguna/)
})

test('sin SHA (a mano), el pago sin caja de un backend anterior se acepta y se anota; el turno se cierra en cero', async () => {
  const s = staging({}, { backendViejo: true })
  const { reporte } = await correr(s, { sha: null })
  assert.equal(reporte.categoria, 'ok')
  assert.match(reporte.pasos.find((p) => p.paso === '4. el mozo confirma el efectivo').detalle, /turno_caja_id null/)
  assert.equal(s.db.cierres[0].cajas[0].declarado.efectivo, 0)
})

test('sin SHA, un pago en otra caja sigue siendo de producto', async () => {
  const s = staging({}, { cajaDelPago: 'apertura-ajena' })
  const { reporte } = await correr(s, { sha: null })
  assert.equal(reporte.categoria, 'producto')
})

test('con SHA, un cierre cuyo esperado de efectivo no es el total (o con diferencia) es de producto, y la limpieza corre', async () => {
  const s = staging({ arqueoDesfasado: true })
  const { reporte } = await correr(s)
  assert.equal(reporte.categoria, 'producto')
  const paso5b = reporte.pasos.find((p) => p.paso === '5b. cerrar el turno')
  assert.equal(paso5b.categoria, 'producto')
  assert.match(paso5b.detalle, /esperaba 1001 en efectivo con diferencia -1/)
  assert.equal(reporte.pasos.at(-1).paso, '6. limpieza')
  assert.equal(reporte.pasos.at(-1).categoria, 'ok')
})
