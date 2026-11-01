import { renderHook, waitFor } from '@testing-library/react'
import { api } from '../services/api'
import { useSessionStore } from '../store/sessionStore'
import { usePedidosCliente } from './usePedidosCliente'

vi.mock('../services/api', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../services/api')>()),
  api: { orders: { list: vi.fn() } },
}))

// `vi.mock` se eleva arriba de todo, así que el socket falso se define con `vi.hoisted` para existir antes.
const { ioFalso, socketFalso } = vi.hoisted(() => {
  const socketFalso = { on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }
  return { socketFalso, ioFalso: vi.fn(() => socketFalso) }
})

vi.mock('socket.io-client', () => ({ io: ioFalso }))

beforeEach(() => {
  sessionStorage.clear()
  useSessionStore.getState().clear()
  ioFalso.mockClear()
  socketFalso.on.mockClear()
  socketFalso.emit.mockClear()
  socketFalso.disconnect.mockClear()
  vi.mocked(api.orders.list).mockReset().mockResolvedValue([])
})

describe('usePedidosCliente: el socket', () => {
  it('manda el JWT de la sesión de mesa en el handshake', async () => {
    useSessionStore.setState({ jwt: 'jwt-de-mesa', sesionId: 'ses-1', restauranteId: 'rest-1' })

    const { result } = renderHook(() => usePedidosCliente())

    expect(ioFalso).toHaveBeenCalledTimes(1)
    expect(ioFalso).toHaveBeenCalledWith(expect.stringMatching(/\/ws$/), {
      transports: ['websocket'],
      auth: { token: 'jwt-de-mesa' },
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
  })

  it('sin JWT no abre el socket', async () => {
    useSessionStore.setState({ jwt: null, restauranteId: 'rest-1' })

    const { result } = renderHook(() => usePedidosCliente())

    await waitFor(() => expect(result.current.error).toBe('No hay sesión activa'))
    expect(ioFalso).not.toHaveBeenCalled()
  })
})
