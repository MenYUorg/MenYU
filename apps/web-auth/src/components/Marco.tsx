import { useEffect, type ReactNode } from 'react'

interface MarcoProps {
  /** Para la pestaña del navegador. */
  titulo: string
  children: ReactNode
}

/**
 * El marco de todas las pantallas. En escritorio, a la izquierda, la U del logo en grande (con el tenedor blanco de la
 * variante para fondo oscuro) sobre el azul del tenedor, asomando desde abajo. En el celular solo queda el wordmark.
 */
export function Marco({ titulo, children }: MarcoProps) {
  useEffect(() => {
    document.title = `${titulo} | MenYU`
  }, [titulo])

  return (
    <div className="min-h-dvh bg-white font-texto text-menyu-navy md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div aria-hidden="true" className="relative hidden overflow-hidden bg-menyu-navy md:block">
        <img
          src="/menyu-u.png"
          alt=""
          width={562}
          height={640}
          className="absolute bottom-0 left-1/2 h-auto w-[74%] max-w-[34rem] -translate-x-1/2 translate-y-[20%] select-none"
        />
      </div>

      <main className="flex min-h-dvh flex-col px-6 pb-10 pt-8 sm:px-12 md:px-16 lg:px-24">
        <img src="/menyu.png" alt="MenYU" width={1200} height={239} className="h-6 w-auto self-start sm:h-7" />
        <div className="flex flex-1 items-center">
          <div className="w-full max-w-[25rem] py-12">{children}</div>
        </div>
      </main>
    </div>
  )
}
