import { create } from 'zustand'

export interface LlamadoMesa {
  sesionId: string
  mesaNumero: string
  recibitoEn: Date
  atendido: boolean
}

interface MozoStore {
  restauranteId: string | null
  llamados: LlamadoMesa[]
  notifPermiso: NotificationPermission | 'indeterminate'
  setRestauranteId: (id: string) => void
  addLlamado: (data: { sesionId: string; mesaNumero: string }) => void
  marcarAtendido: (sesionId: string) => void
  setNotifPermiso: (p: NotificationPermission) => void
}

export const useMozoStore = create<MozoStore>((set) => ({
  restauranteId: null,
  llamados: [],
  notifPermiso: 'indeterminate',

  setRestauranteId: (id) => set({ restauranteId: id }),

  addLlamado: (data) =>
    set((s) => ({
      llamados: [
        { ...data, recibitoEn: new Date(), atendido: false },
        ...s.llamados,
      ],
    })),

  marcarAtendido: (sesionId) =>
    set((s) => ({
      llamados: s.llamados.map((l) =>
        l.sesionId === sesionId ? { ...l, atendido: true } : l,
      ),
    })),

  setNotifPermiso: (p) => set({ notifPermiso: p }),
}))
