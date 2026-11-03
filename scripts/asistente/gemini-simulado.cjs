// Gemini simulado para probar scripts/asistente/evaluar.mjs sin gastar cuota: intercepta globalThis.fetch y responde
// todo pedido a googleapis.com con un SSE del formato de streamGenerateContent?alt=sse. Ningún pedido sale a la red.
// No es parte de la evaluación: una corrida de docs/asistente/evaluacion/ es siempre con el modelo de verdad.
//
// Uso, desde la raíz del repo (el ./ del --require no es opcional: sigue las reglas de resolución de require):
//
//   GOOGLE_GENERATIVE_AI_API_KEY=key-falsa \
//     node --require ./scripts/asistente/gemini-simulado.cjs scripts/asistente/evaluar.mjs --correr --salida <tmp>/prueba.json
//
//   En PowerShell: $env:GOOGLE_GENERATIVE_AI_API_KEY='key-falsa'; node --require ./scripts/... (la key del entorno no la
//   pisa el .env: cargarBackend usa loadEnvFile, que no sobrescribe lo que ya está cargado).
//   FALLAR_EN=n devuelve un 429 en el pedido n: así se prueban el corte en el primer error y después --reanudar.
//
// Igual hace falta la base local con el seed: ContextoService arma el system prompt de verdad; lo único falso es el modelo.
// Siempre con --salida a un archivo temporal, fuera de docs/asistente/evaluacion/, para no mezclar una prueba con una
// corrida real (y para que la guarda de "no pisa una corrida" no cuente las pruebas).
let llamadas = 0
const fallarEn = Number(process.env.FALLAR_EN || 0)
const original = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (!url.includes('googleapis.com')) return original(input, init)
  llamadas += 1
  process.stdout.write(`[simulado] pedido ${llamadas} bloqueado (${url.includes('streamGenerateContent') ? 'stream' : 'otro'})\n`)
  if (llamadas === fallarEn) {
    return new Response('{"error":{"code":429,"message":"cuota simulada","status":"RESOURCE_EXHAUSTED"}}', { status: 429, headers: { 'content-type': 'application/json' } })
  }
  const body = JSON.parse(init.body)
  const ultima = body.contents[body.contents.length - 1].parts.map((p) => p.text).join('')
  const sse = (o) => `data: ${JSON.stringify(o)}\r\n\r\n`
  const texto = `Respuesta simulada a: ${ultima} (mensajes: ${body.contents.length})`
  const chunks = [
    sse({ candidates: [{ content: { parts: [{ text: texto.slice(0, 10) }], role: 'model' } }] }),
    sse({ candidates: [{ content: { parts: [{ text: texto.slice(10) }], role: 'model' }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1250 + llamadas, candidatesTokenCount: 20, totalTokenCount: 1270 + llamadas } }),
  ]
  return new Response(new ReadableStream({ start(c) { for (const ch of chunks) c.enqueue(new TextEncoder().encode(ch)); c.close() } }), { status: 200, headers: { 'content-type': 'text/event-stream' } })
}
