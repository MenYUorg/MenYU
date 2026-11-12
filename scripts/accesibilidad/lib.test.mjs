// node --test scripts/accesibilidad/lib.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { criteriosDe, nivelDe, observaciones, resumenMarkdown, totales } from './lib.mjs'

test('criteriosDe saca los criterios de las etiquetas de axe, sin repetir y en orden numérico', () => {
  assert.deepEqual(criteriosDe(['cat.color', 'wcag2aa', 'wcag143', 'TTv5', 'wcag1410', 'wcag143', 'wcag412']), ['1.4.3', '1.4.10', '4.1.2'])
  assert.deepEqual(criteriosDe(['best-practice']), [])
  assert.deepEqual(criteriosDe(undefined), [])
})

test('nivelDe: A si alguna etiqueta es de nivel A, AA si solo hay de AA', () => {
  assert.equal(nivelDe(['wcag2a', 'wcag412']), 'A')
  assert.equal(nivelDe(['wcag21a']), 'A')
  assert.equal(nivelDe(['wcag2aa', 'wcag143']), 'AA')
  assert.equal(nivelDe(['wcag22aa', 'wcag258']), 'AA')
  assert.equal(nivelDe(['best-practice']), null)
})

const pantallas = [
  {
    app: 'web-auth', pantalla: 'login', url: 'u', rutaFinal: '/',
    incompletas: 1,
    violaciones: [
      { id: 'color-contrast', impact: 'serious', tags: ['wcag2aa', 'wcag143'], help: 'Contraste', nodes: [{ target: ['#a'] }, { target: ['#b'] }] },
      { id: 'button-name', impact: 'critical', tags: ['wcag2a', 'wcag412', 'section508'], help: 'Nombre', nodes: [{ target: ['iframe', '#c'] }] },
    ],
  },
  {
    app: 'web-cliente', pantalla: 'discovery', url: 'u', rutaFinal: '/',
    incompletas: 0,
    violaciones: [{ id: 'color-contrast', impact: 'serious', tags: ['wcag2aa', 'wcag143'], help: 'Contraste', nodes: [{ target: ['#d'] }] }],
  },
  { app: 'web-admin', pantalla: 'menú', url: 'u', error: 'redirigió a web-auth' },
]

test('observaciones: una por regla y pantalla, con los elementos afectados y los destinos', () => {
  const obs = observaciones(pantallas)
  assert.equal(obs.length, 3)
  assert.deepEqual(obs[0], {
    app: 'web-auth', pantalla: 'login', regla: 'color-contrast', gravedad: 'serious', criterios: ['1.4.3'], nivel: 'AA',
    elementos: 2, ayuda: 'Contraste', destinos: ['#a', '#b'],
  })
  assert.deepEqual(obs[1].destinos, ['iframe #c'])
})

test('totales por criterio, por gravedad (de la más grave a la más leve) y por app', () => {
  const t = totales(observaciones(pantallas))
  assert.equal(t.observaciones, 3)
  assert.equal(t.elementos, 4)
  assert.deepEqual(t.porCriterio.map((x) => [x.clave, x.observaciones, x.elementos, x.pantallas]), [['1.4.3', 2, 3, 2], ['4.1.2', 1, 1, 1]])
  assert.deepEqual(t.porGravedad.map((x) => [x.clave, x.observaciones]), [['critical', 1], ['serious', 2]])
  assert.deepEqual(t.porApp.map((x) => [x.clave, x.observaciones]), [['web-auth', 2], ['web-cliente', 1]])
})

test('una regla sin criterio de WCAG cuenta como "sin criterio", al final', () => {
  const t = totales(observaciones([{ app: 'a', pantalla: 'p', violaciones: [
    { id: 'region', impact: 'moderate', tags: ['best-practice'], nodes: [{ target: ['x'] }] },
    { id: 'image-alt', impact: 'critical', tags: ['wcag2a', 'wcag111'], nodes: [{ target: ['y'] }] },
  ] }]))
  assert.deepEqual(t.porCriterio.map((x) => x.clave), ['1.1.1', 'sin criterio'])
})

test('resumenMarkdown cuenta las pantallas revisadas y muestra las que no se pudieron revisar', () => {
  const md = resumenMarkdown({ inicio: 'i', axe: '4.14.0', sha: 'abc', pantallas, totales: totales(observaciones(pantallas)) })
  assert.match(md, /2 pantallas revisadas, 1 sin revisar/)
  assert.match(md, /\| 1\.4\.3 \| 2 \| 3 \| color-contrast \|/)
  assert.match(md, /\| web-admin \| menú \| sin revisar: redirigió a web-auth \| - \| - \|/)
})
