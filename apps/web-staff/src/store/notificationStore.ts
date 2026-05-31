import { create } from 'zustand'

export type NotifTipo = 'llamado' | 'cuenta' | 'pedido_nuevo' | 'pedido_listo'

export interface Notif {
  id: string
  tipo: NotifTipo
  titulo: string
  subtitulo: string
  creadoEn: number
}

interface NotifStore {
  notifications: Notif[]
  add: (notif: Omit<Notif, 'id' | 'creadoEn'>) => void
  remove: (id: string) => void
}

export const useNotifStore = create<NotifStore>()((set) => ({
  notifications: [],

  add: (notif) =>
    set((s) => ({
      notifications: [
        { ...notif, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, creadoEn: Date.now() },
        ...s.notifications,
      ].slice(0, 5),  // máximo 5 toasts apilados
    })),

  remove: (id) =>
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),
}))
