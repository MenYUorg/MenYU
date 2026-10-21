import type { PerfilUsuario } from '@menyu/types'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { clienteAuth } from './cliente'
import { recargar } from './ir'
import { irAlLogin, irASinAcceso, irASuApp } from './navegacion'
import { obtenerPerfil } from './perfil'
import { useRevalidarSesion } from './revalidacion'

const PerfilContext = createContext<PerfilUsuario | null>(null)

/** El perfil de `GET /auth/me` del usuario con sesión. Solo dentro de `RequireAuth`. */
export function usePerfil(): PerfilUsuario {
  const perfil = useContext(PerfilContext)
  if (!perfil) throw new Error('usePerfil() se usa dentro de <RequireAuth>')
  return perfil
}

type Estado =
  | { tipo: 'verificando' }
  | { tipo: 'error' }
  | { tipo: 'listo'; perfil: PerfilUsuario; supabaseUserId: string }

export interface RequireAuthProps {
  /** Si el perfil puede usar esta app. Lo normal: `(perfil) => tieneAcceso(perfil, 'admin')`. */
  puedeEntrar: (perfil: PerfilUsuario) => boolean
  children: ReactNode
  /** Mientras se verifica la sesión, o mientras el navegador se va a web-auth. */
  cargando?: ReactNode
  /** El backend no respondió: la sesión puede ser válida, así que se ofrece reintentar en vez de mandar al login. */
  error?: (reintentar: () => void) => ReactNode
}

function ErrorPorDefecto({ reintentar }: { reintentar: () => void }) {
  return (
    <div role="alert">
      <p>No pudimos revisar a qué tenés acceso. Probá de nuevo en unos minutos.</p>
      <button type="button" onClick={reintentar}>
        Reintentar
      </button>
    </div>
  )
}

/**
 * Exige sesión de Supabase y acceso a esta app (docs/auth/specs/auth.md, Fase 4):
 * - Sin sesión → web-auth, con el `redirect` de vuelta a esta pantalla.
 * - Token rechazado por el backend (401) → se cierra la sesión local y web-auth.
 * - Sesión sin `Usuario` en MenYU (403) → "Tu cuenta no tiene acceso" de web-auth.
 * - Con acceso a MenYU pero no a esta app → web-auth sin `redirect`, que lo manda a la suya.
 *
 * El rol nunca se decide acá: el backend lo vuelve a resolver en cada pedido. Esto solo elige qué pantalla mostrar.
 */
export function RequireAuth({ puedeEntrar, children, cargando = null, error }: RequireAuthProps) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'verificando' })
  const puedeEntrarRef = useRef(puedeEntrar)
  useEffect(() => {
    puedeEntrarRef.current = puedeEntrar
  })
  const montado = useRef(true)
  useEffect(() => {
    montado.current = true
    return () => {
      montado.current = false
    }
  }, [])

  const verificar = useCallback(async () => {
    setEstado({ tipo: 'verificando' })
    try {
      const { data } = await clienteAuth().auth.getSession()
      if (!data.session) return irAlLogin()

      const resultado = await obtenerPerfil(data.session.access_token)
      if (resultado.tipo === 'sesion-invalida') {
        await clienteAuth().auth.signOut({ scope: 'local' })
        return irAlLogin()
      }
      if (resultado.tipo === 'sin-acceso') return irASinAcceso()
      if (resultado.tipo === 'error') {
        if (montado.current) setEstado({ tipo: 'error' })
        return
      }
      if (!puedeEntrarRef.current(resultado.perfil)) return irASuApp()
      if (montado.current) {
        setEstado({ tipo: 'listo', perfil: resultado.perfil, supabaseUserId: data.session.user.id })
      }
    } catch {
      if (montado.current) setEstado({ tipo: 'error' })
    }
  }, [])

  useEffect(() => {
    void verificar()
  }, [verificar])

  useRevalidarSesion(estado.tipo === 'listo' ? estado.supabaseUserId : null, {
    alPerderla: () => irAlLogin(),
    alCambiarDeUsuario: recargar,
  })

  if (estado.tipo === 'listo') {
    return <PerfilContext.Provider value={estado.perfil}>{children}</PerfilContext.Provider>
  }
  if (estado.tipo === 'error') {
    const reintentar = () => void verificar()
    return <>{error ? error(reintentar) : <ErrorPorDefecto reintentar={reintentar} />}</>
  }
  return <>{cargando}</>
}
