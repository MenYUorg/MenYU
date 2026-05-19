import { create } from 'zustand'
import { api } from '../services/api'

interface SessionStore {
  sesionId: string | null
  restauranteId: string | null
  loading: boolean
  error: string | null
  openSession: (data: { restauranteId?: string; pin?: string; qrToken?: string }) => Promise<void>
  setRestauranteId: (id: string) => void
  clear: () => void
}

const SESION_KEY = 'menyu_sesion_id'
const RESTAURANTE_KEY = 'menyu_restaurante_id'

export const useSessionStore = create<SessionStore>()((set) => ({
  sesionId: sessionStorage.getItem(SESION_KEY),
  restauranteId: sessionStorage.getItem(RESTAURANTE_KEY),
  loading: false,
  error: null,

  openSession: async (data) => {
    set({ loading: true, error: null })
    try {
      const result = await api.sessions.open(data)
      sessionStorage.setItem(SESION_KEY, result.sesionId)
      if (data.restauranteId) sessionStorage.setItem(RESTAURANTE_KEY, data.restauranteId)
      set({ sesionId: result.sesionId, restauranteId: data.restauranteId ?? null })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Error al abrir la sesión' })
    } finally {
      set({ loading: false })
    }
  },

  setRestauranteId: (id) => {
    sessionStorage.setItem(RESTAURANTE_KEY, id)
    set({ restauranteId: id })
  },

  clear: () => {
    sessionStorage.removeItem(SESION_KEY)
    sessionStorage.removeItem(RESTAURANTE_KEY)
    set({ sesionId: null, restauranteId: null })
  },
}))
