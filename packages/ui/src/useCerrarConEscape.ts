import { useEffect, useRef } from 'react'

/**
 * Cierra un modal con Escape: el equivalente de teclado a tocar el fondo. Lee siempre el último `cerrar`, así el
 * listener se pone una sola vez aunque el padre pase una función nueva en cada render.
 */
export function useCerrarConEscape(cerrar: () => void) {
  const ultimo = useRef(cerrar)
  ultimo.current = cerrar

  useEffect(() => {
    function alTeclear(e: KeyboardEvent) {
      if (e.key === 'Escape') ultimo.current()
    }
    document.addEventListener('keydown', alTeclear)
    return () => document.removeEventListener('keydown', alTeclear)
  }, [])
}
