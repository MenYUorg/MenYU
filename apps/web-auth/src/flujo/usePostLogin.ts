import { useCallback, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { obtenerPerfil } from '../lib/api'
import { decidirDestino, urlsDeApps } from '../lib/destinos'
import { ERROR_GENERICO } from '../lib/mensajes'
import { irA } from '../lib/navegar'
import { redirectValido } from '../lib/redirect'
import { supabase } from '../lib/supabase'
import { conRedirect } from './rutas'

export type EstadoIngreso =
  | { tipo: 'listo' }
  | { tipo: 'verificando' }
  /** El backend no respondió: la sesión sigue, se puede reintentar. */
  | { tipo: 'sin-verificar'; mensaje: string }
  /** El backend rechazó el token (401): ya se cerró la sesión. */
  | { tipo: 'sesion-vencida'; mensaje: string }

const SIN_VERIFICAR = 'No pudimos revisar a qué tenés acceso. Probá de nuevo en unos minutos.'
const SESION_VENCIDA = 'Tu sesión venció. Ingresá de nuevo.'

/**
 * Lo que pasa después de iniciar sesión (docs/auth/specs/auth.md, Fase 3): GET /auth/me y, según la respuesta, la
 * pantalla de sin acceso, el `redirect` si es válido, la app del rol o el selector. Sin sesión vuelve a `listo` y
 * `continuar()` devuelve false.
 */
export function usePostLogin(inicial: EstadoIngreso = { tipo: 'listo' }) {
  const [estado, setEstado] = useState<EstadoIngreso>(inicial)
  const navigate = useNavigate()
  const { search } = useLocation()

  const continuar = useCallback(async (): Promise<boolean> => {
    setEstado({ tipo: 'verificando' })
    try {
      const { data } = await supabase().auth.getSession()
      if (!data.session) {
        setEstado({ tipo: 'listo' })
        return false
      }

      const resultado = await obtenerPerfil(data.session.access_token)
      if (resultado.tipo === 'sin-acceso') {
        navigate(conRedirect('/sin-acceso', search), { replace: true })
        return true
      }
      if (resultado.tipo === 'sesion-invalida') {
        await supabase().auth.signOut({ scope: 'local' })
        setEstado({ tipo: 'sesion-vencida', mensaje: SESION_VENCIDA })
        return true
      }
      if (resultado.tipo === 'error') {
        setEstado({ tipo: 'sin-verificar', mensaje: SIN_VERIFICAR })
        return true
      }

      const redirect = redirectValido(new URLSearchParams(search).get('redirect'))
      const destino = decidirDestino(resultado.perfil, redirect, urlsDeApps())
      if (destino.tipo === 'ir') {
        irA(destino.url) // el estado queda en `verificando` hasta que el navegador cambia de página
      } else if (destino.tipo === 'elegir') {
        navigate('/elegir', { replace: true, state: { opciones: destino.opciones } })
      } else {
        navigate(conRedirect('/sin-acceso', search), { replace: true })
      }
    } catch (error) {
      console.error(error)
      setEstado({ tipo: 'sin-verificar', mensaje: ERROR_GENERICO })
    }
    return true
  }, [navigate, search])

  const cerrarSesion = useCallback(async () => {
    await supabase().auth.signOut({ scope: 'local' })
    setEstado({ tipo: 'listo' })
    navigate(conRedirect('/', search), { replace: true })
  }, [navigate, search])

  return { estado, continuar, cerrarSesion }
}
