import { clienteAuth, obtenerPerfil } from '@menyu/auth-client'
import { useCallback, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { decidirDestino, urlsDeApps, vaAWebCliente } from '../lib/destinos'
import { ERROR_GENERICO } from '../lib/mensajes'
import { irA } from '../lib/navegar'
import { redirectValido } from '../lib/redirect'
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
 * Lo que pasa después de iniciar sesión (docs/auth/specs/auth.md, Fases 3 y 4b): GET /auth/me y, según la respuesta,
 * la pantalla de sin acceso, el `redirect` si es válido, la app del rol o el selector. Sin sesión vuelve a `listo` y
 * `continuar()` devuelve false.
 */
export function usePostLogin(inicial: EstadoIngreso = { tipo: 'listo' }) {
  const [estado, setEstado] = useState<EstadoIngreso>(inicial)
  const navigate = useNavigate()
  const { search } = useLocation()

  const continuar = useCallback(async (): Promise<boolean> => {
    setEstado({ tipo: 'verificando' })
    try {
      const { data } = await clienteAuth().auth.getSession()
      if (!data.session) {
        setEstado({ tipo: 'listo' })
        return false
      }

      const redirect = redirectValido(new URLSearchParams(search).get('redirect'))
      const resultado = await obtenerPerfil(data.session.access_token)
      if (resultado.tipo === 'sin-acceso') {
        // Sin `Usuario`: la cuenta de un cliente o la de alguien a quien todavía no invitaron, que para Supabase son
        // lo mismo. Lo que las separa es de dónde vino: si el redirect es de web-cliente (o se registró como cliente,
        // que siempre lo trae), vuelve ahí, que no pide cuenta. admin y staff siguen preguntando /auth/me.
        if (vaAWebCliente(redirect)) irA(redirect)
        else navigate(conRedirect('/sin-acceso', search), { replace: true })
        return true
      }
      if (resultado.tipo === 'sesion-invalida') {
        await clienteAuth().auth.signOut({ scope: 'local' })
        setEstado({ tipo: 'sesion-vencida', mensaje: SESION_VENCIDA })
        return true
      }
      if (resultado.tipo === 'error') {
        setEstado({ tipo: 'sin-verificar', mensaje: SIN_VERIFICAR })
        return true
      }

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
    await clienteAuth().auth.signOut({ scope: 'local' })
    setEstado({ tipo: 'listo' })
    navigate(conRedirect('/', search), { replace: true })
  }, [navigate, search])

  return { estado, continuar, cerrarSesion }
}
