import { act, renderHook, waitFor } from '@testing-library/react'
import { api } from '../services/api'
import { useSessionStore } from '../store/sessionStore'
import { hayPedidosVigentes, usePuedeCerrarSesion } from './usePuedeCerrarSesion'

vi.mock('../services/api', () => ({
  api: { orders: { list: vi.fn() } },
}))

const listar = vi.mocked(api.orders.list)
const pedido = (estado: string) => ({ id: `p-${estado}`, estado })

/** Deja que lleguen las respuestas pendientes (dentro de `act`: si no, React avisa de cambios fuera de él). */
const esperar = () => act(async () => { await new Promise((r) => setTimeout(r, 20)) })

const EN_MESA = { sesionId: 'ses-1', jwt: 'jwt-1' }
const SIN_MESA = { sesionId: null, jwt: null }

describe('hayPedidosVigentes', () => {
  it('sin pedidos no hay', () => {
    expect(hayPedidosVigentes([])).toBe(false)
  })

  it.each(['pendiente', 'en_preparacion', 'listo', 'entregado'])('un pedido %s cuenta', (estado) => {
    expect(hayPedidosVigentes([pedido(estado)])).toBe(true)
  })

  it('un pedido anulado no cuenta', () => {
    expect(hayPedidosVigentes([pedido('anulado')])).toBe(false)
  })

  it('con uno anulado y otro que no, cuenta', () => {
    expect(hayPedidosVigentes([pedido('anulado'), pedido('pendiente')])).toBe(true)
  })

  it('cuentan los pedidos de cualquier comensal de la mesa (el pedido es de la mesa)', () => {
    expect(hayPedidosVigentes([{ id: 'p1', estado: 'listo', items: [{ clienteId: 'otro-comensal' }] }])).toBe(true)
  })
})

describe('usePuedeCerrarSesion', () => {
  beforeEach(() => {
    listar.mockReset().mockResolvedValue([])
    useSessionStore.setState({ ...EN_MESA })
  })

  describe('sin cuenta', () => {
    it('no hay sesión que cerrar: no se ofrece y no se consulta nada', () => {
      const { result } = renderHook(() => usePuedeCerrarSesion({ abierto: true, conCuenta: false }))

      expect(result.current).toBe(false)
      expect(listar).not.toHaveBeenCalled()
    })
  })

  describe('con cuenta y fuera de una mesa', () => {
    beforeEach(() => useSessionStore.setState({ ...SIN_MESA }))

    it('se ofrece enseguida y no se consulta nada', () => {
      const { result } = renderHook(() => usePuedeCerrarSesion({ abierto: true, conCuenta: true }))

      expect(result.current).toBe(true)
      expect(listar).not.toHaveBeenCalled()
    })

    it('con una sesión de mesa a medias (sin token) tampoco cuenta como estar en una mesa', () => {
      useSessionStore.setState({ sesionId: 'ses-1', jwt: null })

      const { result } = renderHook(() => usePuedeCerrarSesion({ abierto: true, conCuenta: true }))

      expect(result.current).toBe(true)
      expect(listar).not.toHaveBeenCalled()
    })
  })

  describe('con cuenta y en una mesa', () => {
    it('mientras no se sabe si la mesa pidió, no se ofrece', () => {
      listar.mockReturnValue(new Promise(() => {}))

      const { result } = renderHook(() => usePuedeCerrarSesion({ abierto: true, conCuenta: true }))

      expect(result.current).toBe(false)
    })

    it('si la mesa todavía no pidió nada, se ofrece', async () => {
      listar.mockResolvedValue([])

      const { result } = renderHook(() => usePuedeCerrarSesion({ abierto: true, conCuenta: true }))

      await waitFor(() => expect(result.current).toBe(true))
      expect(listar).toHaveBeenCalledWith('jwt-1')
    })

    it('si la mesa ya pidió algo, no se ofrece', async () => {
      listar.mockResolvedValue([pedido('pendiente')])

      const { result } = renderHook(() => usePuedeCerrarSesion({ abierto: true, conCuenta: true }))

      await waitFor(() => expect(listar).toHaveBeenCalled())
      await esperar()
      expect(result.current).toBe(false)
    })

    it('si lo único que pidió está anulado, se ofrece', async () => {
      listar.mockResolvedValue([pedido('anulado'), pedido('anulado')])

      const { result } = renderHook(() => usePuedeCerrarSesion({ abierto: true, conCuenta: true }))

      await waitFor(() => expect(result.current).toBe(true))
    })

    it('si no se puede consultar (sin conexión, sesión vencida), no se ofrece', async () => {
      listar.mockRejectedValue(new Error('Session JWT inválido o expirado'))

      const { result } = renderHook(() => usePuedeCerrarSesion({ abierto: true, conCuenta: true }))

      await waitFor(() => expect(listar).toHaveBeenCalled())
      await esperar()
      expect(result.current).toBe(false)
    })

    it('si la consulta falla después de haber dicho que sí, deja de ofrecerse', async () => {
      listar.mockResolvedValueOnce([])
      const { result, rerender } = renderHook(({ abierto }) => usePuedeCerrarSesion({ abierto, conCuenta: true }), { initialProps: { abierto: true } })
      await waitFor(() => expect(result.current).toBe(true))

      listar.mockRejectedValueOnce(new Error('sin conexión'))
      rerender({ abierto: false })
      rerender({ abierto: true })

      await waitFor(() => expect(result.current).toBe(false))
    })
  })

  describe('cuándo consulta', () => {
    it('solo con el menú lateral abierto', () => {
      renderHook(() => usePuedeCerrarSesion({ abierto: false, conCuenta: true }))

      expect(listar).not.toHaveBeenCalled()
    })

    it('cada vez que se abre, para contar lo último que pidió la mesa', async () => {
      listar.mockResolvedValue([])
      const { result, rerender } = renderHook(({ abierto }) => usePuedeCerrarSesion({ abierto, conCuenta: true }), { initialProps: { abierto: true } })
      await waitFor(() => expect(result.current).toBe(true))

      // Mientras tanto la mesa pidió algo.
      listar.mockResolvedValue([pedido('pendiente')])
      rerender({ abierto: false })
      rerender({ abierto: true })

      await waitFor(() => expect(result.current).toBe(false))
      expect(listar).toHaveBeenCalledTimes(2)
    })

    it('una respuesta que llega después de cerrar y volver a abrir no pisa a la última', async () => {
      let responderPrimera: (v: unknown[]) => void = () => {}
      listar.mockReturnValueOnce(new Promise((r) => { responderPrimera = r }))
      listar.mockResolvedValueOnce([pedido('pendiente')])
      const { result, rerender } = renderHook(({ abierto }) => usePuedeCerrarSesion({ abierto, conCuenta: true }), { initialProps: { abierto: true } })

      rerender({ abierto: false })
      rerender({ abierto: true })
      await waitFor(() => expect(listar).toHaveBeenCalledTimes(2))
      responderPrimera([])
      await esperar()

      expect(result.current).toBe(false)
    })
  })

  it('lo que se supo de una mesa no vale para otra', async () => {
    listar.mockResolvedValue([])
    const { result, rerender } = renderHook(({ abierto }) => usePuedeCerrarSesion({ abierto, conCuenta: true }), { initialProps: { abierto: true } })
    await waitFor(() => expect(result.current).toBe(true))

    // Se pasa a otra mesa: hasta saber de esa, no se ofrece.
    listar.mockReturnValue(new Promise(() => {}))
    act(() => { useSessionStore.setState({ sesionId: 'ses-2', jwt: 'jwt-2' }) })
    rerender({ abierto: true })

    await waitFor(() => expect(listar).toHaveBeenLastCalledWith('jwt-2'))
    expect(result.current).toBe(false)
  })
})
