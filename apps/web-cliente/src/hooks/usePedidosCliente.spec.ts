import { act, renderHook, waitFor } from '@testing-library/react'
import { api } from '../services/api'
import { useSessionStore } from '../store/sessionStore'
import { useAnunciadorStore } from '../utils/anunciador'
import { usePedidosCliente, type PedidoCliente } from './usePedidosCliente'

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

describe('usePedidosCliente: cuando cocina cambia un pedido (se anuncia al lector)', () => {
  const pedido = (estado: PedidoCliente['estado'], extra: Partial<PedidoCliente> = {}): PedidoCliente => ({
    id: 'ped-1',
    sesionId: 'ses-1',
    estado,
    createdAt: '2026-10-18T20:00:00',
    items: [{ id: 'i1', cantidad: 1, item: { nombre: 'Hamburguesa doble' } }],
    ...extra,
  })
  const mensaje = () => useAnunciadorStore.getState().mensaje

  /** Abre el hook con un pedido ya cargado y devuelve cómo "llega" un pedido por el socket. */
  async function conUnPedido(inicial: PedidoCliente) {
    useSessionStore.setState({ jwt: 'jwt-de-mesa', sesionId: 'ses-1', restauranteId: 'rest-1' })
    vi.mocked(api.orders.list).mockResolvedValue([inicial] as never)
    const hook = renderHook(() => usePedidosCliente())
    await waitFor(() => expect(hook.result.current.pedidos).toHaveLength(1))
    const alActualizar = socketFalso.on.mock.calls.find(([evento]) => evento === 'order:updated')![1] as (p: PedidoCliente) => void
    return { ...hook, llega: (p: PedidoCliente) => act(() => alActualizar(p)) }
  }

  beforeEach(() => {
    useAnunciadorStore.setState({ mensaje: '', numero: 0 })
  })

  it('si cambió de estado dice "Tu pedido de {plato} está {estado}" y lo muestra', async () => {
    const { result, llega } = await conUnPedido(pedido('pendiente'))

    llega(pedido('listo'))

    expect(mensaje()).toBe('Tu pedido de Hamburguesa doble está listo para servir')
    expect(result.current.pedidos[0].estado).toBe('listo')
  })

  it('con varios platos dice el primero y cuántos más', async () => {
    const { llega } = await conUnPedido(pedido('pendiente'))

    llega(pedido('en_preparacion', {
      items: [
        { id: 'i1', cantidad: 1, item: { nombre: 'Hamburguesa doble' } },
        { id: 'i2', cantidad: 2, item: { nombre: 'Papas' } },
        { id: 'i3', cantidad: 1, item: { nombre: 'Agua' } },
      ],
    }))

    expect(mensaje()).toBe('Tu pedido de Hamburguesa doble y 2 más está en preparación')
  })

  it('si llega con el mismo estado no dice nada (pero el pedido se actualiza)', async () => {
    const { result, llega } = await conUnPedido(pedido('en_preparacion'))

    llega(pedido('en_preparacion', { createdAt: '2026-10-18T20:05:00' }))

    expect(mensaje()).toBe('')
    expect(result.current.pedidos[0].createdAt).toBe('2026-10-18T20:05:00')
  })

  it('un pedido de otra sesión no se dice ni se muestra', async () => {
    const { result, llega } = await conUnPedido(pedido('pendiente'))

    llega(pedido('listo', { sesionId: 'otra-sesion' }))

    expect(mensaje()).toBe('')
    expect(result.current.pedidos[0].estado).toBe('pendiente')
  })

  it('un pedido que esta pantalla no tenía no se dice (no es un cambio de estado de algo que se vio)', async () => {
    const { llega } = await conUnPedido(pedido('pendiente'))

    llega(pedido('listo', { id: 'ped-desconocido' }))

    expect(mensaje()).toBe('')
  })

  it('dos cambios seguidos se dicen los dos, cada uno con el estado nuevo', async () => {
    const { llega } = await conUnPedido(pedido('pendiente'))

    llega(pedido('en_preparacion'))
    expect(mensaje()).toBe('Tu pedido de Hamburguesa doble está en preparación')
    llega(pedido('listo'))

    expect(mensaje()).toBe('Tu pedido de Hamburguesa doble está listo para servir')
  })
})
