// El flujo del E2E contra staging (docs/calidad/e2e-supabase.md, sección 1): QR → pedido → efectivo → el mozo confirma →
// cierre, verificando cada paso en la base con el usuario e2e_staging, y la limpieza siempre al final.
// Recibe la red, la base y el reloj como dependencias: flujo.test.mjs lo corre entero con dobles.
import {
  ESPERA_ESCRITURA_MS,
  FallaE2E,
  categoriaDeError,
  categoriaDeHttp,
  categoriaFinal,
  conReintentos,
  diferenciasDeLimpieza,
} from './lib.mjs'

const TIMEOUT_MS = 15_000

/**
 * @param {object} c
 * @param {string} c.apiUrl        la API de staging, terminada en /api
 * @param {string} c.supabaseUrl   el Supabase de staging (para el login del mozo)
 * @param {string} c.publishableKey
 * @param {string} c.mozoEmail
 * @param {string} c.mozoPassword
 * @param {string} c.restauranteId el restaurante de prueba (marca e2e-staging-*)
 * @param {string} c.itemId        el plato de prueba, de ese restaurante
 * @param {string} c.marcador      el de la corrida (lib.marcadorDeCorrida)
 * @param {string|null} c.sha      el SHA que se espera en staging, solo para el reporte (el probado sale de /health)
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }} c.db  conectada como e2e_staging
 */
export async function correrFlujo(c) {
  const { db, fetchFn = fetch, dormir = (ms) => new Promise((r) => setTimeout(r, ms)), ahora = Date.now, log = console.log } = c
  const inicio = ahora()
  const pasos = []
  const estado = {} // ids que devuelve la API y la base: mesaId, qr, sesionId, jwt, clienteId, pedidoId, pagoId, total…

  // ── Ayudas ────────────────────────────────────────────────────────────────
  async function api(metodo, ruta, { token, body, url } = {}) {
    const t0 = ahora()
    const res = await fetchFn(url ?? `${c.apiUrl}${ruta}`, {
      method: metodo,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const json = await res.json().catch(() => null)
    return { status: res.status, body: json, ms: ahora() - t0 }
  }

  function exigirHttp(res, esperados, que) {
    if (!esperados.includes(res.status)) {
      const motivo = typeof res.body?.message === 'string' ? `: ${res.body.message}` : ''
      throw new FallaE2E(categoriaDeHttp(res.status), `${que} respondió ${res.status}${motivo}`, { http: res.status })
    }
  }

  function exigir(condicion, mensaje) {
    if (!condicion) throw new FallaE2E('producto', mensaje)
  }

  /** Lectura de la base con reintentos por infraestructura (e2e-supabase.md:110). */
  async function leer(registro, sql, params) {
    const { valor, reintentos } = await conReintentos(async () => (await db.query(sql, params)).rows, { dormir })
    registro.reintentos += reintentos
    return valor
  }

  /**
   * Una escritura de la API. Si falla por infraestructura no se repite a ciegas (e2e-supabase.md:111): se espera, se mira
   * en la base si el efecto ya está y, si no está, se reintenta una sola vez.
   */
  async function escribir(registro, hacer, yaEsta) {
    try {
      return await hacer()
    } catch (err) {
      if (categoriaDeError(err) !== 'infraestructura') throw err
      await dormir(ESPERA_ESCRITURA_MS)
      const efecto = await yaEsta()
      registro.reintentos += 1
      if (efecto) return efecto
      return await hacer()
    }
  }

  async function paso(nombre, fn) {
    const registro = { paso: nombre, categoria: 'ok', http: null, msApi: null, base: null, reintentos: 0, detalle: null }
    pasos.push(registro)
    try {
      await fn(registro)
      log(`ok    ${nombre}`)
    } catch (err) {
      registro.categoria = categoriaDeError(err)
      registro.http = err.http ?? registro.http
      registro.detalle = err instanceof FallaE2E ? err.message : `${err.name ?? 'Error'} (red, timeout o conexión a la base)`
      if (registro.base === null && registro.categoria === 'producto') registro.base = false
      log(`FALLA ${nombre} [${registro.categoria}]: ${registro.detalle}`)
      throw err
    }
  }

  // ── Pasos ─────────────────────────────────────────────────────────────────
  let limpieza = null
  try {
    await paso('0. preparación', async (r) => {
      const health = await conReintentos(async () => {
        // /health vive en el backend, sin el /api (como el smoke: scripts/smoke/lib.mjs, urlBackend).
        const res = await api('GET', null, { url: `${c.apiUrl.replace(/\/+$/, '').replace(/\/api$/, '')}/health` })
        if (res.status !== 200) throw new FallaE2E(categoriaDeHttp(res.status), `/health respondió ${res.status}`, { http: res.status })
        if (res.body?.status === 'degraded') throw new FallaE2E('infraestructura', '/health respondió status degraded')
        return res
      }, { dormir })
      r.reintentos += health.reintentos
      estado.shaEnStaging = typeof health.valor.body?.sha === 'string' ? health.valor.body.sha : null

      const filas = await leer(r, 'SELECT id_mesa, qr FROM e2e.e2e_preparar($1, $2)', [c.marcador, c.restauranteId])
      exigir(filas.length === 1, 'e2e_preparar no devolvió la mesa')
      estado.mesaId = filas[0].id_mesa
      estado.qr = filas[0].qr
      const [mesa] = await leer(r, 'SELECT estado, restaurante_id, qr_token FROM mesa WHERE id = $1', [estado.mesaId])
      exigir(mesa?.estado === 'libre' && mesa.restaurante_id === c.restauranteId && mesa.qr_token === estado.qr,
        'La mesa de la corrida no está libre en el restaurante de prueba')
      r.base = true
    })

    await paso('1. QR: abrir la sesión', async (r) => {
      const res = await escribir(r, async () => {
        const out = await api('POST', '/sessions/open', { body: { tableCode: estado.qr, restauranteId: c.restauranteId } })
        exigirHttp(out, [200], 'POST /sessions/open')
        return out
      }, async () => {
        const abiertas = await leer(r, 'SELECT id FROM sesion_mesa WHERE mesa_id = $1', [estado.mesaId])
        // La sesión puede haberse abierto, pero sin la respuesta no hay token de sesión: no se puede seguir.
        if (abiertas.length > 0) throw new FallaE2E('infraestructura', 'La sesión se abrió pero la respuesta no llegó (sin token)')
        return null
      })
      r.http = res.status
      r.msApi = res.ms
      const b = res.body ?? {}
      exigir(b.esAnfitrion === true && typeof b.sesionId === 'string' && typeof b.jwt === 'string' && b.mesaId === estado.mesaId,
        'POST /sessions/open no devolvió esAnfitrion, sesionId, el token de sesión y la mesa de la corrida')
      Object.assign(estado, { sesionId: b.sesionId, jwt: b.jwt, clienteId: b.clienteId })

      const [sesion] = await leer(r, 'SELECT estado, mesa_id FROM sesion_mesa WHERE id = $1', [estado.sesionId])
      exigir(sesion?.estado === 'activa' && sesion.mesa_id === estado.mesaId, 'La sesión no quedó activa en la mesa de la corrida')
      const [mesa] = await leer(r, 'SELECT estado FROM mesa WHERE id = $1', [estado.mesaId])
      exigir(mesa?.estado === 'ocupada', 'La mesa no quedó ocupada')
      const participantes = await leer(r, 'SELECT cliente_id FROM sesion_mesa_cliente WHERE sesion_id = $1', [estado.sesionId])
      exigir(participantes.length === 1 && participantes[0].cliente_id === estado.clienteId, 'La sesión no tiene un único participante')
      r.base = true
    })

    await paso('2. pedido', async (r) => {
      const res = await escribir(r, async () => {
        const out = await api('POST', '/pedidos', {
          token: estado.jwt,
          body: { sesionId: estado.sesionId, mesaId: estado.mesaId, items: [{ itemId: c.itemId, cantidad: 1 }] },
        })
        exigirHttp(out, [200, 201], 'POST /pedidos')
        return out
      }, async () => {
        const [p] = await leer(r, 'SELECT id FROM pedido WHERE sesion_id = $1', [estado.sesionId])
        return p ? { status: null, body: { id: p.id }, ms: null } : null
      })
      r.http = res.status
      r.msApi = res.ms
      estado.pedidoId = res.body?.id
      exigir(typeof estado.pedidoId === 'string', 'POST /pedidos no devolvió el id del pedido')

      const [pedido] = await leer(r, 'SELECT sesion_id, mesa_id FROM pedido WHERE id = $1', [estado.pedidoId])
      exigir(pedido?.sesion_id === estado.sesionId && pedido.mesa_id === estado.mesaId, 'El pedido no quedó en la sesión de la corrida')
      const items = await leer(r, 'SELECT item_id, cantidad, precio_unitario FROM pedido_item WHERE pedido_id = $1', [estado.pedidoId])
      exigir(items.length === 1 && items[0].item_id === c.itemId && Number(items[0].cantidad) === 1 && Number(items[0].precio_unitario) > 0,
        'El pedido no tiene el ítem de prueba con su precio')
      estado.total = Number(items[0].precio_unitario) * Number(items[0].cantidad)
      r.base = true
    })

    await paso('3. pedido de efectivo', async (r) => {
      const res = await escribir(r, async () => {
        const out = await api('POST', '/payments/solicitar-efectivo', { token: estado.jwt, body: { sesionId: estado.sesionId } })
        exigirHttp(out, [200, 201], 'POST /payments/solicitar-efectivo')
        return out
      }, async () => {
        const [p] = await leer(r, "SELECT id FROM pago WHERE sesion_id = $1 AND metodo = 'efectivo' AND estado = 'pendiente'", [estado.sesionId])
        return p ? { status: null, body: { estado: 'efectivo_solicitado', pagoId: p.id }, ms: null } : null
      })
      r.http = res.status
      r.msApi = res.ms
      exigir(res.body?.estado === 'efectivo_solicitado' && typeof res.body.pagoId === 'string',
        'solicitar-efectivo no devolvió efectivo_solicitado con el pagoId')
      estado.pagoId = res.body.pagoId

      const [pago] = await leer(r, 'SELECT sesion_id, metodo, estado, monto FROM pago WHERE id = $1', [estado.pagoId])
      exigir(pago?.sesion_id === estado.sesionId && pago.metodo === 'efectivo' && pago.estado === 'pendiente',
        'El pago no quedó en efectivo y pendiente en la sesión de la corrida')
      exigir(Number(pago.monto) === estado.total, `El pago es de ${pago.monto} y el pedido suma ${estado.total}`)
      r.base = true
    })

    await paso('4. el mozo confirma el efectivo', async (r) => {
      const login = await fetchFn(`${c.supabaseUrl.replace(/\/$/, '')}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: c.publishableKey },
        body: JSON.stringify({ email: c.mozoEmail, password: c.mozoPassword }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      const sesionMozo = await login.json().catch(() => null)
      if (!login.ok || typeof sesionMozo?.access_token !== 'string') {
        const categoria = [502, 503, 504].includes(login.status) ? 'infraestructura' : 'configuracion'
        throw new FallaE2E(categoria, `El login del mozo en Supabase respondió ${login.status}`)
      }

      const res = await escribir(r, async () => {
        const out = await api('POST', '/payments/confirmar-efectivo', { token: sesionMozo.access_token, body: { pagoId: estado.pagoId } })
        exigirHttp(out, [200, 201], 'POST /payments/confirmar-efectivo')
        return out
      }, async () => {
        const [p] = await leer(r, "SELECT id FROM pago WHERE id = $1 AND estado = 'aprobado'", [estado.pagoId])
        return p ? { status: null, body: { estado: 'cerrada' }, ms: null } : null
      })
      r.http = res.status
      r.msApi = res.ms
      exigir(res.body?.estado === 'cerrada', `confirmar-efectivo devolvió estado ${res.body?.estado ?? 'vacío'}, no cerrada`)

      const [pago] = await leer(r, 'SELECT estado, fecha_cobro FROM pago WHERE id = $1', [estado.pagoId])
      exigir(pago?.estado === 'aprobado' && pago.fecha_cobro != null, 'El pago no quedó aprobado con fecha de cobro')
      r.base = true
    })

    await paso('5. cierre', async (r) => {
      const [sesion] = await leer(r, 'SELECT estado, cerrada_en FROM sesion_mesa WHERE id = $1', [estado.sesionId])
      exigir(sesion?.estado === 'cerrada' && sesion.cerrada_en != null, 'La sesión no quedó cerrada con cerrada_en')
      const [mesa] = await leer(r, 'SELECT estado FROM mesa WHERE id = $1', [estado.mesaId])
      exigir(mesa?.estado === 'libre', 'La mesa no volvió a libre')
      r.base = true
    })
  } catch {
    // El paso que falló ya quedó en `pasos`; los siguientes no corren y la limpieza corre igual (e2e-supabase.md:35).
  } finally {
    if (estado.mesaId) limpieza = await limpiar()
  }

  async function limpiar() {
    let resultado = null
    await paso('6. limpieza', async (r) => {
      // Lo que creó la corrida, contado antes de borrar (solo las tablas que e2e_staging puede leer). Si el conteo falla,
      // la limpieza se hace igual y el paso queda en falla después.
      const contar = async (sql, params) => Number((await leer(r, sql, params))[0]?.n ?? 0)
      const porMesa = [estado.mesaId]
      let creadas = null
      let errorDeConteo = null
      try {
        creadas = { mesa: await contar('SELECT count(*) AS n FROM mesa WHERE id = $1', porMesa) }
        creadas.sesion_mesa = await contar('SELECT count(*) AS n FROM sesion_mesa WHERE mesa_id = $1', porMesa)
        creadas.sesion_mesa_cliente = await contar(
          'SELECT count(*) AS n FROM sesion_mesa_cliente WHERE sesion_id IN (SELECT id FROM sesion_mesa WHERE mesa_id = $1)', porMesa)
        creadas.pedido = await contar('SELECT count(*) AS n FROM pedido WHERE mesa_id = $1', porMesa)
        creadas.pedido_item = await contar(
          'SELECT count(*) AS n FROM pedido_item WHERE pedido_id IN (SELECT id FROM pedido WHERE mesa_id = $1)', porMesa)
        creadas.pago = await contar(
          'SELECT count(*) AS n FROM pago WHERE sesion_id IN (SELECT id FROM sesion_mesa WHERE mesa_id = $1)', porMesa)
      } catch (err) {
        errorDeConteo = err
      }

      const [fila] = await leer(r, 'SELECT e2e.e2e_limpiar($1) AS resultado', [c.marcador])
      const borradas = fila?.resultado?.borradas ?? {}
      exigir(fila?.resultado?.mesa_encontrada === true, 'e2e_limpiar no encontró la mesa de la corrida')

      // Que no quede nada de la corrida, buscando por los ids que devolvió la API.
      const quedan = []
      const queda = async (tabla, sql, id) => { if (id && (await leer(r, sql, [id])).length > 0) quedan.push(tabla) }
      await queda('mesa', 'SELECT 1 FROM mesa WHERE id = $1', estado.mesaId)
      await queda('sesion_mesa', 'SELECT 1 FROM sesion_mesa WHERE id = $1', estado.sesionId)
      await queda('pedido', 'SELECT 1 FROM pedido WHERE id = $1', estado.pedidoId)
      await queda('pago', 'SELECT 1 FROM pago WHERE id = $1', estado.pagoId)
      await queda('cliente', 'SELECT 1 FROM cliente WHERE id = $1', estado.clienteId)

      const diferencias = creadas ? diferenciasDeLimpieza(creadas, borradas) : ['no se pudo contar lo creado']
      resultado = { creadas, borradas, quedan, coincide: diferencias.length === 0 && quedan.length === 0 }
      exigir(quedan.length === 0, `Después de e2e_limpiar quedan filas en: ${quedan.join(', ')}`)
      if (errorDeConteo) throw errorDeConteo
      exigir(diferencias.length === 0, `e2e_limpiar no borró lo que creó la corrida: ${diferencias.join('; ')}`)
      r.base = true
    }).catch(() => {})
    return resultado
  }

  return {
    // El que corre en staging según /health (lo que de verdad se probó) y el que se esperaba, si el workflow lo pasa.
    sha: estado.shaEnStaging ?? null,
    shaEsperado: c.sha ?? null,
    marcador: c.marcador,
    categoria: categoriaFinal(pasos),
    pasos,
    limpieza,
    msTotal: ahora() - inicio,
  }
}
