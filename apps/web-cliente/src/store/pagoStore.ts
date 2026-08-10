import { create } from 'zustand'
import { api, ApiError } from '../services/api'
import { useComensalStore } from './comensalStore'

type Modo = 'partes_iguales' | 'por_consumo'

function calcularMiMonto(
  modoDivision: Modo | null,
  modoElegido: Modo | null,
  montoPartesIguales: number | null,
  montoPorConsumo: number | null | 'no_disponible',
): number | null {
  const modo = modoDivision ?? modoElegido
  if (modo === 'partes_iguales') return montoPartesIguales
  if (modo === 'por_consumo') return montoPorConsumo === 'no_disponible' ? null : montoPorConsumo
  return null
}

interface PagoStore {
  estado: 'idle' | 'cargando_division' | 'loading' | 'efectivo_solicitado' | 'mp_redirigiendo' | 'error'
  error: string | null
  modoDivision: Modo | null
  modoElegido: Modo | null
  montoPartesIguales: number | null
  montoPorConsumo: number | null | 'no_disponible'
  miMonto: number | null

  cargarDivision: (sesionId: string) => Promise<void>
  elegirModo: (modo: Modo) => void
  solicitarEfectivo: (sesionId: string) => Promise<void>
  pagarConMercadoPago: (sesionId: string) => Promise<void>
  reset: () => void
}

export const usePagoStore = create<PagoStore>()((set, get) => ({
  estado: 'idle',
  error: null,
  modoDivision: null,
  modoElegido: null,
  montoPartesIguales: null,
  montoPorConsumo: null,
  miMonto: null,

  cargarDivision: async (sesionId) => {
    set({ estado: 'cargando_division', error: null })

    const comensalId = useComensalStore.getState().comensalId

    let modoDivision: Modo | null
    try {
      const res = await api.comensales.obtenerModoDivision(sesionId)
      modoDivision = res.modoDivision
    } catch (e) {
      set({
        estado: 'error',
        error: e instanceof Error ? e.message : 'Error al consultar el modo de división',
      })
      return
    }

    let partesIguales: Array<{ comensalId: string; monto: number }>
    let porConsumoResult: Array<{ comensalId: string; monto: number }> | 'no_disponible'
    try {
      const [partesRes, consumoRes] = await Promise.all([
        api.comensales.calcularPartesIguales(sesionId),
        api.comensales.calcularPorConsumo(sesionId).catch((e: unknown) => {
          if (e instanceof ApiError && e.status === 400) {
            return 'no_disponible' as const
          }
          throw e
        }),
      ])
      partesIguales = partesRes
      porConsumoResult = consumoRes
    } catch (e) {
      set({
        estado: 'error',
        error: e instanceof Error ? e.message : 'Error al calcular la división de la cuenta',
      })
      return
    }

    const montoPartesIguales =
      partesIguales.find((p) => p.comensalId === comensalId)?.monto ?? null
    const montoPorConsumo =
      porConsumoResult === 'no_disponible'
        ? 'no_disponible'
        : porConsumoResult.find((p) => p.comensalId === comensalId)?.monto ?? 'no_disponible'

    set({
      estado: 'idle',
      modoDivision,
      montoPartesIguales,
      montoPorConsumo,
      miMonto: calcularMiMonto(modoDivision, get().modoElegido, montoPartesIguales, montoPorConsumo),
    })
  },

  elegirModo: (modo) => {
    set((state) => ({
      modoElegido: modo,
      miMonto: calcularMiMonto(state.modoDivision, modo, state.montoPartesIguales, state.montoPorConsumo),
    }))
  },

  solicitarEfectivo: async (sesionId) => {
    const comensalId = useComensalStore.getState().comensalId
    // El pago sin comensalId (mesa completa, flujo del mozo) no está cableado desde esta pantalla todavía.
    if (!comensalId) {
      set({ estado: 'error', error: 'No se encontró el comensal actual' })
      return
    }

    const { modoDivision, modoElegido } = get()
    const modo = modoDivision ?? modoElegido
    if (!modo) {
      set({ estado: 'error', error: 'Elegí cómo se divide la cuenta antes de continuar' })
      return
    }

    set({ estado: 'loading', error: null })
    try {
      await api.payments.solicitarEfectivo(sesionId, comensalId, modo)
      set({ estado: 'efectivo_solicitado' })
    } catch (e) {
      set({
        estado: 'error',
        error: e instanceof Error ? e.message : 'Error al registrar pago en efectivo',
      })
    }
  },

  pagarConMercadoPago: async (sesionId) => {
    const comensalId = useComensalStore.getState().comensalId
    // Mismo caso: pago de mesa completa sin comensalId todavía no está cableado desde esta pantalla.
    if (!comensalId) {
      set({ estado: 'error', error: 'No se encontró el comensal actual' })
      return
    }

    const { modoDivision, modoElegido } = get()
    const modo = modoDivision ?? modoElegido
    if (!modo) {
      set({ estado: 'error', error: 'Elegí cómo se divide la cuenta antes de continuar' })
      return
    }

    set({ estado: 'mp_redirigiendo', error: null })
    try {
      const { initPoint } = await api.payments.pagarConMercadoPago(sesionId, comensalId, modo)
      window.location.href = initPoint
    } catch (e) {
      set({
        estado: 'error',
        error: e instanceof Error ? e.message : 'Error al iniciar el pago con Mercado Pago',
      })
    }
  },

  reset: () => {
    set({
      estado: 'idle',
      error: null,
      modoDivision: null,
      modoElegido: null,
      montoPartesIguales: null,
      montoPorConsumo: null,
      miMonto: null,
    })
  },
}))
