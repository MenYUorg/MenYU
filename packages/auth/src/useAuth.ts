import { create } from 'zustand'
import { authService, TOKEN_KEY, REFRESH_KEY } from './authService'
import type { JwtPayload } from '@menyu/types'

interface AuthStore {
  user: JwtPayload | null
  isLoggedIn: boolean
  loading: boolean
  error: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  clearError: () => void
  getToken: () => string | null
}

function decodeJwt(token: string): JwtPayload {
  return JSON.parse(atob(token.split('.')[1])) as JwtPayload
}

function savedUser(): JwtPayload | null {
  const t = localStorage.getItem(TOKEN_KEY)
  if (!t) return null
  try { return decodeJwt(t) } catch { return null }
}

export const useAuth = create<AuthStore>()((set) => ({
  user: savedUser(),
  isLoggedIn: !!localStorage.getItem(TOKEN_KEY),
  loading: false,
  error: null,

  login: async (email, password) => {
    set({ loading: true, error: null })
    try {
      const tokens = await authService.login(email, password)
      localStorage.setItem(TOKEN_KEY, tokens.accessToken)
      localStorage.setItem(REFRESH_KEY, tokens.refreshToken)
      const user = decodeJwt(tokens.accessToken)
      set({ user, isLoggedIn: true })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Error al iniciar sesión' })
    } finally {
      set({ loading: false })
    }
  },

  logout: () => {
    const refresh = localStorage.getItem(REFRESH_KEY)
    if (refresh) authService.logout(refresh).catch(() => undefined)
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_KEY)
    set({ user: null, isLoggedIn: false })
  },

  clearError: () => set({ error: null }),
  getToken: () => localStorage.getItem(TOKEN_KEY),
}))
