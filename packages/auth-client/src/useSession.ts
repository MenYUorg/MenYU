import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { clienteAuth } from './cliente'
import { alVolverALaPestana } from './revalidacion'

export type EstadoSesion = { tipo: 'cargando' } | { tipo: 'sin-sesion' } | { tipo: 'con-sesion'; session: Session }

/**
 * La sesión de Supabase, sin exigirla: para las apps donde es opcional (web-cliente, Fase 4b). Se actualiza con los
 * cambios de esta app y al volver a la pestaña, para ver lo que pasó en otra app de MenYU. Si el deploy no tiene las
 * variables de Supabase, no hay sesión: la app sigue andando sin cuentas en vez de romperse.
 */
export function useSession(): EstadoSesion {
  const [estado, setEstado] = useState<EstadoSesion>({ tipo: 'cargando' })

  useEffect(() => {
    let auth: SupabaseClient['auth']
    try {
      auth = clienteAuth().auth
    } catch {
      setEstado({ tipo: 'sin-sesion' })
      return
    }
    let montado = true
    const aplicar = (session: Session | null) => {
      if (montado) setEstado(session ? { tipo: 'con-sesion', session } : { tipo: 'sin-sesion' })
    }
    const leer = () => {
      auth.getSession().then(
        ({ data }) => aplicar(data.session),
        () => aplicar(null),
      )
    }

    leer()
    const dejarDeEscuchar = alVolverALaPestana(leer)
    const {
      data: { subscription },
    } = auth.onAuthStateChange((_evento, session) => aplicar(session))

    return () => {
      montado = false
      dejarDeEscuchar()
      subscription.unsubscribe()
    }
  }, [])

  return estado
}
