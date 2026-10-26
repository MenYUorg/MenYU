import { useCallback } from 'react'
import { urlDeIngreso, type AccionDeIngreso } from '../utils/cuenta'
import { irA } from '../utils/navegar'

/** "Ingresar" y "Registrarme" van a web-auth, la única pantalla de ingreso de MenYU, con la vuelta a esta pantalla. */
export function useIrAlIngreso(): (accion: AccionDeIngreso) => void {
  return useCallback((accion: AccionDeIngreso) => {
    irA(urlDeIngreso(accion))
  }, [])
}
