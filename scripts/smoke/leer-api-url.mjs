// Lee VITE_API_URL del .env que genera `vercel pull` de web-cliente (preview o production) y la deja en $GITHUB_ENV como SMOKE_API_URL.
// No imprime el archivo: solo usa esa línea.
// Uso: node scripts/smoke/leer-api-url.mjs <ruta a .vercel/.env.preview.local o .env.production.local>
import { appendFileSync, readFileSync } from 'node:fs'
import { leerVariable } from './lib.mjs'

const ruta = process.argv[2]
let contenido
try {
  contenido = readFileSync(ruta, 'utf8')
} catch {
  console.error(`::error::No se encontró el archivo de vercel pull (${ruta})`)
  process.exit(1)
}

const apiUrl = leerVariable(contenido, 'VITE_API_URL')
if (!apiUrl?.startsWith('https://')) {
  console.error(`::error::VITE_API_URL no está (o no es https) en las variables de web-cliente en Vercel (${ruta})`)
  process.exit(1)
}

if (process.env.GITHUB_ENV) {
  appendFileSync(process.env.GITHUB_ENV, `SMOKE_API_URL=${apiUrl}\n`)
  console.log('SMOKE_API_URL tomada de VITE_API_URL de web-cliente')
} else {
  console.log(apiUrl)
}
