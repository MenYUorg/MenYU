import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { urlDeIngreso } from '../../utils/cuenta'
import { irA } from '../../utils/navegar'
import { rutaInterna } from '../../utils/rutaInterna'

/**
 * `/auth` era el login y el registro de esta app, con el JWT propio. La Fase 5 de docs/auth/specs/auth.md lo retiró: la
 * única pantalla de ingreso de MenYU es web-auth. La ruta queda para que un link o un marcador viejo lleve igual a un
 * login que funciona, con la vuelta a la pantalla que pedía el `?volver=` (validado con `rutaInterna`, para que un link
 * armado a propósito no mande a otro sitio). `?tab=register` sigue llevando al registro.
 */
export function RedirigirAWebAuth() {
  const [params] = useSearchParams()

  useEffect(() => {
    const volver = rutaInterna(params.get('volver'))
    const accion = params.get('tab') === 'register' ? 'crear' : 'ingresar'
    irA(urlDeIngreso(accion, `${window.location.origin}${volver ?? '/'}`))
  }, [params])

  return null
}
