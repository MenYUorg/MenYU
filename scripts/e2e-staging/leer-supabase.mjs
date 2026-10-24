// Lee VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY del .env de preview que genera `vercel pull` de web-staff (staging)
// y VITE_SUPABASE_URL del de production (para que el E2E compruebe que no son el mismo proyecto). Las deja en $GITHUB_ENV
// como E2E_SUPABASE_URL, E2E_SUPABASE_PUBLISHABLE_KEY y E2E_SUPABASE_URL_PRODUCCION. No imprime los valores.
// Uso: node scripts/e2e-staging/leer-supabase.mjs <.env.preview.local> <.env.production.local>
import { appendFileSync, readFileSync } from 'node:fs'
import { leerVariable } from '../smoke/lib.mjs'

function leer(ruta) {
  try {
    return readFileSync(ruta, 'utf8')
  } catch {
    console.error(`::error::No se encontró el archivo de vercel pull (${ruta})`)
    process.exit(1)
  }
}

const preview = leer(process.argv[2])
const produccion = leer(process.argv[3])
const valores = {
  E2E_SUPABASE_URL: leerVariable(preview, 'VITE_SUPABASE_URL'),
  E2E_SUPABASE_PUBLISHABLE_KEY: leerVariable(preview, 'VITE_SUPABASE_PUBLISHABLE_KEY'),
  E2E_SUPABASE_URL_PRODUCCION: leerVariable(produccion, 'VITE_SUPABASE_URL'),
}
const faltan = Object.entries(valores).filter(([, v]) => !v).map(([k]) => k)
if (faltan.length) {
  console.error(`::error::Faltan en las variables de web-staff en Vercel: ${faltan.join(', ')}`)
  process.exit(1)
}

if (!process.env.GITHUB_ENV) {
  console.error('::error::Este script solo corre en GitHub Actions (escribe en $GITHUB_ENV)')
  process.exit(1)
}
console.log(`::add-mask::${valores.E2E_SUPABASE_PUBLISHABLE_KEY}`)
appendFileSync(process.env.GITHUB_ENV, Object.entries(valores).map(([k, v]) => `${k}=${v}\n`).join(''))
console.log('E2E_SUPABASE_URL, E2E_SUPABASE_PUBLISHABLE_KEY y E2E_SUPABASE_URL_PRODUCCION tomadas de web-staff en Vercel')
