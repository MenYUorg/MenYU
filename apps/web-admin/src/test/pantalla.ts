type Escuchador = () => void

function cumple(query: string, ancho: number): boolean {
  const min = /\(min-width:\s*(\d+)px\)/.exec(query)
  const max = /\(max-width:\s*(\d+)px\)/.exec(query)
  if (min && ancho < Number(min[1])) return false
  if (max && ancho > Number(max[1])) return false
  return true
}

/**
 * Simula window.matchMedia (jsdom no lo trae) con un ancho de pantalla controlable.
 * Soporta consultas (min-width: Npx) y (max-width: Npx).
 */
export function simularPantalla(anchoInicial: number) {
  let ancho = anchoInicial
  const escuchadores = new Map<string, Set<Escuchador>>()

  window.matchMedia = ((query: string) => {
    const lista = escuchadores.get(query) ?? new Set<Escuchador>()
    escuchadores.set(query, lista)
    return {
      get matches() {
        return cumple(query, ancho)
      },
      media: query,
      onchange: null,
      addEventListener: (_tipo: string, fn: Escuchador) => lista.add(fn),
      removeEventListener: (_tipo: string, fn: Escuchador) => lista.delete(fn),
      addListener: (fn: Escuchador) => lista.add(fn),
      removeListener: (fn: Escuchador) => lista.delete(fn),
      dispatchEvent: () => false,
    } as unknown as MediaQueryList
  }) as typeof window.matchMedia

  return {
    /** Cambia el ancho y avisa a quienes escuchan. Hay que envolverlo en act(). */
    cambiarAncho(nuevo: number) {
      ancho = nuevo
      escuchadores.forEach((lista) => lista.forEach((fn) => fn()))
    },
    escuchadoresActivos(): number {
      let total = 0
      escuchadores.forEach((lista) => {
        total += lista.size
      })
      return total
    },
  }
}

/** Quita el matchMedia simulado para que el siguiente test parta limpio. */
export function restaurarPantalla() {
  Reflect.deleteProperty(window, 'matchMedia')
}
