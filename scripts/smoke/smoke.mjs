// Smoke post-deploy de staging o producción (solo lectura).
// Uso: SMOKE_API_URL=... WEB_ADMIN_URL=... WEB_CLIENTE_URL=... WEB_STAFF_URL=... WEB_AUTH_URL=... node scripts/smoke/smoke.mjs
import { correrSmoke, requerirEnv } from './lib.mjs'

let apiUrl
try {
  apiUrl = requerirEnv('SMOKE_API_URL')
} catch (err) {
  console.error(`::error::${err.message}`)
  process.exit(1)
}

const resultados = await correrSmoke({
  apiUrl,
  frontends: {
    'web-admin': process.env.WEB_ADMIN_URL,
    'web-cliente': process.env.WEB_CLIENTE_URL,
    'web-staff': process.env.WEB_STAFF_URL,
    'web-auth': process.env.WEB_AUTH_URL,
  },
})

for (const r of resultados) console.log(`${r.ok ? 'OK  ' : 'FALLA'} ${r.nombre}: ${r.detalle}`)
const fallas = resultados.filter((r) => !r.ok)
if (fallas.length > 0) {
  console.error(`::error::Smoke: fallaron ${fallas.length} de ${resultados.length} chequeos`)
  process.exit(1)
}
