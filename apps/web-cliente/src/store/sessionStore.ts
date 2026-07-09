import { create } from 'zustand'
import { api } from '../services/api'
import { useCarritoStore } from './carritoStore'

type OpenSessionReturn =
  | { error: 'REQUIERE_CODIGO_SESION' }
  | { error?: undefined; sesionId: string; mesaId: string; restauranteId: string; jwt: string; numeroMesa: string; codigoSesion: string; modoSesion: string; esAnfitrion: boolean }

interface SessionStore {
  sesionId: string | null
  mesaId: string | null
  restauranteId: string | null
  jwt: string | null
  numeroMesa: string | null
  codigoSesion: string | null
  modoSesion: string | null
  esAnfitrion: boolean
  loading: boolean
  error: string | null
  openSession: (params: { restauranteId?: string; pin?: string; qrToken?: string; codigoSesion?: string }) => Promise<OpenSessionReturn | undefined>
  setRestauranteId: (id: string) => void
  clear: () => void
}

const SESION_KEY      = 'menyu_sesion_id'
const MESA_KEY        = 'menyu_mesa_id'
const RESTAURANTE_KEY = 'menyu_restaurante_id'
const JWT_KEY         = 'menyu_sesion_jwt'
const NUMERO_MESA_KEY = 'menyu_numero_mesa'
const CODIGO_KEY      = 'menyu_codigo_sesion'
const MODO_KEY        = 'menyu_modo_sesion'
const ANFITRION_KEY   = 'menyu_es_anfitrion'

export const useSessionStore = create<SessionStore>()((set) => ({
  sesionId:      sessionStorage.getItem(SESION_KEY),
  mesaId:        sessionStorage.getItem(MESA_KEY),
  restauranteId: sessionStorage.getItem(RESTAURANTE_KEY),
  jwt:           sessionStorage.getItem(JWT_KEY),
  numeroMesa:    sessionStorage.getItem(NUMERO_MESA_KEY),
  codigoSesion:  sessionStorage.getItem(CODIGO_KEY),
  modoSesion:    sessionStorage.getItem(MODO_KEY),
  esAnfitrion:   sessionStorage.getItem(ANFITRION_KEY) === 'true',
  loading: false,
  error: null,

  openSession: async (params) => {
    set({ loading: true, error: null })
    try {
      const result = await api.sessions.open(params)
      sessionStorage.setItem(SESION_KEY, result.sesionId)
      sessionStorage.setItem(MESA_KEY, result.mesaId)
      sessionStorage.setItem(JWT_KEY, result.jwt)
      sessionStorage.setItem(NUMERO_MESA_KEY, result.numeroMesa)
      sessionStorage.setItem(CODIGO_KEY, result.codigoSesion)
      sessionStorage.setItem(MODO_KEY, result.modoSesion)
      sessionStorage.setItem(ANFITRION_KEY, String(result.esAnfitrion))
      if (result.restauranteId) sessionStorage.setItem(RESTAURANTE_KEY, result.restauranteId)
      set({
        sesionId:      result.sesionId,
        mesaId:        result.mesaId,
        restauranteId: result.restauranteId ?? null,
        jwt:           result.jwt,
        numeroMesa:    result.numeroMesa,
        codigoSesion:  result.codigoSesion,
        modoSesion:    result.modoSesion,
        esAnfitrion:   result.esAnfitrion,
      })
      return result
    } catch (e) {
      if (e instanceof Error && e.message.includes('requiere código de sesión')) {
        return { error: 'REQUIERE_CODIGO_SESION' as const }
      }
      set({ error: e instanceof Error ? e.message : 'Error al abrir la sesión' })
      return undefined
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
    sessionStorage.removeItem(NUMERO_MESA_KEY)
    sessionStorage.removeItem(CODIGO_KEY)
    sessionStorage.removeItem(MODO_KEY)
    sessionStorage.removeItem(ANFITRION_KEY)
    set({ sesionId: null, mesaId: null, restauranteId: null, jwt: null, numeroMesa: null, codigoSesion: null, modoSesion: null, esAnfitrion: false })
    useCarritoStore.getState().vaciar()
  },
}))
