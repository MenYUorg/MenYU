import { clienteAuth } from './cliente'
import { urlDeAuth } from './config'
import { irA } from './ir'

/** web-auth con el `redirect` de vuelta: después de iniciar sesión, web-auth manda ahí (si la URL es de MenYU). */
export function urlDeLogin(volverA: string = window.location.href): string {
  const url = new URL(`${urlDeAuth()}/`)
  url.searchParams.set('redirect', volverA)
  return url.toString()
}

/** Sin sesión: a web-auth, para volver a esta misma pantalla. */
export function irAlLogin(volverA?: string): void {
  irA(urlDeLogin(volverA))
}

/** Con sesión pero sin `Usuario` (o inactivo): la pantalla "Tu cuenta no tiene acceso" de web-auth. */
export function irASinAcceso(): void {
  irA(`${urlDeAuth()}/sin-acceso`)
}

/**
 * Con sesión pero sin acceso a esta app: a web-auth SIN `redirect`, que lo manda a la app de su rol o al selector. Con
 * el `redirect` de esta app, web-auth lo devolvería acá y no terminaría nunca (docs/auth/specs/auth.md, Para la Fase 4).
 */
export function irASuApp(): void {
  irA(`${urlDeAuth()}/`)
}

/**
 * Cierra la sesión en todas las apps (la cookie es de dominio compartido) y vuelve a web-auth. `scope: 'local'` cierra
 * solo esta sesión, no las de otros dispositivos. Las otras pestañas se enteran al recuperar el foco (useRevalidarSesion).
 */
export async function logout(): Promise<void> {
  try {
    await clienteAuth().auth.signOut({ scope: 'local' })
  } finally {
    // supabase-js borra la sesión local aunque falle la llamada a Supabase: se sale igual.
    irA(`${urlDeAuth()}/`)
  }
}
