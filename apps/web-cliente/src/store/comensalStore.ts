import { create } from 'zustand'
import { api } from '../services/api'

interface ComensalStore {
  comensalId: string | null
  nombre: string | null
  error: string | null
  hidratar: () => void
  crearComensal: (sesionId: string, nombre: string, esOwner: boolean) => Promise<void>
  reset: () => void
}

const COMENSAL_ID_KEY = 'menyu_comensal_id'
const COMENSAL_NOMBRE_KEY = 'menyu_comensal_nombre'

export const useComensalStore = create<ComensalStore>()((set) => ({
  comensalId: sessionStorage.getItem(COMENSAL_ID_KEY),
  nombre: sessionStorage.getItem(COMENSAL_NOMBRE_KEY),
  error: null,

  hidratar: () => {
    set({
      comensalId: sessionStorage.getItem(COMENSAL_ID_KEY),
      nombre: sessionStorage.getItem(COMENSAL_NOMBRE_KEY),
    })
  },

  crearComensal: async (sesionId, nombre, esOwner) => {
    set({ error: null })
    try {
      const comensal = await api.comensales.crear(sesionId, nombre, esOwner)
      sessionStorage.setItem(COMENSAL_ID_KEY, comensal.id)
      sessionStorage.setItem(COMENSAL_NOMBRE_KEY, comensal.nombre)
      set({ comensalId: comensal.id, nombre: comensal.nombre })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Error al registrar el comensal' })
    }
  },

  reset: () => {
    sessionStorage.removeItem(COMENSAL_ID_KEY)
    sessionStorage.removeItem(COMENSAL_NOMBRE_KEY)
    set({ comensalId: null, nombre: null, error: null })
  },
}))
