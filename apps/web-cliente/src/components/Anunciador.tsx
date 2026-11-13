import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAnunciadorStore } from '../utils/anunciador'

/** Cuánto queda el mensaje en la región antes de vaciarla (el lector lo lee en uno o dos segundos). */
export const MS_DE_UN_ANUNCIO = 6000

/**
 * La región viva que lee `anunciar()` (utils/anunciador.ts). Se monta una vez, desde App.tsx, y se pinta directo en el
 * `<body>`: así queda fuera de cualquier contenedor que una pantalla vuelva `inert` mientras tiene un diálogo abierto
 * (el menú lateral, el asistente) y los anuncios no se pierden.
 */
export function Anunciador() {
  const mensaje = useAnunciadorStore((s) => s.mensaje)
  const numero = useAnunciadorStore((s) => s.numero)

  useEffect(() => {
    if (!mensaje) return
    const temporizador = setTimeout(() => useAnunciadorStore.getState().limpiar(), MS_DE_UN_ANUNCIO)
    return () => clearTimeout(temporizador)
  }, [mensaje, numero])

  return createPortal(
    // `aria-atomic`: se lee el mensaje entero, no solo la parte que cambió.
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      <span key={numero}>{mensaje}</span>
    </div>,
    document.body,
  )
}
