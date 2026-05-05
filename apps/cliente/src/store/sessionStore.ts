import { create } from 'zustand'
import { storage } from '../services/storage'

export interface OpenSessionResult {
  sesionId: string
  mesaId: string
  codigoSesion: string
  clienteId: string
  jwt: string
  esAnfitrion: boolean
}

const SESSION_KEY = 'menyu_session'

interface SessionState {
  sesionId: string | null
  mesaId: string | null
  codigoSesion: string | null
  clienteId: string | null
  esAnfitrion: boolean
  jwt: string | null
  isHydrated: boolean
  setSession: (data: OpenSessionResult) => void
  clearSession: () => void
  hydrate: () => Promise<void>
}

export const useSessionStore = create<SessionState>((set) => ({
  sesionId: null,
  mesaId: null,
  codigoSesion: null,
  clienteId: null,
  esAnfitrion: false,
  jwt: null,
  isHydrated: false,

  setSession: (data) => {
    storage.setItem(SESSION_KEY, JSON.stringify(data)).catch(() => {})
    set({
      sesionId: data.sesionId,
      mesaId: data.mesaId,
      codigoSesion: data.codigoSesion,
      clienteId: data.clienteId,
      esAnfitrion: data.esAnfitrion,
      jwt: data.jwt,
    })
  },

  clearSession: () => {
    storage.deleteItem(SESSION_KEY).catch(() => {})
    set({ sesionId: null, mesaId: null, codigoSesion: null, clienteId: null, esAnfitrion: false, jwt: null })
  },

  hydrate: async () => {
    try {
      const raw = await storage.getItem(SESSION_KEY)
      if (raw) {
        const data: OpenSessionResult = JSON.parse(raw)
        set({
          sesionId: data.sesionId,
          mesaId: data.mesaId,
          codigoSesion: data.codigoSesion,
          clienteId: data.clienteId,
          esAnfitrion: data.esAnfitrion,
          jwt: data.jwt,
        })
      }
    } catch {}
    set({ isHydrated: true })
  },
}))
