import { create } from 'zustand'
import { TOKEN_KEY } from '@menyu/auth'
import { api } from '../services/api'
import type { Marca, Restaurante } from '@menyu/types'

const RESTAURANTE_KEY = 'menyu-admin-restaurante-id'

function getJwtRol(): string | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) return null
    const payload = JSON.parse(atob(token.split('.')[1])) as { rol?: string }
    return payload.rol ?? null
  } catch {
    return null
  }
}

interface ContextStore {
  marcas: Marca[]
  restaurantes: Restaurante[]
  selectedMarcaId: string | null
  selectedRestauranteId: string | null
  loadContext: () => Promise<void>
  setMarca: (id: string) => void
  setRestaurante: (id: string) => void
}

export const useContextStore = create<ContextStore>()((set) => ({
  marcas: [],
  restaurantes: [],
  selectedMarcaId: null,
  selectedRestauranteId: localStorage.getItem(RESTAURANTE_KEY),

  loadContext: async () => {
    const rol = getJwtRol()
    try {
      const saved = localStorage.getItem(RESTAURANTE_KEY)
      if (rol === 'GERENTE') {
        const restaurantes = await api.restaurantes.list()
        const existe = saved && restaurantes.some((r) => r.id === saved)
        const selectedRestauranteId = existe ? saved : (restaurantes[0]?.id ?? null)
        const marcasMap = new Map<string, Marca>()
        restaurantes.forEach((r) => { if (r.marca) marcasMap.set(r.marca.id, r.marca) })
        const marcas = Array.from(marcasMap.values())
        const selectedMarcaId = restaurantes.find((r) => r.id === selectedRestauranteId)?.marca?.id ?? null
        set({ marcas, restaurantes, selectedMarcaId, selectedRestauranteId })
      } else {
        const [marcas, restaurantes] = await Promise.all([
          api.marcas.list(),
          api.restaurantes.list(),
        ])
        const existe = saved && restaurantes.some((r) => r.id === saved)
        const selectedRestauranteId = existe ? saved : (restaurantes[0]?.id ?? null)
        set({ marcas, restaurantes, selectedMarcaId: marcas[0]?.id ?? null, selectedRestauranteId })
      }
    } catch {
      // api.ts redirige a /login en caso de 401
    }
  },

  setMarca: (id) => set({ selectedMarcaId: id }),
  setRestaurante: (id) => {
    localStorage.setItem(RESTAURANTE_KEY, id)
    set({ selectedRestauranteId: id })
  },
}))
