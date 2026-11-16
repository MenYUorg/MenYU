import { act, renderHook, waitFor } from '@testing-library/react'
import { api, ApiError } from '../services/api'
import { useCajasAbiertas, useCajasStore } from './cajasStore'

vi.mock('../services/api', () => {
  class ApiErrorFalso extends Error {
    constructor(message: string, public readonly status: number) {
      super(message)
      this.name = 'ApiError'
    }
  }
  return { api: { cajas: { abiertas: vi.fn() } }, ApiError: ApiErrorFalso }
})

const abiertas = vi.mocked(api.cajas.abiertas)
const PRINCIPAL = { cajaId: 'caja-1', nombre: 'Principal' }
const BARRA = { cajaId: 'caja-2', nombre: 'Barra' }

/** Una respuesta que el test resuelve a mano, para elegir en qué orden llegan. */
function diferida<T>() {
  let resolver!: (valor: T) => void
  let rechazar!: (error: unknown) => void
  const promesa = new Promise<T>((res, rej) => {
    resolver = res
    rechazar = rej
  })
  return { promesa, resolver, rechazar }
}

beforeEach(() => {
  vi.clearAllMocks()
  useCajasStore.setState({ restauranteId: null, cajas: null })
})

describe('cajasStore', () => {
  it('arranca sin saber: null', () => {
    expect(useCajasStore.getState().cajas).toBeNull()
  })

  it('carga las cajas abiertas del restaurante', async () => {
    abiertas.mockResolvedValue({ cajas: [BARRA, PRINCIPAL] })

    await useCajasStore.getState().cargar('rest-1')

    expect(abiertas).toHaveBeenCalledWith('rest-1')
    expect(useCajasStore.getState()).toMatchObject({ restauranteId: 'rest-1', cajas: [BARRA, PRINCIPAL] })
  })

  it('sin turno abierto queda [] (no null)', async () => {
    abiertas.mockResolvedValue({ cajas: [] })

    await useCajasStore.getState().cargar('rest-1')

    expect(useCajasStore.getState().cajas).toEqual([])
  })

  it.each([
    ['un error de red', new TypeError('Failed to fetch')],
    ['un 403', new ApiError('Forbidden', 403)],
    ['un 404 (un backend sin la ruta)', new ApiError('Cannot GET /api/cajas/abiertas', 404)],
  ])('%s deja null, también si antes se sabía', async (_caso, error) => {
    abiertas.mockResolvedValueOnce({ cajas: [PRINCIPAL] }).mockRejectedValueOnce(error)

    await useCajasStore.getState().cargar('rest-1')
    await useCajasStore.getState().cargar('rest-1')

    expect(useCajasStore.getState().cajas).toBeNull()
  })

  it('al cambiar de restaurante, las del anterior no se muestran mientras carga', async () => {
    abiertas.mockResolvedValueOnce({ cajas: [PRINCIPAL] })
    await useCajasStore.getState().cargar('rest-1')
    const pendiente = diferida<{ cajas: (typeof PRINCIPAL)[] }>()
    abiertas.mockReturnValueOnce(pendiente.promesa)

    const carga = useCajasStore.getState().cargar('rest-2')

    expect(useCajasStore.getState()).toMatchObject({ restauranteId: 'rest-2', cajas: null })
    pendiente.resolver({ cajas: [BARRA] })
    await carga
    expect(useCajasStore.getState()).toMatchObject({ restauranteId: 'rest-2', cajas: [BARRA] })
  })

  it('la respuesta vieja de otro restaurante se ignora, aunque llegue después', async () => {
    const vieja = diferida<{ cajas: (typeof PRINCIPAL)[] }>()
    const nueva = diferida<{ cajas: (typeof PRINCIPAL)[] }>()
    abiertas.mockReturnValueOnce(vieja.promesa).mockReturnValueOnce(nueva.promesa)

    const cargaVieja = useCajasStore.getState().cargar('rest-1')
    const cargaNueva = useCajasStore.getState().cargar('rest-2')
    nueva.resolver({ cajas: [BARRA] })
    await cargaNueva
    vieja.resolver({ cajas: [PRINCIPAL] })
    await cargaVieja

    expect(useCajasStore.getState()).toMatchObject({ restauranteId: 'rest-2', cajas: [BARRA] })
  })

  it('un error viejo tampoco pisa la respuesta nueva', async () => {
    const vieja = diferida<{ cajas: (typeof PRINCIPAL)[] }>()
    abiertas.mockReturnValueOnce(vieja.promesa).mockResolvedValueOnce({ cajas: [BARRA] })

    const cargaVieja = useCajasStore.getState().cargar('rest-1')
    await useCajasStore.getState().cargar('rest-2')
    vieja.rechazar(new TypeError('Failed to fetch'))
    await cargaVieja

    expect(useCajasStore.getState()).toMatchObject({ restauranteId: 'rest-2', cajas: [BARRA] })
  })

  it('recargar el mismo restaurante no borra lo que se sabía mientras carga', async () => {
    abiertas.mockResolvedValueOnce({ cajas: [PRINCIPAL] })
    await useCajasStore.getState().cargar('rest-1')
    const pendiente = diferida<{ cajas: (typeof PRINCIPAL)[] }>()
    abiertas.mockReturnValueOnce(pendiente.promesa)

    const carga = useCajasStore.getState().cargar('rest-1')

    expect(useCajasStore.getState().cajas).toEqual([PRINCIPAL])
    pendiente.resolver({ cajas: [] })
    await carga
    expect(useCajasStore.getState().cajas).toEqual([])
  })
})

describe('useCajasAbiertas', () => {
  it('las pide al montar y las devuelve', async () => {
    abiertas.mockResolvedValue({ cajas: [PRINCIPAL] })

    const { result } = renderHook(() => useCajasAbiertas('rest-1'))

    expect(result.current).toBeNull()
    await waitFor(() => expect(result.current).toEqual([PRINCIPAL]))
    expect(abiertas).toHaveBeenCalledWith('rest-1')
  })

  it('las vuelve a pedir al cambiar de restaurante y no devuelve las del anterior', async () => {
    abiertas.mockResolvedValueOnce({ cajas: [PRINCIPAL] })
    const { result, rerender } = renderHook(({ id }) => useCajasAbiertas(id), { initialProps: { id: 'rest-1' } })
    await waitFor(() => expect(result.current).toEqual([PRINCIPAL]))
    const pendiente = diferida<{ cajas: (typeof PRINCIPAL)[] }>()
    abiertas.mockReturnValueOnce(pendiente.promesa)

    rerender({ id: 'rest-2' })

    expect(result.current).toBeNull()
    await act(async () => pendiente.resolver({ cajas: [BARRA] }))
    expect(result.current).toEqual([BARRA])
    expect(abiertas).toHaveBeenLastCalledWith('rest-2')
  })

  it('sin restaurante no pide nada y devuelve null', () => {
    useCajasStore.setState({ restauranteId: 'rest-1', cajas: [PRINCIPAL] })

    const { result } = renderHook(() => useCajasAbiertas(null))

    expect(result.current).toBeNull()
    expect(abiertas).not.toHaveBeenCalled()
  })

  it('no devuelve las cajas que el store tiene de otro restaurante', () => {
    useCajasStore.setState({ restauranteId: 'rest-1', cajas: [PRINCIPAL] })
    abiertas.mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useCajasAbiertas('rest-2'))

    expect(result.current).toBeNull()
  })
})
