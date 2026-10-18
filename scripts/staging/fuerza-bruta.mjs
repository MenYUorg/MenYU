// Verifica en staging el límite de intentos fallidos de PIN (PR #383).
//
// Secuencia: 9 PIN incorrectos (404) → el PIN correcto abre la sesión (200) → el 10.º incorrecto (404)
// → el 11.º incorrecto responde 429. La sesión que se abre se cierra al final.
//
// Escribe en staging: abre y cierra una sesión de mesa, y deja el ingreso por PIN de ese restaurante
// bloqueado 15 minutos. Si el backend corre en varias instancias, cada una cuenta por separado y el
// 429 puede no llegar en el intento 11.
//
// Uso: API_URL=https://.../api RESTAURANTE_ID=... PIN_CORRECTO=1234 node scripts/staging/fuerza-bruta.mjs
const { API_URL, RESTAURANTE_ID, PIN_CORRECTO } = process.env
for (const [nombre, valor] of Object.entries({ API_URL, RESTAURANTE_ID, PIN_CORRECTO })) {
  if (!valor) {
    console.error(`Falta la variable de entorno ${nombre}`)
    process.exit(1)
  }
}
const PIN_INCORRECTO = '0000' // generatePin nunca genera 0000 (rango 0001 a 9999)

async function abrir(pin) {
  const res = await fetch(`${API_URL.replace(/\/+$/, '')}/sessions/open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ restauranteId: RESTAURANTE_ID, pin }),
    signal: AbortSignal.timeout(15_000),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

const pasos = []
function anotar(descripcion, esperado, obtenido) {
  pasos.push({ descripcion, esperado, obtenido, ok: esperado === obtenido })
  console.log(`${esperado === obtenido ? 'OK   ' : 'FALLA'} ${descripcion}: esperado ${esperado}, obtenido ${obtenido}`)
}

for (let i = 1; i <= 9; i++) anotar(`PIN incorrecto #${i}`, 404, (await abrir(PIN_INCORRECTO)).status)

const correcto = await abrir(PIN_CORRECTO)
anotar('PIN correcto con 9 fallos', 200, correcto.status)

anotar('PIN incorrecto #10', 404, (await abrir(PIN_INCORRECTO)).status)
const bloqueado = await abrir(PIN_INCORRECTO)
anotar('PIN incorrecto #11', 429, bloqueado.status)
if (bloqueado.body?.message) console.log(`      mensaje: ${bloqueado.body.message}`)

if (correcto.body?.jwt) {
  const cierre = await fetch(`${API_URL.replace(/\/+$/, '')}/sessions/close`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${correcto.body.jwt}` },
    signal: AbortSignal.timeout(15_000),
  })
  console.log(`Cierre de la sesión abierta por el script: HTTP ${cierre.status}`)
}

const fallas = pasos.filter((p) => !p.ok).length
console.log(fallas === 0 ? 'Resultado: OK' : `Resultado: ${fallas} paso(s) fallaron`)
process.exit(fallas === 0 ? 0 : 1)
