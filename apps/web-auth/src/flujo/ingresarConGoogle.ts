import type { AuthError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { conRedirect } from './rutas'

/**
 * Sale a Google y vuelve a `/google` (VolverDeGooglePage) con el `redirect` de la pantalla actual. Si sale bien, el
 * navegador ya se está yendo; si no, devuelve el error. `/google` tiene que estar en las Redirect URLs de Supabase: si
 * no, Supabase vuelve a la Site URL y el `redirect` se pierde (docs/auth/VariablesACambiar.md, Fase 3b).
 *
 * `prompt: 'select_account'` porque cerrar sesión en MenYU no cierra la de Google: sin el selector, quien entró con la
 * cuenta equivocada vuelve a entrar con la misma.
 */
export async function ingresarConGoogle(search: string): Promise<AuthError | null> {
  const { error } = await supabase().auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}${conRedirect('/google', search)}`,
      queryParams: { prompt: 'select_account' },
    },
  })
  return error
}
