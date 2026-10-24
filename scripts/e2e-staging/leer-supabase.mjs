// Lee VITE_SUPABASE_URL del .env de production que genera `vercel pull` de web-staff y la deja en $GITHUB_ENV como
// E2E_SUPABASE_URL_PRODUCCION: el E2E la compara con la de staging (variable del repo E2E_SUPABASE_URL) y corta si son el
// mismo proyecto. La URL y la clave pública de staging no salen de acá: son variables del repo. No imprime el valor.
// Uso: node scripts/e2e-staging/leer-supabase.mjs <.env.production.local>
import { appendFileSync, readFileSync } from 'node:fs'
import { leerVariable } from '../smoke/lib.mjs'

const ruta = process.argv[2]
let contenido
try {
  contenido = readFileSync(ruta, 'utf8')
} catch {
  console.error(`::error::No se encontró el archivo de vercel pull (${ruta})`)
  process.exit(1)
}

const urlProduccion = leerVariable(contenido, 'VITE_SUPABASE_URL')
if (!urlProduccion) {
  console.error('::error::Falta VITE_SUPABASE_URL en el entorno Production de web-staff en Vercel')
  process.exit(1)
}
if (!process.env.GITHUB_ENV) {
  console.error('::error::Este script solo corre en GitHub Actions (escribe en $GITHUB_ENV)')
  process.exit(1)
}
appendFileSync(process.env.GITHUB_ENV, `E2E_SUPABASE_URL_PRODUCCION=${urlProduccion}\n`)
console.log('E2E_SUPABASE_URL_PRODUCCION tomada de web-staff (Production) en Vercel')
