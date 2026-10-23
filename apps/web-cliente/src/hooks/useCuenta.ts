import { useSession } from '@menyu/auth-client'
import { useCallback, useReducer } from 'react'
import { cerrarSesionDeLaCuenta, cuentaDelLoginAnterior, cuentaDeSesion, type Cuenta } from '../utils/cuenta'

export interface EstadoCuenta {
  /** Todavía no se sabe si hay sesión de Supabase (y no hay una cuenta del login anterior que mostrar). */
  cargando: boolean
  cuenta: Cuenta | null
  /** Cierra la cuenta (las dos, si hay) y vuelve a pintar. */
  cerrarSesion: () => Promise<void>
}

/**
 * La cuenta del cliente que inició sesión en este navegador, si hay (utils/cuenta.ts). La sesión de Supabase se actualiza
 * sola, también con lo que pasa en otra app de MenYU al volver a la pestaña; la del login anterior se relee en cada
 * render.
 */
export function useCuenta(): EstadoCuenta {
  const sesion = useSession()
  const [, repintar] = useReducer((n: number) => n + 1, 0)
  const cuenta = sesion.tipo === 'con-sesion' ? cuentaDeSesion(sesion.session) : cuentaDelLoginAnterior()

  const cerrarSesion = useCallback(async () => {
    await cerrarSesionDeLaCuenta()
    repintar()
  }, [])

  return { cargando: !cuenta && sesion.tipo === 'cargando', cuenta, cerrarSesion }
}
