import { create } from 'zustand'

const BASE = import.meta.env.VITE_API_URL ?? ''

interface InitiateResponse {
  id: string
  initPoint: string
  externalReference: string
  pagoId: string
}

interface PagoStore {
  estado: 'idle' | 'loading' | 'mp_redirect' | 'efectivo_solicitado' | 'error'
  error: string | null
  initiarPagoMP: (
    jwt: string,
    sesionId: string,
    restauranteId: string,
    pedidoId: string,
    monto: number,
  ) => Promise<void>
  solicitarEfectivo: (
    jwt: string,
    sesionId: string,
    pedidoId: string,
    monto: number,
  ) => Promise<void>
  reset: () => void
}

export const usePagoStore = create<PagoStore>()((set) => ({
  estado: 'idle',
  error: null,

  initiarPagoMP: async (jwt, sesionId, restauranteId, pedidoId, monto) => {
    set({ estado: 'loading', error: null })
    try {
      const res = await fetch(`${BASE}/payments/initiate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ pedidoId, sesionId, restauranteId, monto, descripcion: 'Pago MenYu' }),
      })

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as Record<string, unknown>
        throw new Error(typeof err['message'] === 'string' ? err['message'] : `Error ${res.status}`)
      }

      const data = (await res.json()) as InitiateResponse
      window.location.href = data.initPoint
      set({ estado: 'mp_redirect' })
    } catch (e) {
      set({
        estado: 'error',
        error: e instanceof Error ? e.message : 'Error al conectar con Mercado Pago',
      })
    }
  },

  solicitarEfectivo: async (jwt, sesionId, pedidoId, monto) => {
    set({ estado: 'loading', error: null })
    try {
      const res = await fetch(`${BASE}/payments/solicitar-efectivo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ sesionId, pedidoId, monto }),
      })

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as Record<string, unknown>
        throw new Error(typeof err['message'] === 'string' ? err['message'] : `Error ${res.status}`)
      }

      set({ estado: 'efectivo_solicitado' })
    } catch (e) {
      set({
        estado: 'error',
        error: e instanceof Error ? e.message : 'Error al registrar pago en efectivo',
      })
    }
  },

  reset: () => {
    set({ estado: 'idle', error: null })
  },
}))
