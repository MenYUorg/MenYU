import { useCallback, useEffect, useState } from 'react'
import { mensajeDeError } from '../lib/mensajes'
import { supabase } from '../lib/supabase'
import { conRedirect } from './rutas'

/**
 * El botón "Continuar con Google" de `/` y `/invitacion`. `irAGoogle()` sale a Google y vuelve a `/google`
 * (VolverDeGooglePage) con el `redirect` de la pantalla actual; si no pudo salir, devuelve el mensaje de error.
 * `yendoAGoogle` queda en true mientras el navegador se va, y vuelve a false si la página regresa desde la bfcache
 * (atrás en la pantalla de Google), para que los botones no queden deshabilitados.
 *
 * `prompt: 'select_account'` porque cerrar sesión en MenYU no cierra la de Google: sin el selector, quien entró con la
 * cuenta equivocada vuelve a entrar con la misma. La vuelta a `/google` no necesita Redirect URL en staging ni en
 * producción (es el host de la Site URL); en local sí (docs/auth/VariablesACambiar.md, sección 6).
 */
export function useIngresoConGoogle(search: string) {
  const [yendoAGoogle, setYendoAGoogle] = useState(false)

  useEffect(() => {
    const alMostrar = (evento: PageTransitionEvent) => {
      if (evento.persisted) setYendoAGoogle(false)
    }
    window.addEventListener('pageshow', alMostrar)
    return () => window.removeEventListener('pageshow', alMostrar)
  }, [])

  const irAGoogle = useCallback(async (): Promise<string | null> => {
    setYendoAGoogle(true)
    try {
      // supabase-js 2.105 no devuelve error acá: falla con una excepción (por ejemplo, si no puede guardar el
      // verificador PKCE). El `error` se mira igual por si cambia.
      const { error } = await supabase().auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}${conRedirect('/google', search)}`,
          queryParams: { prompt: 'select_account' },
        },
      })
      if (!error) return null // el navegador ya se está yendo a Google
      setYendoAGoogle(false)
      return mensajeDeError(error)
    } catch (e) {
      setYendoAGoogle(false)
      return mensajeDeError(e)
    }
  }, [search])

  return { yendoAGoogle, irAGoogle }
}
