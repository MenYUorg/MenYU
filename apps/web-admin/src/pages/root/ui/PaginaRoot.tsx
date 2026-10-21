import type { ReactNode } from 'react'

/** El contenedor de cada pantalla de la consola: aplica los estilos (`.rc`) y el ancho y el aire de la página (`.page`). */
export function PaginaRoot({ children }: { children: ReactNode }) {
  return (
    <div className="rc">
      <div className="page">{children}</div>
    </div>
  )
}
