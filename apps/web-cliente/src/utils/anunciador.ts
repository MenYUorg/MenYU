import { create } from 'zustand'

/**
 * El anunciador global: una sola región viva (`<Anunciador />`, montada en App.tsx desde el arranque) a la que cualquier
 * pantalla le manda mensajes con `anunciar('…')`. Los lectores de pantalla no leen una región que se inserta junto con el
 * mensaje, por eso la región existe desde antes y solo cambia su texto. Para errores siguen los `role="alert"` de cada
 * pantalla; esto es para lo que pasa sin que el foco se mueva ("Cheddar: 1", "Hamburguesa doble agregada al carrito").
 */
interface AnunciadorStore {
  mensaje: string
  /**
   * Cuenta los mensajes. Sirve de `key` del texto: así dos mensajes iguales seguidos ("Cheddar: 1" dos veces) vuelven a
   * leerse, porque el lector solo anuncia lo que se agrega a la región, no el texto que queda igual.
   */
  numero: number
  anunciar: (mensaje: string) => void
  /** Vacía la región (cuando pasó el tiempo de leerla): un texto viejo no tiene que quedar a la vista al recorrer la página. */
  limpiar: () => void
}

export const useAnunciadorStore = create<AnunciadorStore>()((set) => ({
  mensaje: '',
  numero: 0,
  anunciar: (mensaje) => set((s) => ({ mensaje, numero: s.numero + 1 })),
  limpiar: () => set({ mensaje: '' }),
}))

/** Anuncia un mensaje corto, sin repetir lo que ya dice la pantalla. Un mensaje vacío no hace nada. */
export function anunciar(mensaje: string): void {
  const texto = mensaje.trim()
  if (texto) useAnunciadorStore.getState().anunciar(texto)
}
