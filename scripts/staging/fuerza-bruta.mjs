// Verifica en staging el límite de intentos fallidos de PIN (PR #383).
//
// Secuencia: 9 PIN incorrectos (404) → el PIN correcto abre la sesión (200) → el 10.º incorrecto (404)
// → el 11.º incorrecto responde 429. La sesión que se abre se cierra al final.
//
// Escribe en staging: abre y cierra una sesión de mesa, y deja el ingreso por PIN de ese restaurante
// bloqueado 15 minutos. Si el backend corre en varias instancias, cada una cuenta por separado y el
// 429 puede no llegar en el intento 11.
//
// Todo entra por variables de entorno; nada se escribe en el código ni se imprime:
//   API_URL               URL de la API de staging, con /api al final
//   RESTAURANTE_ID        restaurante de prueba
//   PIN_CORRECTO          PIN vigente de una mesa de ese restaurante
//   STAGING_API_HOST      host de la API de staging (sin https:// ni ruta): API_URL tiene que apuntar
//                         exactamente ahí; cualquier otro host, producción incluida, se rechaza
//   CONFIRMAR_STAGING=si  confirmación explícita de que se va a escribir en staging
//
// Uso (en una terminal propia, no en el chat):
//   CONFIRMAR_STAGING=si STAGING_API_HOST=... API_URL=... RESTAURANTE_ID=... PIN_CORRECTO=... node scripts/staging/fuerza-bruta.mjs
//
// Guardas:
//   - Exige CONFIRMAR_STAGING=si y STAGING_API_HOST, y solo corre si API_URL es https, apunta a ese host
//     y termina en /api (lista blanca: no hace falta conocer el host de producción para no pegarle).
//   - Valida que el PIN sea de 4 dígitos y distinto del PIN incorrecto, sin imprimirlo.
//   - Nunca imprime el PIN, el JWT ni el id del restaurante: solo los códigos HTTP y el mensaje del 429.
//   - Cierra la sesión aunque falle un paso posterior (try/finally) y avisa si no la pudo cerrar.

const { API_URL, RESTAURANTE_ID, PIN_CORRECTO, STAGING_API_HOST, CONFIRMAR_STAGING } = process.env

function cortar(mensaje) {
  console.error(mensaje)
  process.exit(1)
}

for (const [nombre, valor] of Object.entries({ API_URL, RESTAURANTE_ID, PIN_CORRECTO, STAGING_API_HOST })) {
  if (!valor) cortar(`Falta la variable de entorno ${nombre}`)
}
if (CONFIRMAR_STAGING !== 'si') cortar('Este script escribe en staging: correlo con CONFIRMAR_STAGING=si')

let url
try {
  url = new URL(API_URL)
} catch {
  cortar('API_URL no es una URL válida')
}
if (url.protocol !== 'https:') cortar('API_URL tiene que ser https')
if (!url.pathname.replace(/\/+$/, '').endsWith('/api')) cortar('API_URL tiene que terminar en /api')
// Lista blanca: el host tiene que ser exactamente el de staging (sin puerto ni subdominios de más).
// No se imprime ninguno de los dos hosts.
const hostStaging = STAGING_API_HOST.trim().toLowerCase()
if (!/^[a-z0-9.-]+$/.test(hostStaging)) cortar('STAGING_API_HOST tiene que ser solo el host, sin https:// ni ruta')
if (url.host !== hostStaging) cortar('API_URL no apunta al host de STAGING_API_HOST: no se corre')

const PIN_INCORRECTO = '0000' // generatePin nunca genera 0000 (rango 0001 a 9999)
if (!/^\d{4}$/.test(PIN_CORRECTO)) cortar('PIN_CORRECTO tiene que ser de 4 dígitos')
if (PIN_CORRECTO === PIN_INCORRECTO) cortar('PIN_CORRECTO no puede ser 0000')

const base = url.href.replace(/\/+$/, '')

async function abrir(pin) {
  const res = await fetch(`${base}/sessions/open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ restauranteId: RESTAURANTE_ID, pin }),
    signal: AbortSignal.timeout(15_000),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

const pasos = []
function anotar(descripcion, esperado, obtenido) {
  pasos.push({ ok: esperado === obtenido })
  console.log(`${esperado === obtenido ? 'OK   ' : 'FALLA'} ${descripcion}: esperado ${esperado}, obtenido ${obtenido}`)
}

let jwt
try {
  for (let i = 1; i <= 9; i++) anotar(`PIN incorrecto #${i}`, 404, (await abrir(PIN_INCORRECTO)).status)

  const correcto = await abrir(PIN_CORRECTO)
  anotar('PIN correcto con 9 fallos', 200, correcto.status)
  jwt = correcto.body?.jwt

  anotar('PIN incorrecto #10', 404, (await abrir(PIN_INCORRECTO)).status)
  const bloqueado = await abrir(PIN_INCORRECTO)
  anotar('PIN incorrecto #11', 429, bloqueado.status)
  if (bloqueado.body?.message) console.log(`      mensaje: ${bloqueado.body.message}`)
} finally {
  if (jwt) {
    const cierre = await fetch(`${base}/sessions/close`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}` },
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null)
    console.log(cierre?.ok
      ? `Cierre de la sesión abierta por el script: HTTP ${cierre.status}`
      : 'No se pudo cerrar la sesión abierta por el script: cerrala desde el panel del mozo')
  }
}

const fallas = pasos.filter((p) => !p.ok).length
console.log(fallas === 0 ? 'Resultado: OK' : `Resultado: ${fallas} paso(s) fallaron`)
process.exit(fallas === 0 ? 0 : 1)
