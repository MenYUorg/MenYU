// Tests del smoke post-deploy: node --test scripts/smoke/lib.test.mjs
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { correrSmoke, esperarSha, leerVariable, requerirEnv, urlBackend } from './lib.mjs'

const API = 'https://api.staging.test/api'
const BACKEND = 'https://api.staging.test'

function respuesta(status, body) {
  return { status, json: async () => (body === undefined ? Promise.reject(new Error('sin JSON')) : body) }
}

/** fetch falso: `rutas` mapea URL → respuesta, o una función que devuelve la respuesta de cada llamada. */
function fetchFalso(rutas) {
  const llamadas = []
  const fn = async (url) => {
    llamadas.push(url)
    const r = rutas[url]
    if (r === undefined) throw new TypeError('fetch failed')
    return typeof r === 'function' ? r() : r
  }
  fn.llamadas = llamadas
  return fn
}

describe('requerirEnv', () => {
  it('devuelve el valor sin espacios', () => {
    // Arrange
    const env = { X: '  valor ' }

    // Act
    const valor = requerirEnv('X', env)

    // Assert
    assert.equal(valor, 'valor')
  })

  it('falla con el nombre de la variable si falta o está vacía', () => {
    // Arrange
    const env = { VACIA: '' }

    // Act / Assert
    assert.throws(() => requerirEnv('FALTA', env), /Falta la variable de entorno FALTA/)
    assert.throws(() => requerirEnv('VACIA', env), /Falta la variable de entorno VACIA/)
  })
})

describe('leerVariable', () => {
  it('lee el valor entre comillas, como lo escribe vercel pull', () => {
    // Arrange
    const contenido = '# Created by Vercel CLI\nOTRA="x"\r\nVITE_API_URL="https://api.staging.test/api"\nVITE_WS_URL="wss://y"\n'

    // Act
    const valor = leerVariable(contenido, 'VITE_API_URL')

    // Assert
    assert.equal(valor, 'https://api.staging.test/api')
  })

  it('lee valores sin comillas y no confunde variables con el mismo prefijo', () => {
    // Arrange
    const contenido = 'VITE_API_URL_VIEJA=https://vieja\nVITE_API_URL = https://nueva/api\n'

    // Act
    const valor = leerVariable(contenido, 'VITE_API_URL')

    // Assert
    assert.equal(valor, 'https://nueva/api')
  })

  it('devuelve null si la variable no está o está vacía', () => {
    // Arrange
    const contenido = 'OTRA=1\nVACIA=""\nsin-igual\n'

    // Act / Assert
    assert.equal(leerVariable(contenido, 'VITE_API_URL'), null)
    assert.equal(leerVariable(contenido, 'VACIA'), null)
  })
})

describe('urlBackend', () => {
  it('saca el /api final y las barras sobrantes', () => {
    // Act / Assert
    assert.equal(urlBackend('https://api.staging.test/api'), BACKEND)
    assert.equal(urlBackend('https://api.staging.test/api/'), BACKEND)
    assert.equal(urlBackend('https://api.staging.test'), BACKEND)
  })
})

describe('esperarSha', () => {
  function reloj() {
    let t = 0
    return { ahora: () => t, dormir: async (ms) => { t += ms } }
  }

  it('devuelve el /health cuando aparece el sha, después de reintentar errores, 502 y el sha viejo', async () => {
    // Arrange
    const secuencia = [
      () => Promise.reject(new TypeError('fetch failed')),
      () => respuesta(502),
      () => respuesta(200, { status: 'ok', sha: 'viejo' }),
      () => respuesta(200, { status: 'ok', sha: 'nuevo' }),
    ]
    let i = 0
    const fetchFn = async () => secuencia[i++]()
    const { ahora, dormir } = reloj()
    const logs = []

    // Act
    const body = await esperarSha({ backend: BACKEND, sha: 'nuevo', fetchFn, ahora, dormir, log: (l) => logs.push(l) })

    // Assert
    assert.deepEqual(body, { status: 'ok', sha: 'nuevo' })
    assert.equal(i, 4)
    assert.match(logs[0], /error de red \(TypeError\)/)
    assert.match(logs[1], /HTTP 502/)
    assert.match(logs[2], /sha viejo/)
    assert.match(logs[3], /ya muestra nuevo/)
  })

  it('consulta /health del backend, sin el /api', async () => {
    // Arrange
    const fetchFn = fetchFalso({ [`${BACKEND}/health`]: respuesta(200, { sha: 'abc' }) })

    // Act
    await esperarSha({ backend: BACKEND, sha: 'abc', fetchFn, log: () => {} })

    // Assert
    assert.deepEqual(fetchFn.llamadas, [`${BACKEND}/health`])
  })

  it('falla después del límite (10 s, 8 min: 49 intentos) con la última respuesta', async () => {
    // Arrange
    const fetchFn = fetchFalso({ [`${BACKEND}/health`]: respuesta(200, { sha: null }) })
    const { ahora, dormir } = reloj()

    // Act / Assert
    await assert.rejects(
      esperarSha({ backend: BACKEND, sha: 'nuevo', fetchFn, ahora, dormir, log: () => {} }),
      /\/health no mostró el sha nuevo en 8 min \(última respuesta: sha null\)/,
    )
    assert.equal(fetchFn.llamadas.length, 49)
  })
})

describe('correrSmoke', () => {
  const FRONTENDS = {
    'web-admin': 'https://admin.vercel.test',
    'web-cliente': 'https://cliente.vercel.test',
    'web-staff': 'https://staff.vercel.test',
  }
  const TODO_OK = {
    [`${BACKEND}/health`]: respuesta(200, { status: 'ok', db: 'ok', sha: 'abc' }),
    [`${API}/discovery`]: respuesta(200, { restaurantes: [], ofertas: [] }),
    'https://admin.vercel.test': respuesta(200),
    'https://cliente.vercel.test': respuesta(200),
    'https://staff.vercel.test': respuesta(200),
  }

  it('con todo arriba, los 5 chequeos dan ok y solo hace GET de lectura', async () => {
    // Arrange
    const fetchFn = fetchFalso(TODO_OK)

    // Act
    const resultados = await correrSmoke({ apiUrl: `${API}/`, frontends: FRONTENDS, fetchFn })

    // Assert
    assert.deepEqual(
      resultados.map((r) => [r.nombre, r.ok]),
      [
        ['backend /health', true],
        ['backend /api/discovery', true],
        ['web-admin', true],
        ['web-cliente', true],
        ['web-staff', true],
      ],
    )
    assert.equal(fetchFn.llamadas.length, 5)
  })

  it('con la base caída, /health falla aunque responda 200', async () => {
    // Arrange
    const fetchFn = fetchFalso({ ...TODO_OK, [`${BACKEND}/health`]: respuesta(200, { status: 'degraded', db: 'error' }) })

    // Act
    const [health] = await correrSmoke({ apiUrl: API, frontends: FRONTENDS, fetchFn })

    // Assert
    assert.equal(health.ok, false)
    assert.equal(health.detalle, 'status degraded, db error')
  })

  it('marca cada falla sin cortar en la primera: HTTP, JSON inesperado, red y URL faltante', async () => {
    // Arrange
    const fetchFn = fetchFalso({
      [`${BACKEND}/health`]: respuesta(503),
      [`${API}/discovery`]: respuesta(200, { error: 'x' }),
      'https://admin.vercel.test': respuesta(401),
    })
    const frontends = { ...FRONTENDS, 'web-staff': undefined }

    // Act
    const resultados = await correrSmoke({ apiUrl: API, frontends, fetchFn })

    // Assert
    assert.deepEqual(
      resultados.map((r) => [r.nombre, r.ok, r.detalle]),
      [
        ['backend /health', false, 'HTTP 503'],
        ['backend /api/discovery', false, 'respuesta sin restaurantes u ofertas'],
        ['web-admin', false, 'HTTP 401'],
        ['web-cliente', false, 'error de red (TypeError)'],
        ['web-staff', false, 'falta la URL'],
      ],
    )
  })

  it('discovery con un código distinto de 200 falla con el código', async () => {
    // Arrange
    const fetchFn = fetchFalso({ ...TODO_OK, [`${API}/discovery`]: respuesta(500, {}) })

    // Act
    const [, discovery] = await correrSmoke({ apiUrl: API, frontends: FRONTENDS, fetchFn })

    // Assert
    assert.equal(discovery.detalle, 'HTTP 500')
  })
})
