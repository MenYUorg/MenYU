/**
 * Cuántos proxies hay delante del backend: el `trust proxy` de Express, del que sale `req.ip` (lo usa el límite por IP
 * del asistente, docs/asistente/specs/asistente.md, "Límites de uso").
 *
 * - En Railway, 1: su edge (el DNS de Cloudflare está sin proxy, ver docs/auth/VariablesACambiar.md). Con 1 salto,
 *   Express confía solo en quien abre la conexión y toma la entrada de más a la derecha de `X-Forwarded-For`, la que
 *   puso el edge: lo que el cliente haya escrito antes en ese header no cuenta. Railway se reconoce por
 *   `RAILWAY_ENVIRONMENT_ID`, que inyecta en cada servicio.
 * - Fuera de Railway (local, CI), 0: no hay proxy, `X-Forwarded-For` no se lee y la IP es la de la conexión.
 * - `TRUST_PROXY_HOPS` lo fija a mano, por ejemplo si se prendiera el proxy de Cloudflare (serían 2). Nunca `true`:
 *   Express tomaría la entrada de más a la izquierda, que la escribe el cliente.
 */
export function saltosDeProxy(env: NodeJS.ProcessEnv = process.env): number {
  const aMano = env.TRUST_PROXY_HOPS?.trim()
  if (aMano) {
    const saltos = Number(aMano)
    if (Number.isInteger(saltos) && saltos >= 0) return saltos
  }
  return env.RAILWAY_ENVIRONMENT_ID ? 1 : 0
}
