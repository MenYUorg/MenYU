import { act, renderHook, waitFor } from '@testing-library/react'
import { esSinConexion, useCarga } from './useCarga'
import { promesaManual } from '../../test/root'

describe('esSinConexion', () => {
  afterEach(() => vi.restoreAllMocks())

  it('un TypeError de fetch es falta de conexión', () => {
    expect(esSinConexion(new TypeError('Failed to fetch'))).toBe(true)
  })

  it('un error del servidor no lo es', () => {
    expect(esSinConexion(Object.assign(new Error('Error 500'), { status: 500 }))).toBe(false)
    expect(esSinConexion(null)).toBe(false)
  })

  it('si el navegador dice que no hay red, cualquier error lo es', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    expect(esSinConexion(new Error('lo que sea'))).toBe(true)
  })
})

describe('useCarga', () => {
  it('empieza cargando y pasa a ok con los datos', async () => {
    const { result } = renderHook(() => useCarga(() => Promise.resolve(['a']), []))

    expect(result.current.estado).toBe('cargando')
    expect(result.current.datos).toBeNull()
    await waitFor(() => expect(result.current.estado).toBe('ok'))
    expect(result.current.datos).toEqual(['a'])
  })

  it('un fallo del servidor es "error"; una falta de red es "sin-conexion"', async () => {
    const servidor = renderHook(() => useCarga(() => Promise.reject(new Error('Error 500')), []))
    await waitFor(() => expect(servidor.result.current.estado).toBe('error'))

    const red = renderHook(() => useCarga(() => Promise.reject(new TypeError('Failed to fetch')), []))
    await waitFor(() => expect(red.result.current.estado).toBe('sin-conexion'))
  })

  it('guarda el error para poder distinguir, por ejemplo, un 404', async () => {
    const fallo = Object.assign(new Error('No existe'), { status: 404 })
    const { result } = renderHook(() => useCarga(() => Promise.reject(fallo), []))

    await waitFor(() => expect(result.current.estado).toBe('error'))
    expect(result.current.error).toBe(fallo)
  })

  it('recargar vuelve a la pantalla de carga y pide de nuevo', async () => {
    const cargar = vi.fn().mockRejectedValueOnce(new Error('Error 500')).mockResolvedValueOnce('listo')
    const { result } = renderHook(() => useCarga(cargar, []))
    await waitFor(() => expect(result.current.estado).toBe('error'))

    act(() => result.current.recargar())

    expect(result.current.estado).toBe('cargando')
    await waitFor(() => expect(result.current.estado).toBe('ok'))
    expect(result.current.datos).toBe('listo')
    expect(result.current.error).toBeNull()
  })

  it('actualizar pide de nuevo sin pasar por la pantalla de carga', async () => {
    const cargar = vi.fn().mockResolvedValueOnce('uno').mockResolvedValueOnce('dos')
    const { result } = renderHook(() => useCarga(cargar, []))
    await waitFor(() => expect(result.current.datos).toBe('uno'))

    act(() => result.current.actualizar())

    expect(result.current.estado).toBe('ok')
    await waitFor(() => expect(result.current.datos).toBe('dos'))
  })

  it('si actualizar falla, deja lo que había (no cambia a error)', async () => {
    const cargar = vi.fn().mockResolvedValueOnce('uno').mockRejectedValueOnce(new Error('Error 500'))
    const { result } = renderHook(() => useCarga(cargar, []))
    await waitFor(() => expect(result.current.datos).toBe('uno'))

    act(() => result.current.actualizar())
    await waitFor(() => expect(cargar).toHaveBeenCalledTimes(2))
    await act(async () => {})

    expect(result.current.estado).toBe('ok')
    expect(result.current.datos).toBe('uno')
  })

  it('reemplazar pone datos ya conocidos sin pedir nada y descarta lo que venía en camino', async () => {
    const lenta = promesaManual<string>()
    const cargar = vi.fn().mockReturnValueOnce(lenta.promesa)
    const { result } = renderHook(() => useCarga(cargar, []))

    act(() => result.current.reemplazar('de la respuesta del cambio'))
    lenta.resolver('vieja')
    await act(async () => {})

    expect(result.current.datos).toBe('de la respuesta del cambio')
    expect(result.current.estado).toBe('ok')
    expect(cargar).toHaveBeenCalledTimes(1)
  })

  it('al cambiar las dependencias pide de nuevo, y una respuesta tardía del pedido anterior no pisa la nueva', async () => {
    const primera = promesaManual<string>()
    const segunda = promesaManual<string>()
    const cargar = vi.fn((id: string) => (id === 'a' ? primera.promesa : segunda.promesa))
    const { result, rerender } = renderHook(({ id }) => useCarga(() => cargar(id), [id]), { initialProps: { id: 'a' } })

    rerender({ id: 'b' })
    segunda.resolver('datos de b')
    await waitFor(() => expect(result.current.datos).toBe('datos de b'))
    primera.resolver('datos de a, tarde')
    await act(async () => {})

    expect(result.current.datos).toBe('datos de b')
  })

  it('un error tardío del pedido anterior tampoco pisa lo nuevo', async () => {
    const primera = promesaManual<string>()
    const cargar = vi.fn((id: string) => (id === 'a' ? primera.promesa : Promise.resolve('datos de b')))
    const { result, rerender } = renderHook(({ id }) => useCarga(() => cargar(id), [id]), { initialProps: { id: 'a' } })

    rerender({ id: 'b' })
    await waitFor(() => expect(result.current.datos).toBe('datos de b'))
    primera.rechazar(new Error('Error 500'))
    await act(async () => {})

    expect(result.current.estado).toBe('ok')
    expect(result.current.datos).toBe('datos de b')
  })

  it('lo que llega después de desmontar no rompe nada', async () => {
    const lenta = promesaManual<string>()
    const { unmount } = renderHook(() => useCarga(() => lenta.promesa, []))

    unmount()
    lenta.resolver('tarde')
    await act(async () => {})
  })
})
