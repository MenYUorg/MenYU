import type { ReactNode } from 'react'

/** El título de cada pantalla y, debajo, una línea que explica qué hacer. */
export function Encabezado({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <header className="mb-8">
      <h1 className="font-titulo text-[2rem] font-extrabold leading-[1.1] tracking-[-0.01em]">{titulo}</h1>
      {children && <p className="mt-3 text-base leading-relaxed text-menyu-gris">{children}</p>}
    </header>
  )
}
