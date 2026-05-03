import { create } from 'zustand'
import { JwtPayload, TokenPair } from '@menyu/types'
import { api, configureApiAuth } from '../services/api'
import { storage } from '../services/storage'

const KEYS = {
  ACCESS: 'menyu_access_token',
  REFRESH: 'menyu_refresh_token',
}

function decodeJwt(token: string): JwtPayload {
  const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
  return JSON.parse(atob(base64))
}

async function saveTokens(pair: TokenPair) {
  await storage.setItem(KEYS.ACCESS, pair.accessToken)
  await storage.setItem(KEYS.REFRESH, pair.refreshToken)
}

interface UserState {
  accessToken: string | null
  refreshToken: string | null
  user: JwtPayload | null
  isLoading: boolean
  isHydrated: boolean
}

interface UserActions {
  hydrate: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  register: (nombre: string, email: string, password: string, telefono?: string) => Promise<void>
  loginAsGuest: (nombre?: string) => Promise<void>
  refresh: () => Promise<string>
  logout: () => Promise<void>
}

export const useUserStore = create<UserState & UserActions>((set, get) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  isLoading: false,
  isHydrated: false,

  hydrate: async () => {
    const accessToken = await storage.getItem(KEYS.ACCESS)
    const refreshToken = await storage.getItem(KEYS.REFRESH)

    if (accessToken && refreshToken) {
      try {
        const user = decodeJwt(accessToken)
        set({ accessToken, refreshToken, user, isHydrated: true })
      } catch {
        await storage.deleteItem(KEYS.ACCESS)
        await storage.deleteItem(KEYS.REFRESH)
        set({ isHydrated: true })
      }
    } else {
      set({ isHydrated: true })
    }
  },

  login: async (email, password) => {
    set({ isLoading: true })
    try {
      const { data } = await api.post<TokenPair>('/auth/login', { email, password })
      await saveTokens(data)
      set({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: decodeJwt(data.accessToken), isLoading: false })
    } catch (error) {
      set({ isLoading: false })
      throw error
    }
  },

  register: async (nombre, email, password, telefono) => {
    set({ isLoading: true })
    try {
      const { data } = await api.post<TokenPair>('/auth/register', { nombre, email, password, telefono })
      await saveTokens(data)
      set({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: decodeJwt(data.accessToken), isLoading: false })
    } catch (error) {
      set({ isLoading: false })
      throw error
    }
  },

  loginAsGuest: async (nombre) => {
    set({ isLoading: true })
    try {
      const { data } = await api.post<TokenPair>('/auth/guest', { nombre })
      await saveTokens(data)
      set({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: decodeJwt(data.accessToken), isLoading: false })
    } catch (error) {
      set({ isLoading: false })
      throw error
    }
  },

  refresh: async () => {
    const { refreshToken } = get()
    if (!refreshToken) throw new Error('No hay refresh token')
    const { data } = await api.post<TokenPair>('/auth/refresh', { refreshToken })
    await saveTokens(data)
    set({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: decodeJwt(data.accessToken) })
    return data.accessToken
  },

  logout: async () => {
    const { refreshToken } = get()
    try {
      if (refreshToken) await api.post('/auth/logout', { refreshToken })
    } catch {
      // si el server falla, igual limpiamos local
    }
    await storage.deleteItem(KEYS.ACCESS)
    await storage.deleteItem(KEYS.REFRESH)
    set({ accessToken: null, refreshToken: null, user: null })
  },
}))

// Registra los handlers en api.ts sin crear dependencia circular
configureApiAuth({
  getToken: () => useUserStore.getState().accessToken,
  refresh: () => useUserStore.getState().refresh(),
  logout: () => useUserStore.getState().logout(),
})
