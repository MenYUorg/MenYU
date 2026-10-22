// Guardas de las pruebas de carga con k6. Sin imports de k6: lo usan los scripts de k6 y los tests de Node
// (node --test scripts/carga/guardas.test.mjs). Nunca imprimen URLs ni hosts: solo qué regla no se cumplió.

/**
 * Hosts de producción conocidos (CLAUDE.md, "Cuatro apps web independientes"), más el dominio de Railway de la API de
 * producción, que sigue activo (docs/auth/VariablesACambiar.md, tabla de dominios). Se suman a los de las variables
 * PROD_* que pasa el workflow: aunque falte alguna variable, estos nunca se aceptan.
 */
export const HOSTS_DE_PRODUCCION = [
  'api.menyu-app.com',
  'menyu-backend-production.up.railway.app',
  'mesa.menyu-app.com',
  'staff.menyu-app.com',
  'admin.menyu-app.com',
  'auth.menyu-app.com',
]

const HOSTS_LOCALES = ['localhost', '127.0.0.1', 'host.docker.internal']

/** Host (sin puerto, en minúsculas) de una URL http(s), o null si no lo es. k6 no trae `URL`, por eso la regex. */
export function hostDe(url) {
  const m = /^https?:\/\/([^/?#:]+)(?::\d+)?(?:[/?#]|$)/i.exec(String(url ?? '').trim())
  return m ? m[1].toLowerCase() : null
}

/** Hosts de las URLs de PROD_HOSTS (separadas por comas, como las arma el workflow con las variables PROD_*). */
export function hostsDeProduccion(prodHosts) {
  const deVariables = String(prodHosts ?? '')
    .split(',')
    .map((valor) => hostDe(valor) ?? valor.trim().toLowerCase())
    .filter(Boolean)
  return [...new Set([...HOSTS_DE_PRODUCCION, ...deVariables])]
}

/**
 * Errores que impiden correr la prueba de carga (lista vacía si se puede):
 * - CONFIRMAR_STAGING tiene que ser "si".
 * - BASE_URL tiene que ser la URL de la API, terminada en /api: https, o http solo en local.
 * - El host no puede ser de producción: ni uno de HOSTS_DE_PRODUCCION ni uno de PROD_HOSTS.
 */
export function erroresDeConfiguracion(env) {
  const errores = []
  if (env.CONFIRMAR_STAGING !== 'si') {
    errores.push('Falta CONFIRMAR_STAGING=si: la prueba de carga solo corre contra staging o local, a propósito.')
  }

  const baseUrl = String(env.BASE_URL ?? '').trim()
  const host = hostDe(baseUrl)
  if (!baseUrl) {
    errores.push('Falta BASE_URL (la URL de la API, terminada en /api).')
    return errores
  }
  if (!host) {
    errores.push('BASE_URL no es una URL http(s) válida.')
    return errores
  }
  if (!/\/api\/?$/.test(baseUrl)) errores.push('BASE_URL tiene que terminar en /api.')
  if (baseUrl.toLowerCase().startsWith('http://') && !HOSTS_LOCALES.includes(host)) {
    errores.push('BASE_URL con http:// solo se acepta en local; staging va por https://.')
  }
  if (hostsDeProduccion(env.PROD_HOSTS).includes(host)) {
    errores.push('BASE_URL apunta a un host de producción: la prueba de carga no corre contra producción.')
  }
  return errores
}

/** URL del backend donde vive /health: BASE_URL sin el /api final (como urlBackend del smoke). */
export function urlBackend(baseUrl) {
  return String(baseUrl).trim().replace(/\/+$/, '').replace(/\/api$/, '')
}
