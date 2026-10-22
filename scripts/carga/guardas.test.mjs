// Tests de las guardas de k6: node --test scripts/carga/guardas.test.mjs
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { HOSTS_DE_PRODUCCION, erroresDeConfiguracion, hostDe, hostsDeProduccion, urlBackend } from './guardas.mjs'

const STAGING = 'https://api.staging.test/api'
const valido = (extra = {}) => ({ CONFIRMAR_STAGING: 'si', BASE_URL: STAGING, ...extra })

// node:test no tiene it.each: los casos que comparten forma van en un for, un `it` por caso.
describe('hostDe', () => {
  for (const [url, host] of [
    ['https://api.staging.test/api', 'api.staging.test'],
    ['HTTPS://API.Staging.Test:8443/api', 'api.staging.test'],
    ['http://localhost:3000/api', 'localhost'],
    ['https://api.staging.test', 'api.staging.test'],
    ['ftp://api.staging.test/api', null],
    ['api.staging.test/api', null],
    ['', null],
    [undefined, null],
  ]) {
    it(`"${url}" → ${host}`, () => {
      // Act
      const resultado = hostDe(url)

      // Assert
      assert.equal(resultado, host)
    })
  }
})

describe('hostsDeProduccion', () => {
  it('suma los hosts de las variables PROD_* a los de producción conocidos, sin repetir', () => {
    // Arrange
    const prodHosts = 'https://admin.menyu-app.com,https://otro-prod.test/,,  '

    // Act
    const hosts = hostsDeProduccion(prodHosts)

    // Assert
    assert.ok(HOSTS_DE_PRODUCCION.every((h) => hosts.includes(h)))
    assert.ok(hosts.includes('otro-prod.test'))
    assert.equal(hosts.filter((h) => h === 'admin.menyu-app.com').length, 1)
  })

  it('sin variables quedan solo los de producción conocidos', () => {
    // Act
    const hosts = hostsDeProduccion(undefined)

    // Assert
    assert.deepEqual(hosts, HOSTS_DE_PRODUCCION)
  })
})

describe('erroresDeConfiguracion', () => {
  it('con CONFIRMAR_STAGING=si y una URL de staging terminada en /api se puede correr', () => {
    // Act
    const errores = erroresDeConfiguracion(valido())

    // Assert
    assert.deepEqual(errores, [])
  })

  for (const confirmar of [undefined, '', 'no', 'SI', 'sí', 'true']) {
    it(`sin CONFIRMAR_STAGING=si (${JSON.stringify(confirmar)}) no corre`, () => {
      // Act
      const errores = erroresDeConfiguracion(valido({ CONFIRMAR_STAGING: confirmar }))

      // Assert
      assert.equal(errores.length, 1)
      assert.match(errores[0], /CONFIRMAR_STAGING=si/)
    })
  }

  for (const host of HOSTS_DE_PRODUCCION) {
    it(`con el host de producción ${host} no corre, aunque esté confirmado`, () => {
      // Act
      const errores = erroresDeConfiguracion(valido({ BASE_URL: `https://${host}/api` }))

      // Assert
      assert.ok(errores.some((e) => /producción/.test(e)))
    })
  }

  it('el dominio de Railway de la API de producción no corre (docs/auth/VariablesACambiar.md:10)', () => {
    // Act
    const errores = erroresDeConfiguracion(valido({ BASE_URL: 'https://menyu-backend-production.up.railway.app/api' }))

    // Assert
    assert.ok(errores.some((e) => /producción/.test(e)))
  })

  it('un host que viene en PROD_HOSTS tampoco se acepta', () => {
    // Arrange
    const env = valido({ PROD_HOSTS: 'https://api.staging.test' })

    // Act
    const errores = erroresDeConfiguracion(env)

    // Assert
    assert.ok(errores.some((e) => /producción/.test(e)))
  })

  it('el host de producción se reconoce con mayúsculas y con puerto', () => {
    // Act
    const errores = erroresDeConfiguracion(valido({ BASE_URL: 'https://API.MENYU-APP.COM:443/api' }))

    // Assert
    assert.ok(errores.some((e) => /producción/.test(e)))
  })

  for (const [caso, baseUrl, regla] of [
    ['sin BASE_URL', undefined, /Falta BASE_URL/],
    ['una BASE_URL que no es URL', 'staging', /no es una URL/],
    ['una BASE_URL sin /api', 'https://api.staging.test', /terminar en \/api/],
    ['http:// fuera de local', 'http://api.staging.test/api', /http:\/\/ solo se acepta en local/],
  ]) {
    it(`${caso} no corre`, () => {
      // Act
      const errores = erroresDeConfiguracion(valido({ BASE_URL: baseUrl }))

      // Assert
      assert.ok(errores.some((e) => regla.test(e)), errores.join(' | '))
    })
  }

  it('http:// en local se acepta', () => {
    // Act
    const errores = erroresDeConfiguracion(valido({ BASE_URL: 'http://localhost:3000/api' }))

    // Assert
    assert.deepEqual(errores, [])
  })

  it('ningún mensaje incluye la URL ni el host', () => {
    // Arrange
    const env = { CONFIRMAR_STAGING: 'no', BASE_URL: 'http://api.secreto-staging.test', PROD_HOSTS: 'https://api.secreto-staging.test' }

    // Act
    const errores = erroresDeConfiguracion(env)

    // Assert
    assert.ok(errores.length >= 3)
    assert.ok(errores.every((e) => !e.includes('secreto-staging')))
  })
})

describe('urlBackend', () => {
  it('saca el /api final (con o sin barra) para llegar a /health', () => {
    // Act y Assert
    assert.equal(urlBackend('https://api.staging.test/api'), 'https://api.staging.test')
    assert.equal(urlBackend('https://api.staging.test/api/'), 'https://api.staging.test')
  })
})
