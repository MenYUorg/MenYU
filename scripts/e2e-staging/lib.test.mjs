// node --test scripts/e2e-staging/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  FallaE2E,
  categoriaDeError,
  categoriaDeHttp,
  categoriaFinal,
  conReintentos,
  diferenciasDeLimpieza,
  duracion,
  erroresDeDestino,
  marcadorDeCorrida,
  marcadorValido,
  opcionesDeConexion,
  refDeSupabase,
  resumenMarkdown,
  variablesFaltantes,
  VARIABLES,
} from './lib.mjs'

const DESTINO_OK = {
  apiUrl: 'https://api.staging.menyu-app.com/api',
  supabaseUrl: 'https://refstaging.supabase.co',
  supabaseUrlProduccion: 'https://refprod.supabase.co',
  dbUrl: 'postgresql://e2e_staging.refstaging:secreta@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require',
  prodHosts: 'https://admin.menyu-app.com,https://mesa.menyu-app.com',
}

test('marcador: el de Actions y el local tienen el formato que acepta el SQL', () => {
  assert.equal(marcadorDeCorrida({ GITHUB_RUN_ID: '40100656575', GITHUB_RUN_ATTEMPT: '2' }, () => 'x'), 'e2e-40100656575-2-')
  assert.equal(marcadorDeCorrida({ GITHUB_RUN_ID: '123' }, () => 'x'), 'e2e-123-1-')
  assert.equal(marcadorDeCorrida({}, () => '0a1b2c3d'), 'e2e-local-0a1b2c3d-')
  assert.throws(() => marcadorDeCorrida({}, () => 'NO-HEX'), FallaE2E)
})

test('marcadorValido: rechaza comodines, vacíos y prefijos sueltos', () => {
  for (const malo of ['', 'e2e-', 'e2e-%', 'e2e-1-1', 'x-e2e-1-1-', 'e2e-local-xyz-', null, undefined]) {
    assert.equal(marcadorValido(malo), false, String(malo))
  }
  assert.equal(marcadorValido('e2e-1-1-'), true)
})

test('variablesFaltantes: nombra las que faltan o están vacías, nunca los valores', () => {
  const todas = Object.fromEntries(VARIABLES.map((v) => [v, 'valor']))
  assert.deepEqual(variablesFaltantes(todas), [])
  assert.deepEqual(variablesFaltantes({ ...todas, E2E_STAGING_MOZO_PASSWORD: '  ' }), ['E2E_STAGING_MOZO_PASSWORD'])
})

test('refDeSupabase', () => {
  assert.equal(refDeSupabase('https://abc123.supabase.co'), 'abc123')
  assert.equal(refDeSupabase('https://abc123.supabase.co/'), 'abc123')
  assert.equal(refDeSupabase('http://abc123.supabase.co'), null)
  assert.equal(refDeSupabase('https://evil.com'), null)
})

test('erroresDeDestino: staging bien armado no tiene errores', () => {
  assert.deepEqual(erroresDeDestino(DESTINO_OK), [])
  assert.deepEqual(erroresDeDestino({ ...DESTINO_OK, dbUrl: 'postgres://e2e_staging:x@db.refstaging.supabase.co:5432/postgres' }), [])
})

test('erroresDeDestino: la API de producción o sin https', () => {
  assert.match(erroresDeDestino({ ...DESTINO_OK, apiUrl: 'https://api.menyu-app.com/api' }).join(), /producción/)
  assert.match(erroresDeDestino({ ...DESTINO_OK, apiUrl: 'https://menyu-backend-production.up.railway.app/api' }).join(), /producción/)
  assert.match(erroresDeDestino({ ...DESTINO_OK, apiUrl: 'http://api.staging.menyu-app.com/api' }).join(), /https/)
  assert.match(erroresDeDestino({ ...DESTINO_OK, apiUrl: 'https://api.staging.menyu-app.com' }).join(), /\/api/)
})

test('erroresDeDestino: Supabase de producción, o sin poder compararlo', () => {
  assert.match(erroresDeDestino({ ...DESTINO_OK, supabaseUrl: DESTINO_OK.supabaseUrlProduccion }).join(), /es la de producción/)
  assert.match(erroresDeDestino({ ...DESTINO_OK, supabaseUrlProduccion: '' }).join(), /No se pudo leer/)
})

test('erroresDeDestino: la base con otro usuario o de otro proyecto', () => {
  const conUsuario = (u) => DESTINO_OK.dbUrl.replace('e2e_staging.refstaging', u)
  assert.match(erroresDeDestino({ ...DESTINO_OK, dbUrl: conUsuario('postgres.refstaging') }).join(), /e2e_staging/)
  assert.match(erroresDeDestino({ ...DESTINO_OK, dbUrl: conUsuario('e2e_staging.refprod') }).join(), /otro proyecto/)
  assert.match(erroresDeDestino({ ...DESTINO_OK, dbUrl: 'postgres://e2e_staging:x@db.refprod.supabase.co:5432/postgres' }).join(), /otro proyecto/)
  assert.match(erroresDeDestino({ ...DESTINO_OK, dbUrl: 'no es una url' }).join(), /no es válida/)
})

test('erroresDeDestino: los mensajes no incluyen la contraseña ni los hosts', () => {
  const todo = erroresDeDestino({ ...DESTINO_OK, apiUrl: 'https://api.menyu-app.com/api', dbUrl: DESTINO_OK.dbUrl.replace('e2e_staging.', 'otro.') }).join(' ')
  assert.doesNotMatch(todo, /secreta|pooler|menyu-app\.com|refstaging/)
})

test('opcionesDeConexion: saca los parámetros ssl* y siempre usa TLS', () => {
  const sinCa = opcionesDeConexion(DESTINO_OK.dbUrl)
  assert.doesNotMatch(sinCa.connectionString, /sslmode/)
  assert.deepEqual(sinCa.ssl, { rejectUnauthorized: false })
  assert.deepEqual(opcionesDeConexion(DESTINO_OK.dbUrl, 'CERT').ssl, { ca: 'CERT', rejectUnauthorized: true })
})

test('categoriaDeHttp y categoriaDeError', () => {
  for (const s of [502, 503, 504]) assert.equal(categoriaDeHttp(s), 'infraestructura')
  for (const s of [400, 401, 403, 404, 409, 500]) assert.equal(categoriaDeHttp(s), 'producto')
  assert.equal(categoriaDeError(new TypeError('fetch failed')), 'infraestructura')
  assert.equal(categoriaDeError(new FallaE2E('producto', 'x')), 'producto')
})

test('conReintentos: reintenta solo la infraestructura, con 10, 20 y 40 s', async () => {
  const esperas = []
  let llamadas = 0
  const r = await conReintentos(async () => { if (++llamadas < 3) throw new Error('ECONNRESET'); return 'ok' }, { dormir: async (ms) => esperas.push(ms) })
  assert.deepEqual(r, { valor: 'ok', reintentos: 2 })
  assert.deepEqual(esperas, [10_000, 20_000])

  let deProducto = 0
  await assert.rejects(conReintentos(async () => { deProducto++; throw new FallaE2E('producto', 'no') }, { dormir: async () => {} }))
  assert.equal(deProducto, 1)

  const todas = []
  await assert.rejects(conReintentos(async () => { throw new Error('caída') }, { dormir: async (ms) => todas.push(ms) }))
  assert.deepEqual(todas, [10_000, 20_000, 40_000])
})

test('categoriaFinal: la del primer paso que no dio ok', () => {
  assert.equal(categoriaFinal([{ categoria: 'ok' }, { categoria: 'ok' }]), 'ok')
  assert.equal(categoriaFinal([{ categoria: 'ok' }, { categoria: 'infraestructura' }, { categoria: 'producto' }]), 'infraestructura')
  assert.equal(categoriaFinal([]), 'ok')
})

test('diferenciasDeLimpieza', () => {
  assert.deepEqual(diferenciasDeLimpieza({ mesa: 1, pedido: 1 }, { mesa: 1, pedido: 1, llamado_mozo: 1 }), [])
  assert.deepEqual(diferenciasDeLimpieza({ mesa: 1, pago: 1 }, { mesa: 1 }), ['pago: creadas 1, borradas 0'])
})

test('duracion', () => {
  assert.equal(duracion(850), '850 ms')
  assert.equal(duracion(12_400), '12,4 s')
})

test('resumenMarkdown: una fila por paso y sin datos sensibles', () => {
  const md = resumenMarkdown({
    categoria: 'ok', sha: 'abc', marcador: 'e2e-1-1-', msTotal: 3000,
    pasos: [{ paso: '0. preparación', categoria: 'ok', http: null, msApi: null, base: true, reintentos: 0, detalle: null }],
    limpieza: { coincide: true, creadas: { mesa: 1 }, borradas: { mesa: 1 } },
  })
  assert.match(md, /## E2E contra staging: ok/)
  assert.match(md, /\| 0\. preparación \| ok \| — \| — \| sí \| 0 \|/)
  assert.match(md, /borró lo mismo que creó/)
})
