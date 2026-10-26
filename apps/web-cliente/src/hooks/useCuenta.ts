import { useCallback } from 'react'
import { cerrarSesionDeLaCuenta, cuentaDeSesion, type Cuenta } from '../utils/cuenta'
import { useSesionDiferida } from './useSesionDiferida'

export interface EstadoCuenta {
  /** Todavía no se sabe si hay sesión de Supabase. */
  cargando: boolean
  cuenta: Cuenta | null
  /** Cierra la cuenta, en esta app y en las demás (la cookie es compartida). */
  cerrarSesion: () => Promise<void>
}

/**
 * La cuenta del cliente que inició sesión en este navegador, si hay (utils/cuenta.ts). La sesión se actualiza sola,
 * también con lo que pasa en otra app de MenYU al volver a la pestaña: de eso se encarga `useSesionDiferida`, que trae
 * supabase-js recién cuando hace falta.
 */
export function useCuenta(): EstadoCuenta {
  const sesion = useSesionDiferida()
  const cuenta = sesion.tipo === 'con-sesion' ? cuentaDeSesion(sesion.session) : null

  const cerrarSesion = useCallback(() => cerrarSesionDeLaCuenta(), [])

  return { cargando: sesion.tipo === 'cargando', cuenta, cerrarSesion }
}
