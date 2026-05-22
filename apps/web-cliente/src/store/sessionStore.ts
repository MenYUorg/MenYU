import { create } from 'zustand'
import { api } from '../services/api'

interface SessionStore {
  sesionId: string | null
  mesaId: string | null
  restauranteId: string | null
  jwt: string | null
  loading: boolean
  error: string | null
  openSession: (data: { restauranteId?: string; pin?: string; qrToken?: string }) => Promise<void>
  setRestauranteId: (id: string) => void
  clear: () => void
}

const SESION_KEY     = 'menyu_sesion_id'
const MESA_KEY       = 'menyu_mesa_id'
const RESTAURANTE_KEY = 'menyu_restaurante_id'
const JWT_KEY        = 'menyu_sesion_jwt'

export const useSessionStore = create<SessionStore>()((set) => ({
  sesionId:     sessionStorage.getItem(SESION_KEY),
  mesaId:       sessionStorage.getItem(MESA_KEY),
  restauranteId: sessionStorage.getItem(RESTAURANTE_KEY),
  jwt:          sessionStorage.getItem(JWT_KEY),
  loading: false,
  error: null,

  openSession: async (data) => {
    set({ loading: true, error: null })
    try {
      const result = await api.sessions.open(data)
      sessionStorage.setItem(SESION_KEY, result.sesionId)
      sessionStorage.setItem(MESA_KEY, result.mesaId)
      sessionStorage.setItem(JWT_KEY, result.jwt)
      if (result.restauranteId) sessionStorage.setItem(RESTAURANTE_KEY, result.restauranteId)
      set({
        sesionId: result.sesionId,
        mesaId: result.mesaId,
        restauranteId: result.restauranteId ?? null,
        jwt: result.jwt,
      })
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
    sessionStorage.removeItem(MESA_KEY)
    sessionStorage.removeItem(RESTAURANTE_KEY)
    sessionStorage.removeItem(JWT_KEY)
    set({ sesionId: null, mesaId: null, restauranteId: null, jwt: null })
  },
}))
