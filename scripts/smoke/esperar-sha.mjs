// Espera a que /health de staging muestre el commit de este run.
// Uso: STAGING_API_URL=... EXPECTED_SHA=... node scripts/smoke/esperar-sha.mjs
import { esperarSha, requerirEnv, urlBackend } from './lib.mjs'

try {
  await esperarSha({ backend: urlBackend(requerirEnv('STAGING_API_URL')), sha: requerirEnv('EXPECTED_SHA') })
} catch (err) {
  console.error(`::error::${err.message}`)
  process.exit(1)
}
