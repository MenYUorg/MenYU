import { create } from 'zustand'

export interface Llamado {
  sesionId: string
  mesaNumero: string
  recibitoEn: Date
  atendido: boolean
}

interface MozoStore {
  restauranteId: string | null
  llamados: Llamado[]
  setRestauranteId: (id: string) => void
  addLlamado: (data: { sesionId: string; mesaNumero: string }) => void
  marcarAtendido: (sesionId: string) => void
}

export const useMozoStore = create<MozoStore>()((set) => ({
  restauranteId: null,
  llamados: [],
  setRestauranteId: (id) => set({ restauranteId: id }),
  addLlamado: (data) =>
    set((s) => ({
      llamados: [
        ...s.llamados.filter((l) => l.sesionId !== data.sesionId),
        { ...data, recibitoEn: new Date(), atendido: false },
      ],
    })),
  marcarAtendido: (sesionId) =>
    set((s) => ({
      llamados: s.llamados.map((l) => (l.sesionId === sesionId ? { ...l, atendido: true } : l)),
    })),
}))
