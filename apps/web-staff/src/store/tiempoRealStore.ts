import { create } from 'zustand'

interface TiempoRealStore {
  sinTiempoReal: boolean
  avisoOculto: boolean
  marcarSinTiempoReal: () => void
  ocultarAviso: () => void
  restablecer: () => void
}

export const useTiempoRealStore = create<TiempoRealStore>()((set) => ({
  sinTiempoReal: false,
  avisoOculto: false,
  marcarSinTiempoReal: () => set({ sinTiempoReal: true }),
  ocultarAviso: () => set({ avisoOculto: true }),
  restablecer: () => set({ sinTiempoReal: false, avisoOculto: false }),
}))
