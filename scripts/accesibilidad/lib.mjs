// La parte pura de la revisión automática de accesibilidad (RNF-20, WCAG 2.2 AA): qué criterio de WCAG toca cada regla
// de axe y los totales por criterio, por gravedad y por pantalla. main.mjs la usa con el navegador; lib.test.mjs la
// prueba sin navegador.

/** Las etiquetas de axe que se corren: WCAG 2.0, 2.1 y 2.2, niveles A y AA (RNF-20). */
export const ETIQUETAS_WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']

/** Las gravedades de axe, de la más grave a la más leve. */
export const GRAVEDADES = ['critical', 'serious', 'moderate', 'minor']

/** Los criterios de WCAG de una regla, a partir de sus etiquetas (`wcag143` → `1.4.3`), ordenados. */
export function criteriosDe(etiquetas) {
  const criterios = new Set()
  for (const e of etiquetas ?? []) {
    const m = /^wcag(\d)(\d)(\d{1,2})$/.exec(e)
    if (m) criterios.add(`${m[1]}.${m[2]}.${m[3]}`)
  }
  return [...criterios].sort(compararCriterios)
}

export function compararCriterios(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i]
  return 0
}

/** El nivel más bajo que pide la regla (A o AA), según sus etiquetas. */
export function nivelDe(etiquetas) {
  const t = etiquetas ?? []
  if (t.some((e) => /^wcag2\d?a$/.test(e))) return 'A'
  if (t.some((e) => /^wcag2\d?aa$/.test(e))) return 'AA'
  return null
}

/**
 * Las observaciones de una corrida, una por regla violada en cada pantalla (con la cantidad de elementos afectados).
 * `pantallas` es la lista de { app, pantalla, url, urlFinal, violaciones: resultado.violations de axe }.
 */
export function observaciones(pantallas) {
  const out = []
  for (const p of pantallas) {
    for (const v of p.violaciones ?? []) {
      out.push({
        app: p.app,
        pantalla: p.pantalla,
        regla: v.id,
        gravedad: v.impact ?? 'sin dato',
        criterios: criteriosDe(v.tags),
        nivel: nivelDe(v.tags),
        elementos: v.nodes?.length ?? 0,
        ayuda: v.help,
        destinos: (v.nodes ?? []).slice(0, 5).map((n) => (Array.isArray(n.target) ? n.target.join(' ') : String(n.target))),
      })
    }
  }
  return out
}

function sumar(mapa, clave, obs) {
  const actual = mapa.get(clave) ?? { observaciones: 0, elementos: 0, reglas: new Set(), pantallas: new Set() }
  actual.observaciones += 1
  actual.elementos += obs.elementos
  actual.reglas.add(obs.regla)
  actual.pantallas.add(`${obs.app} ${obs.pantalla}`)
  mapa.set(clave, actual)
}

const plano = (mapa) =>
  [...mapa].map(([clave, v]) => ({ clave, observaciones: v.observaciones, elementos: v.elementos, reglas: [...v.reglas].sort(), pantallas: v.pantallas.size }))

/** Totales por criterio de WCAG (una observación que toca dos criterios cuenta en los dos), por gravedad y por app. */
export function totales(obs) {
  const porCriterio = new Map()
  const porGravedad = new Map()
  const porApp = new Map()
  for (const o of obs) {
    for (const c of o.criterios.length ? o.criterios : ['sin criterio']) sumar(porCriterio, c, o)
    sumar(porGravedad, o.gravedad, o)
    sumar(porApp, o.app, o)
  }
  const ordenGravedad = (a, b) => GRAVEDADES.indexOf(a.clave) - GRAVEDADES.indexOf(b.clave)
  return {
    observaciones: obs.length,
    elementos: obs.reduce((s, o) => s + o.elementos, 0),
    porCriterio: plano(porCriterio).sort((a, b) =>
      a.clave === 'sin criterio' ? 1 : b.clave === 'sin criterio' ? -1 : compararCriterios(a.clave, b.clave)),
    porGravedad: plano(porGravedad).sort(ordenGravedad),
    porApp: plano(porApp).sort((a, b) => a.clave.localeCompare(b.clave)),
  }
}

/** El resumen en Markdown, para pegar en la bitácora y el informe. */
export function resumenMarkdown({ inicio, axe, sha, pantallas, totales: t }) {
  const filas = (lista) => lista.map((x) => `| ${x.clave} | ${x.observaciones} | ${x.elementos} | ${x.reglas.join(', ')} |`)
  const revisadas = pantallas.filter((p) => !p.error)
  return [
    '### Revisión automática de accesibilidad (axe, WCAG 2.0 a 2.2, A y AA)',
    '',
    `Inicio ${inicio} · axe-core ${axe} · SHA en staging \`${sha ?? 'desconocido'}\` · ${revisadas.length} pantallas revisadas` +
      (pantallas.length > revisadas.length ? `, ${pantallas.length - revisadas.length} sin revisar` : ''),
    '',
    `Observaciones (regla violada en una pantalla): **${t.observaciones}**, sobre ${t.elementos} elementos.`,
    '',
    '| Criterio WCAG | Observaciones | Elementos | Reglas de axe |',
    '|---|---|---|---|',
    ...filas(t.porCriterio),
    '',
    '| Gravedad | Observaciones | Elementos | Reglas de axe |',
    '|---|---|---|---|',
    ...filas(t.porGravedad),
    '',
    '| App | Observaciones | Elementos | Reglas de axe |',
    '|---|---|---|---|',
    ...filas(t.porApp),
    '',
    '| App | Pantalla | Ruta final | Violaciones | Incompletas |',
    '|---|---|---|---|---|',
    ...pantallas.map((p) =>
      `| ${p.app} | ${p.pantalla} | ${p.error ? `sin revisar: ${p.error}` : p.rutaFinal} | ${p.error ? '-' : p.violaciones.length} | ${p.error ? '-' : p.incompletas} |`),
    '',
  ].join('\n')
}
