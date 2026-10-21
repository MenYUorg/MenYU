import { useAuth } from '@menyu/auth'

/**
 * La sesión de ROOT, vista desde la consola. Es el ÚNICO lugar de `/root` que sabe de dónde sale: hoy del login actual
 * (`@menyu/auth`, token propio); cuando web-admin pase a Supabase Auth (Fase 4 de docs/auth/specs/auth.md) se cambia acá por
 * `useSession` de `@menyu/auth-client` y `esRoot` sale de `GET /auth/me`. Ninguna pantalla ni diálogo toca `useAuth`.
 */
export function useRootSession() {
  const { user, logout } = useAuth()
  return {
    email: user?.email,
    esRoot: user?.rol === 'ROOT',
    cerrarSesion: logout,
  }
}
