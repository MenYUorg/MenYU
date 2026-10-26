import { isAuthApiError, type AuthError } from '@supabase/supabase-js'
import { useEffect, useRef } from 'react'
import { clienteAuth } from './cliente'

export const INTERVALO_DE_REVALIDACION_MS = 5 * 60 * 1000

/** Llama a `revisar` cuando la pestaña vuelve a estar visible o recupera el foco. Devuelve cómo dejar de escuchar. */
export function alVolverALaPestana(revisar: () => void): () => void {
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

export interface AccionesDeRevalidacion {
  /** Ya no hay sesión: se cerró en otra app o Supabase la rechazó. */
  alPerderla: () => void
  /** Hay sesión, pero de otro usuario: alguien inició sesión con otra cuenta en otra pestaña. */
  alCambiarDeUsuario: () => void
}

/**
 * `onAuthStateChange` no se entera de lo que pasa en otro subdominio: un logout en web-admin borra la cookie, pero
 * web-staff sigue con la sesión en memoria. Por eso se relee la cookie al volver a la pestaña y cada `intervaloMs`. En el
 * intervalo, además, se le pregunta a Supabase si la sesión sigue valiendo (`getUser`): así se detecta una cuenta borrada
 * o una sesión revocada. Sin red no se hace nada: se vuelve a revisar la próxima vez.
 */
export function useRevalidarSesion(
  supabaseUserId: string | null,
  acciones: AccionesDeRevalidacion,
  intervaloMs: number = INTERVALO_DE_REVALIDACION_MS,
): void {
  const accionesRef = useRef(acciones)
  useEffect(() => {
    accionesRef.current = acciones
  })

  useEffect(() => {
    if (!supabaseUserId) return
    const auth = clienteAuth().auth
    // Se avisa una sola vez: después de alPerderla la app ya se está yendo a web-auth.
    let vigente = true
    const terminar = (accion: keyof AccionesDeRevalidacion) => {
      if (!vigente) return
      vigente = false
      accionesRef.current[accion]()
    }

    const revisar = async (conSupabase: boolean) => {
      try {
        const { data } = await auth.getSession()
        if (!vigente) return
        if (!data.session) return terminar('alPerderla')
        if (data.session.user.id !== supabaseUserId) return terminar('alCambiarDeUsuario')
        if (!conSupabase) return

        const { error } = await auth.getUser()
        if (vigente && error && esRechazo(error)) {
          await auth.signOut({ scope: 'local' })
          terminar('alPerderla')
        }
      } catch {
        // Sin red o Supabase caído: la sesión puede seguir siendo válida.
      }
    }

    const dejarDeEscuchar = alVolverALaPestana(() => void revisar(false))
    const intervalo = window.setInterval(() => void revisar(true), intervaloMs)
    const {
      data: { subscription },
    } = auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_OUT') terminar('alPerderla')
    })

    return () => {
      vigente = false
      dejarDeEscuchar()
      window.clearInterval(intervalo)
      subscription.unsubscribe()
    }
  }, [supabaseUserId, intervaloMs])
}

/** Supabase dice que la sesión ya no vale (token inválido, sesión revocada o usuario borrado). */
function esRechazo(error: AuthError): boolean {
  return isAuthApiError(error) && [401, 403, 404].includes(error.status)
}
