// Evaluación del asistente de mesa (docs/asistente/specs/asistente.md, Fase 7): corre el set de prueba
// (docs/asistente/set-prueba.json) y guarda, por respuesta, el texto, el tiempo, los tokens y el costo, con los campos
// `correcta` y `nota` vacíos para marcarlos a mano.
//
// Corre contra los services del backend, no contra el endpoint: ContextoService arma el system prompt de producción desde
// la base y ProveedorService llama al modelo con los parámetros de producción. Así se puede pasar cualquier modelo del AI
// SDK, los tokens salen de la llamada y no le aplican los límites de uso ni se escribe en registro_asistente.
//
// Uso, desde la raíz del repo (lee apps/backend/.env: DATABASE_URL y la key del proveedor; nunca la imprime):
//
//   node scripts/asistente/evaluar.mjs                        estima las llamadas y el costo; no llama al modelo
//   node scripts/asistente/evaluar.mjs --correr               corre el set y guarda los resultados en docs/asistente/evaluacion/
//   node scripts/asistente/evaluar.mjs --reanudar <archivo>   corre solo las preguntas que le faltan a una corrida cortada
//   node scripts/asistente/evaluar.mjs --resumen <archivo>    recalcula el resumen (con la precisión, si hay marcas) y el CSV
//
//   --modelos proveedor:modelo[,proveedor:modelo]   por defecto, google:<ASISTENTE_MODELO>
//   --max-llamadas N                                se niega a correr si haría más de N llamadas (30 por defecto)
//   --salida <archivo.json>                         con un solo modelo; por defecto, <fecha>-<proveedor>-<modelo>.json
//
// Para no gastar de más: sin --correr no llama al modelo; espacia las llamadas (15 RPM del free tier de Gemini); no pisa
// una corrida que ya existe; y corta en el primer error, guardando lo que tiene, para seguir con --reanudar.
//
// Sumar un proveedor (por ejemplo, para comparar con OpenAI o Anthropic): instalar su paquete del AI SDK en apps/backend,
// de la misma línea que `ai` (dist-tag ai-v6), cargar su key en apps/backend/.env y agregarlo a PROVEEDORES, con su
// precio vigente en PRECIOS_POR_MILLON.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const BACKEND = join(RAIZ, 'apps', 'backend')
const SET = join(RAIZ, 'docs', 'asistente', 'set-prueba.json')
const CARPETA_RESULTADOS = join(RAIZ, 'docs', 'asistente', 'evaluacion')

/** 15 RPM en el free tier de Gemini (Fase 0 de la spec): una llamada cada 4,5 s como mínimo, de arranque a arranque. */
const INTERVALO_MS = 4500
const MAX_LLAMADAS_POR_DEFECTO = 30
/** Cuánto se espera, después de que termina el stream, el callback con los tokens (el onFinish del AI SDK). */
const ESPERA_DEL_RESULTADO_MS = 5000
/** Para estimar antes de correr: la Fase 4 midió ~1.250 tokens de entrada con los 4.165 caracteres del prompt del seed. */
const CARACTERES_POR_TOKEN = 3.3

/** Los proveedores con los que se puede correr: el paquete del AI SDK, su función y la variable de la key. */
const PROVEEDORES = {
  // La key es la misma que VARIABLE_DE_LA_KEY de apps/backend/src/asistente/modelo.ts.
  google: { paquete: '@ai-sdk/google', funcion: 'google', variableDeLaKey: 'GOOGLE_GENERATIVE_AI_API_KEY' },
}

/** USD por millón de tokens, con facturación. Sin precio, el costo queda en null. */
const PRECIOS_POR_MILLON = {
  'gemini-3.1-flash-lite': {
    entrada: 0.25,
    salida: 1.5,
    fuente: 'Fase 0 de la spec, precios del 2026-10-31 con facturación (el free tier no cobra)',
  },
}

const COMO_MARCAR =
  'correcta: true o false según `debe` y `noDebe` de cada pregunta (y los criterios de `comoMarcar` del set); nota: lo que haga falta (voseo, largo, finishReason "length"). Después: node scripts/asistente/evaluar.mjs --resumen <este archivo>'

const USO = `Uso: node scripts/asistente/evaluar.mjs [--correr | --reanudar <archivo> | --resumen <archivo>]
           [--modelos proveedor:modelo,...] [--max-llamadas N] [--salida <archivo.json>]
Sin --correr solo estima: no llama al modelo. Detalle al principio del script.`

// ---------------------------------------------------------------------------------------------------------------------
// Utilidades

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

/** La promesa, o null si no se resuelve en `ms` (sin dejar el timer vivo). */
async function conTiempoLimite(promesa, ms) {
  let timer
  const limite = new Promise((r) => {
    timer = setTimeout(() => r(null), ms)
  })
  try {
    return await Promise.race([promesa, limite])
  } finally {
    clearTimeout(timer)
  }
}

/** sha256 de un texto, sin depender de los finales de línea del checkout (autocrlf en Windows). */
const sha256 = (texto) => createHash('sha256').update(texto.replace(/\r\n/g, '\n')).digest('hex')

const formatoNumero = (n, decimales = 0) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })

const redondear = (n, decimales) => Number(n.toFixed(decimales))

function fallar(mensaje) {
  console.error(`\n${mensaje}`)
  process.exit(1)
}

function git(...args) {
  try {
    return execFileSync('git', args, { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

function rutaRelativa(ruta) {
  return relative(RAIZ, ruta).split('\\').join('/')
}

function leerJson(ruta) {
  try {
    return JSON.parse(readFileSync(ruta, 'utf8'))
  } catch (error) {
    return fallar(`No se pudo leer ${rutaRelativa(ruta)}: ${error.message}`)
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// El set, el backend y los modelos

function leerSet() {
  const texto = readFileSync(SET, 'utf8')
  const set = JSON.parse(texto)
  const ids = new Set()
  for (const p of set.preguntas) {
    if (ids.has(p.id)) fallar(`El set tiene dos preguntas con el id ${p.id}.`)
    if (!set.categorias[p.categoria]) fallar(`La pregunta ${p.id} tiene una categoría que el set no define: ${p.categoria}.`)
    ids.add(p.id)
  }
  return { ...set, sha256: sha256(texto) }
}

/** Los services del backend, desde su código fuente (ts-node, como el seed): nunca se evalúa un dist/ viejo. */
function cargarBackend() {
  const env = join(BACKEND, '.env')
  // No pisa lo que ya trae el entorno: se puede cambiar una variable para una corrida sin tocar el .env.
  if (existsSync(env)) process.loadEnvFile(env)
  describirBase()
  const requerir = createRequire(join(BACKEND, 'package.json'))
  requerir('ts-node').register({ transpileOnly: true, project: join(BACKEND, 'tsconfig.json') })
  requerir('reflect-metadata')
  return {
    requerir,
    PrismaClient: requerir('@prisma/client').PrismaClient,
    PrismaPg: requerir('@prisma/adapter-pg').PrismaPg,
    ContextoService: requerir('./src/asistente/contexto.service.ts').ContextoService,
    ProveedorService: requerir('./src/asistente/proveedor.service.ts').ProveedorService,
    historialParaElModelo: requerir('./src/asistente/asistente.service.ts').historialParaElModelo,
    configuracionDelAsistente: requerir('./src/asistente/configuracion.ts').configuracionDelAsistente,
  }
}

/** Servidor y base de DATABASE_URL, sin usuario ni clave. */
function describirBase() {
  try {
    const url = new URL(process.env.DATABASE_URL)
    return `${url.host}${url.pathname}`
  } catch {
    return fallar('Falta DATABASE_URL (en apps/backend/.env o en el entorno).')
  }
}

async function armarSystemPrompt(backend, set) {
  // Con la config y no con un Pool propio, como hace PrismaService: así el adapter es dueño del pool y $disconnect lo
  // cierra (con el Pool de PrismaService, el proceso queda vivo hasta que vence el timeout de inactividad de pg).
  const prisma = new backend.PrismaClient({ adapter: new backend.PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  try {
    const sistema = await new backend.ContextoService(prisma).systemPrompt(set.restauranteId)
    if (!sistema.includes(`# ${set.restaurante} — información del local`)) {
      fallar(`El restaurante del set (${set.restaurante}, ${set.restauranteId}) no está en la base o tiene otro nombre. ¿Corriste el seed?`)
    }
    return sistema
  } finally {
    await prisma.$disconnect()
  }
}

function leerModelos(texto, configuracion) {
  const ids = (texto ?? `google:${configuracion.modelo}`).split(',').map((m) => m.trim()).filter(Boolean)
  return ids.map((id) => {
    const separador = id.indexOf(':')
    const proveedor = PROVEEDORES[id.slice(0, separador)]
    if (separador < 1 || !proveedor) {
      fallar(`Modelo "${id}": va como proveedor:modelo, con un proveedor de PROVEEDORES (${Object.keys(PROVEEDORES).join(', ')}).`)
    }
    const nombre = id.slice(separador + 1)
    return { id, nombre, proveedor, precio: PRECIOS_POR_MILLON[nombre] ?? null }
  })
}

/** Que estén el paquete y la key de cada modelo, antes de hacer cualquier llamada. */
function exigirProveedores(backend, modelos) {
  for (const { id, proveedor } of modelos) {
    try {
      backend.requerir.resolve(proveedor.paquete)
    } catch {
      fallar(`${id}: falta el paquete ${proveedor.paquete} en apps/backend.`)
    }
    if (!process.env[proveedor.variableDeLaKey]?.trim()) {
      fallar(`${id}: falta ${proveedor.variableDeLaKey} (en apps/backend/.env o en el entorno).`)
    }
  }
}

function crearModelo(backend, { proveedor, nombre }) {
  return backend.requerir(proveedor.paquete)[proveedor.funcion](nombre)
}

// ---------------------------------------------------------------------------------------------------------------------
// Una pregunta

function mensajesDe(pregunta) {
  return [...(pregunta.historial ?? []), { rol: 'usuario', contenido: pregunta.pregunta }]
}

function costoUsd(tokensEntrada, tokensSalida, precio) {
  if (!precio || tokensEntrada == null || tokensSalida == null) return null
  return redondear((tokensEntrada * precio.entrada + tokensSalida * precio.salida) / 1e6, 8)
}

function leerError(errorText) {
  try {
    return JSON.parse(errorText)
  } catch {
    return { codigo: 'error_del_asistente', mensaje: errorText }
  }
}

/**
 * Una llamada al modelo con ProveedorService, como la hace el endpoint: el historial truncado con historialParaElModelo y
 * el system prompt de ContextoService. Los tokens y la duración son los que recibe el registro (callback alTerminar).
 */
async function preguntar(backend, proveedor, sistema, pregunta, configuracion) {
  const mensajes = backend.historialParaElModelo(mensajesDe(pregunta), configuracion)
  let alTerminar
  const terminado = new Promise((r) => {
    alTerminar = r
  })
  const inicio = performance.now()
  const desdeElInicio = () => Math.round(performance.now() - inicio)

  // Resuelve con el primer texto (o con el error del proveedor antes de empezar a responder).
  const arranque = await proveedor.responder(sistema, mensajes, async (resultado) => alTerminar(resultado))
  const msPrimerTexto = desdeElInicio()
  if (!arranque.ok) return { error: arranque.error, msTotal: msPrimerTexto }

  const lector = arranque.stream.getReader()
  let texto = ''
  let finishReason = null
  let error = null
  for (;;) {
    const { done, value } = await lector.read()
    if (done) break
    if (value.type === 'text-delta') texto += value.delta
    else if (value.type === 'finish') finishReason = value.finishReason ?? null
    else if (value.type === 'error') error = leerError(value.errorText)
    else if (value.type === 'abort') error = { codigo: 'abort', mensaje: value.reason ?? 'El stream se cortó' }
  }
  if (error) return { error, respuestaParcial: texto, msPrimerTexto, msTotal: desdeElInicio() }

  const resultado = await conTiempoLimite(terminado, ESPERA_DEL_RESULTADO_MS)
  return {
    respuesta: resultado?.respuesta ?? texto,
    finishReason,
    msPrimerTexto,
    msTotal: resultado?.duracionMs ?? desdeElInicio(),
    tokensEntrada: resultado?.tokensEntrada ?? null,
    tokensSalida: resultado?.tokensSalida ?? null,
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Resultados: JSON (el que se marca), CSV (para una planilla) y resumen

function nuevoDocumento({ set, sistema, modelo, configuracion }) {
  return {
    corrida: {
      fecha: new Date().toISOString(),
      modelo: modelo.id,
      set: rutaRelativa(SET),
      setVersion: set.version,
      setSha256: set.sha256,
      preguntasDelSet: set.preguntas.length,
      restauranteId: set.restauranteId,
      restaurante: set.restaurante,
      systemPromptCaracteres: sistema.length,
      systemPromptSha256: sha256(sistema),
      commit: git('rev-parse', '--short', 'HEAD'),
      cambiosSinCommitearEnElBackend: git('status', '--porcelain', '--', 'apps/backend/src') !== '',
      parametros: {
        maxOutputTokens: configuracion.maxTokensRespuesta,
        maxMensajesHistorial: configuracion.maxMensajesHistorial,
        intervaloMs: INTERVALO_MS,
        resto: 'temperatura 0,3, sin reintentos y timeout de 30 s: los de ProveedorService',
      },
      precioPorMillonUsd: modelo.precio,
      llamadas: 0,
      reanudada: [],
      comoMarcar: COMO_MARCAR,
    },
    resumen: null,
    resultados: [],
  }
}

function resultadoDe(pregunta, respuesta, precio, anterior) {
  const { id, categoria, historial, esperado, debe, noDebe } = pregunta
  return {
    id,
    categoria,
    pregunta: pregunta.pregunta,
    ...(historial ? { historial } : {}),
    esperado,
    debe,
    noDebe,
    respuesta: respuesta.respuesta ?? null,
    ...(respuesta.respuestaParcial ? { respuestaParcial: respuesta.respuestaParcial } : {}),
    finishReason: respuesta.finishReason ?? null,
    msPrimerTexto: respuesta.msPrimerTexto ?? null,
    msTotal: respuesta.msTotal ?? null,
    tokensEntrada: respuesta.tokensEntrada ?? null,
    tokensSalida: respuesta.tokensSalida ?? null,
    costoUsd: costoUsd(respuesta.tokensEntrada, respuesta.tokensSalida, precio),
    error: respuesta.error ?? null,
    correcta: anterior?.correcta ?? null,
    nota: anterior?.nota ?? null,
  }
}

const respondida = (r) => r && !r.error && r.respuesta != null

function estadisticas(valores) {
  if (valores.length === 0) return null
  const orden = [...valores].sort((a, b) => a - b)
  const percentil = (p) => orden[Math.max(0, Math.ceil(p * orden.length) - 1)]
  return { mediana: percentil(0.5), p90: percentil(0.9), max: orden[orden.length - 1] }
}

function calcularResumen(doc) {
  const ok = doc.resultados.filter(respondida)
  const suma = (campo) => ok.reduce((total, r) => total + (r[campo] ?? 0), 0)
  const conCosto = ok.filter((r) => r.costoUsd != null)
  const costoTotal = conCosto.reduce((total, r) => total + r.costoUsd, 0)
  const marcadas = ok.filter((r) => typeof r.correcta === 'boolean')
  const correctas = marcadas.filter((r) => r.correcta).length
  const porCategoria = {}
  for (const r of doc.resultados) {
    const c = (porCategoria[r.categoria] ??= { preguntas: 0, respondidas: 0, marcadas: 0, correctas: 0, precision: null })
    c.preguntas += 1
    if (!respondida(r)) continue
    c.respondidas += 1
    if (typeof r.correcta !== 'boolean') continue
    c.marcadas += 1
    if (r.correcta) c.correctas += 1
  }
  for (const c of Object.values(porCategoria)) c.precision = c.marcadas ? redondear(c.correctas / c.marcadas, 3) : null
  return {
    preguntasDelSet: doc.corrida.preguntasDelSet,
    respondidas: ok.length,
    conError: doc.resultados.filter((r) => r.error).length,
    pendientes: doc.corrida.preguntasDelSet - ok.length,
    cortadasPorElTopeDeSalida: ok.filter((r) => r.finishReason === 'length').length,
    latenciaMs: {
      primerTexto: estadisticas(ok.map((r) => r.msPrimerTexto).filter((v) => v != null)),
      total: estadisticas(ok.map((r) => r.msTotal).filter((v) => v != null)),
    },
    tokens: {
      entrada: { total: suma('tokensEntrada'), promedio: ok.length ? Math.round(suma('tokensEntrada') / ok.length) : null },
      salida: { total: suma('tokensSalida'), promedio: ok.length ? Math.round(suma('tokensSalida') / ok.length) : null },
    },
    costoUsd:
      conCosto.length > 0
        ? {
            total: redondear(costoTotal, 6),
            porPregunta: redondear(costoTotal / conCosto.length, 6),
            cada1000Preguntas: redondear((costoTotal / conCosto.length) * 1000, 2),
          }
        : null,
    marcadas: marcadas.length,
    correctas,
    precision: marcadas.length ? redondear(correctas / marcadas.length, 3) : null,
    porCategoria,
  }
}

function campoCsv(valor) {
  if (valor == null) return ''
  const texto = typeof valor === 'string' ? valor : Array.isArray(valor) ? valor.join(' · ') : String(valor)
  return /[",\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

const COLUMNAS_CSV = [
  ['id', (r) => r.id],
  ['categoria', (r) => r.categoria],
  ['historial', (r) => r.historial?.map((m) => `${m.rol}: ${m.contenido}`).join(' | ')],
  ['pregunta', (r) => r.pregunta],
  ['esperado', (r) => r.esperado],
  ['debe', (r) => r.debe],
  ['no_debe', (r) => r.noDebe],
  ['respuesta', (r) => r.respuesta ?? r.respuestaParcial],
  ['finish_reason', (r) => r.finishReason],
  ['ms_primer_texto', (r) => r.msPrimerTexto],
  ['ms_total', (r) => r.msTotal],
  ['tokens_entrada', (r) => r.tokensEntrada],
  ['tokens_salida', (r) => r.tokensSalida],
  ['costo_usd', (r) => r.costoUsd],
  ['error', (r) => (r.error ? `${r.error.codigo}: ${r.error.mensaje}` : null)],
  ['correcta', (r) => r.correcta],
  ['nota', (r) => r.nota],
]

function guardar(doc, rutaJson, set) {
  const orden = new Map(set.preguntas.map((p, i) => [p.id, i]))
  doc.resultados.sort((a, b) => (orden.get(a.id) ?? Infinity) - (orden.get(b.id) ?? Infinity))
  doc.resumen = calcularResumen(doc)
  writeFileSync(rutaJson, `${JSON.stringify(doc, null, 2)}\n`)
  const filas = [COLUMNAS_CSV.map(([nombre]) => nombre), ...doc.resultados.map((r) => COLUMNAS_CSV.map(([, f]) => f(r)))]
  // Con BOM, para que una planilla lo abra como UTF-8.
  writeFileSync(rutaJson.replace(/\.json$/, '.csv'), `\uFEFF${filas.map((f) => f.map(campoCsv).join(',')).join('\n')}\n`)
}

function imprimirResumen(doc) {
  const r = doc.resumen
  const ms = (e) => (e ? `mediana ${formatoNumero(e.mediana)} · p90 ${formatoNumero(e.p90)} · máx. ${formatoNumero(e.max)}` : '-')
  console.log(`\nModelo: ${doc.corrida.modelo}`)
  console.log(`Respondidas: ${r.respondidas} de ${r.preguntasDelSet} (con error: ${r.conError}; cortadas por el tope de salida: ${r.cortadasPorElTopeDeSalida})`)
  console.log(`Primer texto (ms): ${ms(r.latenciaMs.primerTexto)}`)
  console.log(`Respuesta completa (ms): ${ms(r.latenciaMs.total)}`)
  console.log(`Tokens: entrada ${formatoNumero(r.tokens.entrada.total)} (promedio ${r.tokens.entrada.promedio ?? '-'}) · salida ${formatoNumero(r.tokens.salida.total)} (promedio ${r.tokens.salida.promedio ?? '-'})`)
  if (r.costoUsd) {
    console.log(`Costo con facturación: USD ${formatoNumero(r.costoUsd.total, 6)} · USD ${formatoNumero(r.costoUsd.cada1000Preguntas, 2)} cada 1.000 preguntas`)
  }
  if (r.marcadas === 0) {
    console.log('Precisión: sin marcar todavía (correcta: true/false en el JSON y después --resumen).')
    return
  }
  console.log(`Precisión: ${r.correctas}/${r.marcadas} marcadas (${formatoNumero(r.precision * 100, 1)} %)`)
  for (const [categoria, c] of Object.entries(r.porCategoria)) {
    const precision = c.precision == null ? '-' : `${formatoNumero(c.precision * 100, 0)} %`
    console.log(`  ${categoria.padEnd(18)} ${c.correctas}/${c.marcadas} marcadas de ${c.preguntas}  ${precision}`)
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Modos

function imprimirEstimacion({ set, sistema, modelos, pendientes, configuracion, maxLlamadas }) {
  const llamadas = pendientes.length * modelos.length
  const tokensEntrada = pendientes.map((p) =>
    Math.ceil((sistema.length + mensajesDe(p).reduce((total, m) => total + m.contenido.length, 0)) / CARACTERES_POR_TOKEN),
  )
  const entradaTotal = tokensEntrada.reduce((a, b) => a + b, 0)
  console.log(`Set: ${set.preguntas.length} preguntas (${rutaRelativa(SET)}, versión ${set.version})`)
  console.log(`Restaurante: ${set.restaurante} (${set.restauranteId}) · system prompt de ${formatoNumero(sistema.length)} caracteres (~${formatoNumero(Math.round(sistema.length / CARACTERES_POR_TOKEN))} tokens)`)
  console.log(`Base: ${describirBase()}`)
  console.log(`Modelos: ${modelos.map((m) => m.id).join(', ')}`)
  console.log(`Llamadas reales: ${llamadas} (${pendientes.length} preguntas × ${modelos.length} ${modelos.length === 1 ? 'modelo' : 'modelos'}); tope: ${maxLlamadas}`)
  console.log(`Tiempo mínimo: ~${formatoNumero((llamadas * INTERVALO_MS) / 60000, 1)} min (una llamada cada ${formatoNumero(INTERVALO_MS / 1000, 1)} s)`)
  for (const m of modelos) {
    if (!m.precio) {
      console.log(`Costo de ${m.id}: sin precio en PRECIOS_POR_MILLON (queda en null)`)
      continue
    }
    const peorCaso = (entradaTotal * m.precio.entrada + pendientes.length * configuracion.maxTokensRespuesta * m.precio.salida) / 1e6
    console.log(`Costo de ${m.id} en el peor caso (~${formatoNumero(entradaTotal)} tokens de entrada y ${configuracion.maxTokensRespuesta} de salida por pregunta, con facturación): USD ${formatoNumero(peorCaso, 4)}`)
  }
  return llamadas
}

async function correrPreguntas({ backend, set, sistema, modelo, pendientes, doc, rutaJson, configuracion }) {
  const proveedor = new backend.ProveedorService(crearModelo(backend, modelo))
  const anteriores = new Map(doc.resultados.map((r) => [r.id, r]))
  let ultimoArranque = 0
  for (const [i, pregunta] of pendientes.entries()) {
    const espera = ultimoArranque + INTERVALO_MS - Date.now()
    if (espera > 0) await dormir(espera)
    ultimoArranque = Date.now()
    doc.corrida.llamadas += 1
    const respuesta = await preguntar(backend, proveedor, sistema, pregunta, configuracion)
    const resultado = resultadoDe(pregunta, respuesta, modelo.precio, anteriores.get(pregunta.id))
    doc.resultados = [...doc.resultados.filter((r) => r.id !== pregunta.id), resultado]
    guardar(doc, rutaJson, set)

    const contador = `[${String(i + 1).padStart(2)}/${pendientes.length}]`
    if (resultado.error) {
      console.log(`${contador} ${pregunta.id}: ERROR ${resultado.error.codigo}: ${resultado.error.mensaje}`)
      return false
    }
    const tokens = `${resultado.tokensEntrada ?? '?'}/${resultado.tokensSalida ?? '?'} tokens`
    const texto = resultado.respuesta.replace(/\s+/g, ' ')
    console.log(`${contador} ${pregunta.id}: ${formatoNumero(resultado.msTotal)} ms (primer texto ${formatoNumero(resultado.msPrimerTexto)}) · ${tokens} · ${texto.slice(0, 90)}${texto.length > 90 ? '…' : ''}`)
  }
  return true
}

function avisarCorte(rutaJson) {
  fallar(
    `Corrida cortada en el primer error; lo respondido quedó en ${rutaRelativa(rutaJson)}.\n` +
      `Para seguir más tarde, solo con las que faltan: node scripts/asistente/evaluar.mjs --reanudar ${rutaRelativa(rutaJson)}`,
  )
}

async function correr(values) {
  const set = leerSet()
  const backend = cargarBackend()
  const configuracion = backend.configuracionDelAsistente()
  const modelos = leerModelos(values.modelos, configuracion)
  const maxLlamadas = values['max-llamadas'] ? Number(values['max-llamadas']) : MAX_LLAMADAS_POR_DEFECTO
  if (!Number.isInteger(maxLlamadas) || maxLlamadas < 1) fallar('--max-llamadas va con un entero mayor que cero.')
  if (values.salida && modelos.length > 1) fallar('--salida va con un solo modelo.')

  const sistema = await armarSystemPrompt(backend, set)
  const llamadas = imprimirEstimacion({ set, sistema, modelos, pendientes: set.preguntas, configuracion, maxLlamadas })
  if (llamadas > maxLlamadas) fallar(`Son ${llamadas} llamadas y el tope es ${maxLlamadas}: subilo con --max-llamadas si de verdad hacen falta.`)
  if (!values.correr) {
    console.log('\nNo se llamó al modelo. Para correrlo: --correr')
    return
  }
  exigirProveedores(backend, modelos)

  const fecha = new Date().toISOString().slice(0, 10)
  const corridas = modelos.map((modelo) => ({
    modelo,
    rutaJson: values.salida
      ? resolve(values.salida)
      : join(CARPETA_RESULTADOS, `${fecha}-${modelo.id.replace(/[^\w.-]+/g, '-')}.json`),
  }))
  for (const { rutaJson } of corridas) {
    if (existsSync(rutaJson)) {
      fallar(`Ya hay una corrida en ${rutaRelativa(rutaJson)}. Para completar una cortada: --reanudar <archivo>; para otra, --salida <otro archivo>.`)
    }
  }
  mkdirSync(CARPETA_RESULTADOS, { recursive: true })

  for (const { modelo, rutaJson } of corridas) {
    console.log(`\n▶ ${modelo.id} → ${rutaRelativa(rutaJson)}`)
    const doc = nuevoDocumento({ set, sistema, modelo, configuracion })
    const completa = await correrPreguntas({ backend, set, sistema, modelo, pendientes: set.preguntas, doc, rutaJson, configuracion })
    imprimirResumen(doc)
    console.log(`Llamadas reales a ${modelo.id}: ${doc.corrida.llamadas}`)
    if (!completa) avisarCorte(rutaJson)
  }
}

async function reanudar(values) {
  const rutaJson = resolve(values.reanudar)
  const doc = leerJson(rutaJson)
  const set = leerSet()
  if (doc.corrida.setSha256 !== set.sha256) fallar('El set cambió desde esa corrida: hay que correrlo entero de nuevo (--correr).')
  const backend = cargarBackend()
  const configuracion = backend.configuracionDelAsistente()
  const [modelo] = leerModelos(doc.corrida.modelo, configuracion)
  const maxLlamadas = values['max-llamadas'] ? Number(values['max-llamadas']) : MAX_LLAMADAS_POR_DEFECTO
  const sistema = await armarSystemPrompt(backend, set)
  if (doc.corrida.systemPromptSha256 !== sha256(sistema)) {
    fallar('Los datos del restaurante (el system prompt) cambiaron desde esa corrida: hay que correrla entera de nuevo (--correr).')
  }
  const hechas = new Set(doc.resultados.filter(respondida).map((r) => r.id))
  const pendientes = set.preguntas.filter((p) => !hechas.has(p.id))
  if (pendientes.length === 0) {
    console.log(`No le falta ninguna pregunta a ${rutaRelativa(rutaJson)}.`)
    return
  }
  const llamadas = imprimirEstimacion({ set, sistema, modelos: [modelo], pendientes, configuracion, maxLlamadas })
  if (llamadas > maxLlamadas) fallar(`Son ${llamadas} llamadas y el tope es ${maxLlamadas}.`)
  exigirProveedores(backend, [modelo])

  console.log(`\n▶ ${modelo.id} → ${rutaRelativa(rutaJson)} (faltan ${pendientes.length})`)
  doc.corrida.reanudada.push(new Date().toISOString())
  const antes = doc.corrida.llamadas
  const completa = await correrPreguntas({ backend, set, sistema, modelo, pendientes, doc, rutaJson, configuracion })
  imprimirResumen(doc)
  console.log(`Llamadas reales a ${modelo.id}: ${doc.corrida.llamadas - antes} en esta tanda (${doc.corrida.llamadas} en total)`)
  if (!completa) avisarCorte(rutaJson)
}

function resumir(values) {
  const rutaJson = resolve(values.resumen)
  const doc = leerJson(rutaJson)
  guardar(doc, rutaJson, leerSet())
  imprimirResumen(doc)
  console.log(`\nResumen y CSV actualizados: ${rutaRelativa(rutaJson)} (y ${basename(rutaJson, '.json')}.csv). No se llamó al modelo.`)
}

function leerOpciones() {
  try {
    return parseArgs({
      options: {
        correr: { type: 'boolean' },
        reanudar: { type: 'string' },
        resumen: { type: 'string' },
        modelos: { type: 'string' },
        'max-llamadas': { type: 'string' },
        salida: { type: 'string' },
        ayuda: { type: 'boolean', short: 'h' },
      },
      strict: true,
    }).values
  } catch (error) {
    return fallar(`${error.message}\n${USO}`)
  }
}

const values = leerOpciones()
if (values.ayuda) console.log(USO)
else if (values.resumen) resumir(values)
else if (values.reanudar) await reanudar(values)
else await correr(values)
