import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { destinoDeIngreso, type AccionDeIngreso } from '../utils/cuenta'
import { irA } from '../utils/navegar'

/** "Ingresar" y "Registrarme": a web-auth o, donde esta app no comparte su sesión, al login de `/auth` (utils/cuenta.ts). */
export function useIrAlIngreso(): (accion: AccionDeIngreso) => void {
  const navigate = useNavigate()
  return useCallback(
    (accion: AccionDeIngreso) => {
      const destino = destinoDeIngreso(accion)
      if (destino.tipo === 'web-auth') irA(destino.url)
      else navigate(destino.ruta)
    },
    [navigate],
  )
}
