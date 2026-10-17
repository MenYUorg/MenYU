// Verifica que las variables con URLs existan, no estén vacías y empiecen con https://.
// Falla con un ::error:: por cada variable mal, nombrándola (sin imprimir valores).
// Uso: PROD_WEB_ADMIN_URL=... node scripts/smoke/verificar-urls.mjs PROD_WEB_ADMIN_URL [OTRA ...]
import { validarUrls } from './lib.mjs'

const nombres = process.argv.slice(2)
if (nombres.length === 0) {
  console.error('::error::verificar-urls.mjs: falta la lista de variables a verificar')
  process.exit(1)
}

const errores = validarUrls(nombres)
for (const error of errores) console.error(`::error::${error}`)
if (errores.length > 0) process.exit(1)
console.log(`Variables OK: ${nombres.join(', ')}`)
