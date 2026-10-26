import type { EstadoSesion } from '@menyu/auth-client'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { cargarAuthClient } from '../utils/authClientDiferido'
import { comparteLaSesionDeWebAuth, hayCookieDeSesion } from '../utils/cuenta'

/**
 * Como el `useSession` de `@menyu/auth-client`, pero sin traer supabase-js en la carga inicial: el paquete se importa
 * dentro del efecto (utils/authClientDiferido.ts). Arranca en `cargando`, así quien ya tiene cuenta no ve parpadear
 * "Ingresar".
 *
 * Donde la sesión es imposible —sin las variables de Supabase, o en un host fuera del dominio de la cookie, como los
 * dominios viejos de Vercel— pasa a `sin-sesion` sin cargar nada. Tampoco carga nada si no hay cookie de sesión: quien
 * entra sin cuenta, que es casi todo el que abre Discovery, ve la pantalla completa sin esperar ningún chunk.
 */
export function useSesionDiferida(): EstadoSesion {
  const [estado, setEstado] = useState<EstadoSesion>(() =>
    puedeHaberSesion() ? { tipo: 'cargando' } : { tipo: 'sin-sesion' },
  )

  useEffect(() => {
    if (!puedeHaberSesion()) return

    let montado = true
    let limpiar: (() => void) | undefined
    const aplicar = (session: Session | null) => {
      if (montado) setEstado(session ? { tipo: 'con-sesion', session } : { tipo: 'sin-sesion' })
    }

    void (async () => {
      let auth: SupabaseClient['auth']
      let alVolverALaPestana: typeof import('@menyu/auth-client')['alVolverALaPestana']
      try {
        const modulo = await cargarAuthClient()
        auth = modulo.clienteAuth().auth
        alVolverALaPestana = modulo.alVolverALaPestana
      } catch {
        // No se pudo cargar el paquete, o faltan las variables de Supabase: la app sigue andando sin cuentas.
        aplicar(null)
        return
      }
      if (!montado) return

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

      limpiar = () => {
        dejarDeEscuchar()
        subscription.unsubscribe()
      }
      // Si se desmontó mientras cargaba el paquete, el efecto ya corrió su limpieza: hay que deshacerlo acá.
      if (!montado) limpiar()
    })()

    return () => {
      montado = false
      limpiar?.()
    }
  }, [])

  return estado
}

/** Vale la pena cargar supabase-js: esta app comparte la sesión de web-auth y hay una cookie que leer. */
function puedeHaberSesion(): boolean {
  return comparteLaSesionDeWebAuth() && hayCookieDeSesion()
}
