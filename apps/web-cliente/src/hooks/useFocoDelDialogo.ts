import { useEffect, type RefObject } from 'react'

/**
 * El foco de un diálogo: al abrirse pasa al elemento que se indica (el propio diálogo o su título, con `tabIndex={-1}`) y,
 * al cerrarse (o desmontarse), vuelve a lo que lo tenía antes, que suele ser el botón que lo abrió. Con el foco adentro, el
 * lector de pantalla anuncia el diálogo con su nombre. El resto de la pantalla queda inerte (`inert`) y Esc lo cierra
 * (`useCerrarConEscape` de `@menyu/ui`): eso lo hace quien usa el diálogo.
 *
 * Sirve para un diálogo que está siempre montado (`abierto` cambia) y para uno que se monta recién al abrirse (`abierto`
 * es `true` desde el primer render).
 */
export function useFocoDelDialogo(abierto: boolean, elemento: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!abierto) return
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null
    elemento.current?.focus()
    return () => { anterior?.focus() }
  }, [abierto, elemento])
}
