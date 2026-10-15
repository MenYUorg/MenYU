import { useEffect, useState } from 'react'

function matchMediaDisponible(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
}

/** Indica si la media query se cumple y se actualiza cuando el tamaño de la pantalla cambia. */
export function useMediaQuery(query: string): boolean {
  const [coincide, setCoincide] = useState<boolean>(
    () => matchMediaDisponible() && window.matchMedia(query).matches,
  )

  useEffect(() => {
    if (!matchMediaDisponible()) return
    const mql = window.matchMedia(query)
    const actualizar = () => setCoincide(mql.matches)
    actualizar()
    mql.addEventListener('change', actualizar)
    return () => mql.removeEventListener('change', actualizar)
  }, [query])

  return coincide
}
