import type { Session } from '@supabase/supabase-js'
import { vi } from 'vitest'

/**
 * Simula `@menyu/auth-client` en todos los specs de web-cliente: lo monta src/test/setup.ts, así ningún test habla con
 * Supabase. Por defecto no hay sesión (la cuenta es opcional, Fase 4b); un test la abre con
 * `cuentaDePrueba.session = sesionDeSupabase({ nombre: 'Ana' })`, y cerrar sesión la borra.
 *
 * Los `vi.fn` se crean con su comportamiento, para que un `vi.resetAllMocks()` de un spec vuelva a él y no a undefined.
 *
 * `onAuthStateChange` cuelga de los mismos suscriptores que el setter de `cuentaDePrueba.session`, así que asignarle
 * una sesión o cerrarla llega a `useSesionDiferida` igual que un evento de Supabase, y vuelve a pintar lo montado.
 */
const suscriptores = new Set<() => void>()

function avisar(): void {
  for (const suscriptor of [...suscriptores]) suscriptor()
}

const estado: { session: Session | null; cargando: boolean } = { session: null, cargando: false }

/**
 * La cookie que `@supabase/ssr` deja en el navegador. `useSesionDiferida` la mira para no cargar supabase-js cuando no
 * hay nada que leer, así que simular una sesión tiene que dejarla puesta, como en la app de verdad.
 */
const COOKIE_DE_SESION = 'sb-proyecto-test-auth-token'

function escribirCookieDeSesion(hay: boolean): void {
  document.cookie = hay
    ? `${COOKIE_DE_SESION}=simulada; path=/`
    : `${COOKIE_DE_SESION}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`
}

export const cuentaDePrueba = {
  get session() {
    return estado.session
  },
  set session(valor: Session | null) {
    estado.session = valor
    escribirCookieDeSesion(valor !== null)
    avisar()
  },
  get cargando() {
    return estado.cargando
  },
  set cargando(valor: boolean) {
    estado.cargando = valor
    // Mientras "se lee la sesión" hay cookie: si no, la app no cargaría el paquete y nunca estaría cargando.
    if (valor) escribirCookieDeSesion(true)
    avisar()
  },
}

/**
 * Una cookie de sesión sin sesión detrás: lo que queda en el navegador cuando el token venció o es de otro proyecto.
 * Es el caso en que la app sí carga supabase-js y después se queda sin cuenta.
 */
export function cookieDeSesionRancia(): void {
  escribirCookieDeSesion(true)
}

export const signOutSimulado = vi.fn(async () => {
  cuentaDePrueba.session = null
  return { error: null }
})

export const tokenDeAccesoSimulado = vi.fn(async (): Promise<string | null> => cuentaDePrueba.session?.access_token ?? null)

/**
 * El `auth` del cliente de Supabase, con lo que usa `useSesionDiferida`: leer la sesión, escuchar los cambios y
 * cerrarla. `onAuthStateChange` se engancha a los mismos suscriptores, así que asignarle una sesión a
 * `cuentaDePrueba` llega al hook igual que un evento de Supabase.
 */
export const clienteAuthSimulado = vi.fn(() => ({
  auth: {
    getSession: async () => ({ data: { session: estado.session }, error: null }),
    onAuthStateChange: (alCambiar: (evento: string, session: Session | null) => void) => {
      const suscriptor = () => alCambiar('TOKEN_REFRESHED', estado.session)
      suscriptores.add(suscriptor)
      return { data: { subscription: { unsubscribe: () => suscriptores.delete(suscriptor) } } }
    },
    signOut: signOutSimulado,
  },
}))

export function reiniciarCuentaDePrueba(): void {
  estado.session = null
  estado.cargando = false
  escribirCookieDeSesion(false)
  suscriptores.clear()
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

/**
 * Igual que `alVolverALaPestana` del paquete: lo usa `useSesionDiferida` para releer la sesión cuando la pestaña
 * vuelve. Se reimplementa en vez de traer el real porque el módulo simulado no importa el paquete (ver abajo); que el
 * de verdad funcione lo prueban los tests de `packages/auth-client`.
 */
function alVolverALaPestanaSimulado(revisar: () => void): () => void {
  const siEstaVisible = () => {
    if (document.visibilityState === 'visible') revisar()
  }
  window.addEventListener('focus', siEstaVisible)
  document.addEventListener('visibilitychange', siEstaVisible)
  return () => {
    window.removeEventListener('focus', siEstaVisible)
    document.removeEventListener('visibilitychange', siEstaVisible)
  }
}

/**
 * El módulo que ve esta app en lugar de `@menyu/auth-client`. Trae **solo** lo que web-cliente usa, y a propósito no
 * llama a `vi.importActual`: eso cargaría el paquete de verdad, o sea supabase-js, y desde que la carga es diferida
 * (`utils/authClientDiferido.ts`) ese costo se paga dentro del primer test que lee la sesión. Medido en 408 ms en una
 * máquina de desarrollo, suficiente para que un `findBy` (1 s) se agote en el CI, que es más lento: así fallaban dos
 * tests de ClienteMenuPage que pasaban en local.
 */
export async function moduloSimulado(): Promise<Partial<typeof import('@menyu/auth-client')>> {
  return {
    tokenDeAcceso: tokenDeAccesoSimulado,
    clienteAuth: clienteAuthSimulado as unknown as typeof import('@menyu/auth-client')['clienteAuth'],
    alVolverALaPestana: alVolverALaPestanaSimulado,
  }
}
