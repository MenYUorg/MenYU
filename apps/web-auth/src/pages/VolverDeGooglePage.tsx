import { clienteAuth } from '@menyu/auth-client'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Aviso } from '../components/Aviso'
import { Cargando } from '../components/Cargando'
import { Encabezado } from '../components/Encabezado'
import { Enlace } from '../components/Enlace'
import { Marco } from '../components/Marco'
import { conRedirect } from '../flujo/rutas'
import { errorDeOAuth, GOOGLE_SIN_TERMINAR, mensajeDeError } from '../lib/mensajes'

/**
 * `/google`: la vuelta del ingreso con Google (src/flujo/useIngresoConGoogle.ts). El cliente de Supabase canjea el
 * `?code=` solo, al inicializarse, e `initialize()` devuelve cómo salió. El error de OAuth se lee de la URL porque
 * supabase-js lo ignora cuando falta `error_description` (al cancelar en Google, por ejemplo). Si salió bien, sigue a
 * `/`, que con la sesión abierta hace el post-login de siempre.
 */
export function VolverDeGooglePage() {
  const { search } = useLocation()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  const revisada = useRef(false)
  useEffect(() => {
    if (revisada.current) return
    revisada.current = true

    async function revisar() {
      const enLaUrl = errorDeOAuth(search)
      if (enLaUrl) {
        setError(enLaUrl)
        return
      }
      const { error: errorDelCanje } = await clienteAuth().auth.initialize()
      if (errorDelCanje) {
        setError(mensajeDeError(errorDelCanje))
        return
      }
      // Sin el verificador PKCE (se empezó en otro navegador) supabase-js ni intenta el canje: no hay error ni sesión.
      const { data } = await clienteAuth().auth.getSession()
      if (!data.session) {
        setError(GOOGLE_SIN_TERMINAR)
        return
      }
      navigate(conRedirect('/', search), { replace: true })
    }

    revisar().catch((e: unknown) => setError(mensajeDeError(e)))
  }, [search, navigate])

  if (!error) {
    return (
      <Marco titulo="Ingresar">
        <Cargando texto="Entrando…" />
      </Marco>
    )
  }

  return (
    <Marco titulo="Ingresar">
      <Encabezado titulo="No entraste con Google" />
      <Aviso tipo="error">{error}</Aviso>
      <p className="mt-6 text-sm">
        <Enlace to={conRedirect('/', search)} replace>
          Volver a ingresar
        </Enlace>
      </p>
    </Marco>
  )
}
