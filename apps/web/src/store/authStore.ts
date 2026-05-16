import { create } from 'zustand'
import { api, ApiError, TOKEN_KEY, REFRESH_KEY } from '../services/api'
import type { JwtPayload, Marca, Restaurante } from '@menyu/types'

interface AuthStore {
  user: JwtPayload | null
  marcas: Marca[]
  restaurantes: Restaurante[]
  selectedMarcaId: string | null
  selectedRestauranteId: string | null
  isLoggedIn: boolean
  loading: boolean
  error: string | null
  login: (email: string, password: string) => Promise<void>
  register: (nombre: string, email: string, password: string) => Promise<void>
  loginAsGuest: (nombre?: string) => Promise<void>
  logout: () => void
  loadContext: () => Promise<void>
  setMarca: (id: string) => void
  setRestaurante: (id: string) => void
  clearError: () => void
}

function decodeJwt(token: string): JwtPayload {
  const part = token.split('.')[1]
  return JSON.parse(atob(part)) as JwtPayload
}

function savedUser(): JwtPayload | null {
  const t = localStorage.getItem(TOKEN_KEY)
  if (!t) return null
  try { return decodeJwt(t) } catch { return null }
}

export const useAuthStore = create<AuthStore>()((set, get) => ({
  user: savedUser(),
  marcas: [],
  restaurantes: [],
  selectedMarcaId: null,
  selectedRestauranteId: null,
  isLoggedIn: !!localStorage.getItem(TOKEN_KEY),
  loading: false,
  error: null,

  login: async (email, password) => {
    set({ loading: true, error: null })
    try {
      const tokens = await api.auth.login(email, password)
      localStorage.setItem(TOKEN_KEY, tokens.accessToken)
      localStorage.setItem(REFRESH_KEY, tokens.refreshToken)
      const user = decodeJwt(tokens.accessToken)
      set({ user, isLoggedIn: true })
      if (user.tipo === 'admin') await get().loadContext()
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Error al iniciar sesión' })
    } finally {
      set({ loading: false })
    }
  },

  register: async (nombre, email, password) => {
    set({ loading: true, error: null })
    try {
      const tokens = await api.auth.register(nombre, email, password)
      localStorage.setItem(TOKEN_KEY, tokens.accessToken)
      localStorage.setItem(REFRESH_KEY, tokens.refreshToken)
      const user = decodeJwt(tokens.accessToken)
      set({ user, isLoggedIn: true })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Error al registrarse' })
    } finally {
      set({ loading: false })
    }
  },

  loginAsGuest: async (nombre) => {
    set({ loading: true, error: null })
    try {
      const tokens = await api.auth.guest(nombre)
      localStorage.setItem(TOKEN_KEY, tokens.accessToken)
      localStorage.setItem(REFRESH_KEY, tokens.refreshToken)
      const user = decodeJwt(tokens.accessToken)
      set({ user, isLoggedIn: true })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Error al ingresar como invitado' })
    } finally {
      set({ loading: false })
    }
  },

  logout: () => {
    const refresh = localStorage.getItem(REFRESH_KEY)
    if (refresh) api.auth.logout(refresh).catch(() => undefined)
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_KEY)
    set({ user: null, isLoggedIn: false, marcas: [], restaurantes: [], selectedMarcaId: null, selectedRestauranteId: null })
  },

  loadContext: async () => {
    try {
      const [marcas, restaurantes] = await Promise.all([api.marcas.list(), api.restaurantes.list()])
      set({
        marcas,
        restaurantes,
        selectedMarcaId: marcas[0]?.id ?? null,
        selectedRestauranteId: restaurantes[0]?.id ?? null,
      })
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) get().logout()
    }
  },

  setMarca: (id) => set({ selectedMarcaId: id }),
  setRestaurante: (id) => set({ selectedRestauranteId: id }),
  clearError: () => set({ error: null }),
}))
