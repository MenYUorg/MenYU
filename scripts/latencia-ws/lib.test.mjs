// node --test scripts/latencia-ws/lib.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { percentil, resumir, resumenMarkdown } from './lib.mjs'

test('percentil por rango más cercano, sin interpolar y sin tocar la lista', () => {
  const v = [50, 10, 40, 20, 30]
  assert.equal(percentil(v, 50), 30)
  assert.equal(percentil(v, 95), 50)
  assert.equal(percentil(v, 100), 50)
  assert.equal(percentil(v, 1), 10)
  assert.deepEqual(v, [50, 10, 40, 20, 30])
  assert.equal(percentil([], 50), null)
  assert.throws(() => percentil(v, 0), RangeError)
  assert.throws(() => percentil(v, 101), RangeError)
})

test('con 100 muestras, el p95 es la 95.ª y el p50 la 50.ª', () => {
  const v = Array.from({ length: 100 }, (_, i) => i + 1)
  assert.equal(percentil(v, 50), 50)
  assert.equal(percentil(v, 95), 95)
})

test('resumir: latencias desde la respuesta y desde el envío, perdidos y eventos que llegan antes que la respuesta', () => {
  const muestras = [
    { msEnvio: 0, msRespuesta: 100, msEvento: 130 }, //  30 desde la respuesta, 130 desde el envío
    { msEnvio: 1000, msRespuesta: 1100, msEvento: 1095 }, // el evento llegó 5 ms antes que la respuesta
    { msEnvio: 2000, msRespuesta: 2100, msEvento: 2700 }, // 600: arriba de la meta
    { msEnvio: 3000, msRespuesta: 3100, msEvento: null }, // perdido
  ]
  const r = resumir(muestras)
  assert.equal(r.pedidos, 4)
  assert.equal(r.eventosRecibidos, 3)
  assert.equal(r.eventosPerdidos, 1)
  assert.equal(r.eventoAntesQueLaRespuesta, 1)
  assert.equal(r.sobreLaMeta, 1)
  assert.deepEqual(r.desdeLaRespuestaMs, { n: 3, min: -5, p50: 30, p95: 600, max: 600 })
  assert.deepEqual(r.desdeElEnvioMs, { n: 3, min: 95, p50: 130, p95: 700, max: 700 })
  assert.deepEqual(r.respuestaHttpMs, { n: 4, min: 100, p50: 100, p95: 100, max: 100 })
})

test('resumir: un evento que llega después de la espera cuenta como perdido', () => {
  const r = resumir([{ msEnvio: 0, msRespuesta: 10, msEvento: 10_011 }], { esperaMs: 10_000 })
  assert.equal(r.eventosPerdidos, 1)
  assert.equal(r.desdeLaRespuestaMs.p50, null)
})

test('resumir redondea a décimas de milisegundo', () => {
  const r = resumir([{ msEnvio: 0, msRespuesta: 10.04, msEvento: 22.37 }])
  assert.equal(r.desdeLaRespuestaMs.p50, 12.3)
})

test('resumenMarkdown muestra los perdidos y las tres medidas', () => {
  const md = resumenMarkdown(resumir([{ msEnvio: 0, msRespuesta: 100, msEvento: 130 }]), {
    sha: 'abc', marcador: 'e2e-local-0123abcd-', inicio: '2026-11-12T00:00:00Z',
  })
  assert.match(md, /\*\*perdidos: 0\*\*/)
  assert.match(md, /\| Respuesta del POST → order:new \| 1 \| 30 \| 30 \| 30 \| 30 \|/)
  assert.match(md, /`abc`/)
})
