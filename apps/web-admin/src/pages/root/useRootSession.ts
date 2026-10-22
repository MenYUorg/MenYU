import { logout, usePerfil } from '@menyu/auth-client'

/**
 * La sesión de ROOT, vista desde la consola. Es el ÚNICO lugar de `/root` que sabe de dónde sale: desde la entrega 4.5
 * de docs/auth/specs/auth.md, del perfil de Supabase (`GET /auth/me`, con `esRoot`). Ninguna pantalla ni diálogo de la
 * consola habla con `@menyu/auth-client`.
 */
export function useRootSession() {
  const perfil = usePerfil()
  return {
    email: perfil.email,
    esRoot: perfil.esRoot,
    cerrarSesion: () => { void logout() },
  }
}
