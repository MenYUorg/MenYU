import type { Session } from '@supabase/supabase-js'
import { vi } from 'vitest'

/**
 * Simula `@menyu/auth-client` en todos los specs de web-cliente: lo monta src/test/setup.ts, así ningún test habla con
 * Supabase. Por defecto no hay sesión (la cuenta es opcional, Fase 4b); un test la abre con
 * `cuentaDePrueba.session = sesionDeSupabase({ nombre: 'Ana' })`, y cerrar sesión la borra.
 *
 * Los `vi.fn` se crean con su comportamiento, para que un `vi.resetAllMocks()` de un spec vuelva a él y no a undefined.
 */
export const cuentaDePrueba: { session: Session | null; cargando: boolean } = { session: null, cargando: false }

export const signOutSimulado = vi.fn(async () => {
  cuentaDePrueba.session = null
  return { error: null }
})

export const tokenDeAccesoSimulado = vi.fn(async (): Promise<string | null> => cuentaDePrueba.session?.access_token ?? null)

export const clienteAuthSimulado = vi.fn(() => ({ auth: { signOut: signOutSimulado } }))

export function reiniciarCuentaDePrueba(): void {
  cuentaDePrueba.session = null
  cuentaDePrueba.cargando = false
  signOutSimulado.mockReset()
  tokenDeAccesoSimulado.mockReset()
  clienteAuthSimulado.mockReset()
}

/**
 * Las variables con las que esta app comparte la sesión de web-auth (utils/cuenta.ts, `comparteLaSesionDeWebAuth`). En
 * jsdom la página es `localhost`, así que ese es el dominio de la cookie. Deshacer con `vi.unstubAllEnvs()`.
 */
export function compartirLaSesionDeWebAuth(urlDeAuth = 'https://auth.menyu-app.com'): void {
  vi.stubEnv('VITE_AUTH_URL', urlDeAuth)
  vi.stubEnv('VITE_SUPABASE_URL', 'https://proyecto.supabase.co')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'clave-publica')
  vi.stubEnv('VITE_AUTH_COOKIE_DOMAIN', 'localhost')
}

/** Una sesión de Supabase con lo que web-cliente usa: el token, el email y `user_metadata`. */
export function sesionDeSupabase({
  nombre,
  email = 'ana@gmail.com',
  token = 'token-de-supabase',
  metadatos,
}: { nombre?: string; email?: string; token?: string; metadatos?: Record<string, unknown> } = {}): Session {
  return {
    access_token: token,
    user: { id: 'uid-1', email, user_metadata: metadatos ?? (nombre ? { nombre } : {}) },
  } as unknown as Session
}

export async function moduloSimulado(): Promise<typeof import('@menyu/auth-client')> {
  const real = await vi.importActual<typeof import('@menyu/auth-client')>('@menyu/auth-client')
  return {
    ...real,
    useSession: () => {
      if (cuentaDePrueba.cargando) return { tipo: 'cargando' }
      return cuentaDePrueba.session ? { tipo: 'con-sesion', session: cuentaDePrueba.session } : { tipo: 'sin-sesion' }
    },
    tokenDeAcceso: tokenDeAccesoSimulado,
    clienteAuth: clienteAuthSimulado as unknown as typeof real.clienteAuth,
  }
}
