import { decodificarPayloadJwt } from './jwt'

// La cuenta del login de `/auth` de esta app, que convive con la de Supabase hasta la Fase 5 (utils/cuenta.ts).
const TOKEN_KEY = 'menyu_access_token'
const REFRESH_KEY = 'menyu_refresh_token'

/**
 * El token de la cuenta con la que se inició sesión en este navegador, o `undefined` si no hay una cuenta o su token
 * ya no sirve (no es un token de cliente o ya venció). Quien lo pide lo manda al servidor solo si lo recibe: sin
 * token, o con uno que no sirve, el servidor trata a la persona como invitada, que es lo que se quiere cuando la
 * sesión venció, sin ningún error de por medio.
 */
export function leerTokenDeCuenta(ahora: number = Date.now()): string | undefined {
  try {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) return undefined
    const payload = decodificarPayloadJwt(token)
    if (!payload || payload['tipo'] !== 'cliente') return undefined
    const vence = payload['exp']
    if (typeof vence === 'number' && vence * 1000 <= ahora) return undefined
    return token
  } catch {
    // `localStorage` puede no estar disponible (navegación privada o datos del sitio bloqueados).
    return undefined
  }
}

/** Cierra la sesión de esa cuenta en este navegador. */
export function borrarTokensDeCuenta(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_KEY)
  } catch {
    // Sin `localStorage` tampoco había tokens guardados.
  }
}
