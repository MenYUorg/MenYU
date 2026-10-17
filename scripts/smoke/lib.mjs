// Smoke post-deploy de staging y producción. Solo lectura: todas las requests son GET. No imprime secretos.

export const INTERVALO_MS = 10_000
export const LIMITE_MS = 8 * 60_000
const TIMEOUT_MS = 10_000

/** Valor de una variable de entorno; si falta o está vacía, falla con un mensaje claro. */
export function requerirEnv(nombre, env = process.env) {
  const valor = env[nombre]?.trim()
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre}`)
  return valor
}

/** Valor de `nombre` en el contenido de un .env (como el que genera `vercel pull`), o null. */
export function leerVariable(contenido, nombre) {
  for (const linea of contenido.split(/\r?\n/)) {
    const igual = linea.indexOf('=')
    if (igual === -1 || linea.slice(0, igual).trim() !== nombre) continue
    const valor = linea.slice(igual + 1).trim()
    const sinComillas = /^(["']).*\1$/.test(valor) ? valor.slice(1, -1) : valor
    return sinComillas || null
  }
  return null
}

/** URL base del backend, donde vive /health: VITE_API_URL sin el /api final. */
export function urlBackend(apiUrl) {
  return apiUrl.replace(/\/+$/, '').replace(/\/api$/, '')
}

async function getJson(fetchFn, url) {
  const res = await fetchFn(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  const body = await res.json().catch(() => null)
  return { status: res.status, body }
}

/**
 * Consulta /health cada `intervaloMs` hasta que muestre `sha`. Falla si no aparece en `limiteMs`.
 * Los errores de red y las respuestas que no son 200 cuentan como "todavía no" (el deploy puede estar arrancando).
 */
export async function esperarSha({
  backend,
  sha,
  fetchFn = fetch,
  dormir = (ms) => new Promise((r) => setTimeout(r, ms)),
  ahora = Date.now,
  intervaloMs = INTERVALO_MS,
  limiteMs = LIMITE_MS,
  log = console.log,
}) {
  const inicio = ahora()
  for (let intento = 1; ; intento++) {
    let ultimo
    try {
      const { status, body } = await getJson(fetchFn, `${backend}/health`)
      if (status === 200 && body?.sha === sha) {
        log(`Intento ${intento}: /health ya muestra ${sha}`)
        return body
      }
      ultimo = status === 200 ? `sha ${body?.sha ?? 'null'}` : `HTTP ${status}`
    } catch (err) {
      ultimo = `error de red (${err.name})`
    }
    log(`Intento ${intento}: ${ultimo}, espero ${sha}`)
    if (ahora() - inicio + intervaloMs > limiteMs) {
      throw new Error(`/health no mostró el sha ${sha} en ${limiteMs / 60_000} min (última respuesta: ${ultimo})`)
    }
    await dormir(intervaloMs)
  }
}

async function chequear(nombre, fn) {
  try {
    const detalle = await fn()
    return { nombre, ok: detalle === null, detalle: detalle ?? 'ok' }
  } catch (err) {
    return { nombre, ok: false, detalle: `error de red (${err.name})` }
  }
}

/**
 * Chequeos del smoke: /health con la base ok, un endpoint público que lee de la base (/discovery)
 * y que cada frontend responda 200. Devuelve un resultado por chequeo; no corta en el primero que falla.
 */
export async function correrSmoke({ apiUrl, frontends, fetchFn = fetch }) {
  const api = apiUrl.replace(/\/+$/, '')
  const backend = urlBackend(api)

  const resultados = [
    await chequear('backend /health', async () => {
      const { status, body } = await getJson(fetchFn, `${backend}/health`)
      if (status !== 200) return `HTTP ${status}`
      if (body?.status !== 'ok' || body?.db !== 'ok') return `status ${body?.status}, db ${body?.db}`
      return null
    }),
    await chequear('backend /api/discovery', async () => {
      const { status, body } = await getJson(fetchFn, `${api}/discovery`)
      if (status !== 200) return `HTTP ${status}`
      if (!Array.isArray(body?.restaurantes) || !Array.isArray(body?.ofertas)) return 'respuesta sin restaurantes u ofertas'
      return null
    }),
  ]

  for (const [nombre, url] of Object.entries(frontends)) {
    if (!url) {
      resultados.push({ nombre, ok: false, detalle: 'falta la URL' })
      continue
    }
    resultados.push(
      await chequear(nombre, async () => {
        const res = await fetchFn(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
        return res.status === 200 ? null : `HTTP ${res.status}`
      }),
    )
  }
  return resultados
}
