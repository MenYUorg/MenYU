import { act, renderHook, waitFor } from '@testing-library/react'
import type { Comanda } from '@menyu/types'
import { api } from '../services/api'
import { useComandas } from './useComandas'

vi.mock('../services/api', () => ({ api: { comandas: { listar: vi.fn() } } }))

const listar = vi.mocked(api.comandas.listar)

const comanda = (id: string, nombre: string, restauranteId = 'rest-1'): Comanda => ({ id, restauranteId, nombre, activa: true })
const COCINA = comanda('c-coc', 'Cocina')
const BARRA = comanda('c-bar', 'Barra')

const diferida = <T,>() => {
  let resolver!: (v: T) => void
  let rechazar!: (e: unknown) => void
  const promesa = new Promise<T>((ok, mal) => { resolver = ok; rechazar = mal })
  return { promesa, resolver, rechazar }
}

beforeEach(() => {
  listar.mockReset()
})

describe('useComandas', () => {
  it('pide las comandas del restaurante al montar', async () => {
    listar.mockResolvedValue([COCINA, BARRA])

    const { result } = renderHook(() => useComandas('rest-1'))

    expect(result.current.comandas).toEqual([])
    await waitFor(() => expect(result.current.comandas).toEqual([COCINA, BARRA]))
    expect(listar).toHaveBeenCalledWith('rest-1')
    expect(listar).toHaveBeenCalledTimes(1)
  })

  it('sin restaurante no pide nada y la lista queda vacía', async () => {
    const { result } = renderHook(() => useComandas(null))
    await act(async () => {})

    expect(listar).not.toHaveBeenCalled()
    expect(result.current.comandas).toEqual([])
    await act(async () => { await result.current.recargar() })
    expect(listar).not.toHaveBeenCalled()
  })

  it('al cambiar de restaurante vacía la lista y carga la del nuevo', async () => {
    const nueva = diferida<Comanda[]>()
    listar.mockImplementation(((r: string) => (r === 'rest-1' ? Promise.resolve([COCINA]) : nueva.promesa)) as never)
    const { result, rerender } = renderHook(({ id }) => useComandas(id), { initialProps: { id: 'rest-1' } })
    await waitFor(() => expect(result.current.comandas).toEqual([COCINA]))

    rerender({ id: 'rest-2' })

    await waitFor(() => expect(result.current.comandas).toEqual([]))
    await act(async () => nueva.resolver([BARRA]))
    expect(result.current.comandas).toEqual([BARRA])
    expect(listar).toHaveBeenLastCalledWith('rest-2')
  })

  it('la respuesta tardía de un restaurante anterior no pisa la lista del actual', async () => {
    const vieja = diferida<Comanda[]>()
    listar.mockImplementation(((r: string) => (r === 'rest-1' ? vieja.promesa : Promise.resolve([BARRA]))) as never)
    const { result, rerender } = renderHook(({ id }) => useComandas(id), { initialProps: { id: 'rest-1' } })

    rerender({ id: 'rest-2' })
    await waitFor(() => expect(result.current.comandas).toEqual([BARRA]))
    await act(async () => vieja.resolver([COCINA]))

    expect(result.current.comandas).toEqual([BARRA])
  })

  it('"recargar" vuelve a pedirla y reemplaza la lista', async () => {
    listar.mockResolvedValueOnce([COCINA]).mockResolvedValueOnce([COCINA, BARRA])
    const { result } = renderHook(() => useComandas('rest-1'))
    await waitFor(() => expect(result.current.comandas).toEqual([COCINA]))

    await act(async () => { await result.current.recargar() })

    expect(result.current.comandas).toEqual([COCINA, BARRA])
    expect(listar).toHaveBeenCalledTimes(2)
  })

  it('"recargar" con la respuesta tardía de un restaurante anterior la descarta', async () => {
    const tardia = diferida<Comanda[]>()
    listar.mockImplementation(((r: string) => (r === 'rest-1' ? tardia.promesa : Promise.resolve([BARRA]))) as never)
    listar.mockResolvedValueOnce([COCINA])
    const { result, rerender } = renderHook(({ id }) => useComandas(id), { initialProps: { id: 'rest-1' } })
    await waitFor(() => expect(result.current.comandas).toEqual([COCINA]))

    let pedida!: Promise<void>
    act(() => { pedida = result.current.recargar() })
    rerender({ id: 'rest-2' })
    await waitFor(() => expect(result.current.comandas).toEqual([BARRA]))
    await act(async () => { tardia.resolver([COCINA]); await pedida })

    expect(result.current.comandas).toEqual([BARRA])
  })

  it('si falla conserva la última lista buena', async () => {
    listar.mockResolvedValueOnce([COCINA, BARRA]).mockRejectedValueOnce(new Error('caído'))
    const { result } = renderHook(() => useComandas('rest-1'))
    await waitFor(() => expect(result.current.comandas).toEqual([COCINA, BARRA]))

    await act(async () => { await result.current.recargar() })

    expect(result.current.comandas).toEqual([COCINA, BARRA])
  })

  it('si nunca cargó queda vacía, sin romper', async () => {
    listar.mockRejectedValue(new Error('caído'))

    const { result } = renderHook(() => useComandas('rest-1'))
    await act(async () => {})

    expect(listar).toHaveBeenCalledTimes(1)
    expect(result.current.comandas).toEqual([])
  })

  it('al cambiar de restaurante no conserva la lista del anterior aunque la del nuevo falle', async () => {
    listar.mockImplementation(((r: string) => (r === 'rest-1' ? Promise.resolve([COCINA]) : Promise.reject(new Error('caído')))) as never)
    const { result, rerender } = renderHook(({ id }) => useComandas(id), { initialProps: { id: 'rest-1' } })
    await waitFor(() => expect(result.current.comandas).toEqual([COCINA]))

    rerender({ id: 'rest-2' })
    await act(async () => {})

    expect(result.current.comandas).toEqual([])
  })
})
