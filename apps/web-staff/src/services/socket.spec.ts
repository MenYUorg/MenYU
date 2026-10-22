import {
  cerrarSesion,
  disconnect,
  joinRestauranteComoCocina,
  joinRestauranteComoMozo,
} from './socket'
import { logoutSimulado, reiniciarSesionDePrueba } from '../test/authClient'

vi.mock('@menyu/auth-client', async () => (await import('../test/authClient')).moduloSimulado())

// `vi.mock` se eleva arriba de todo, así que el socket falso se define con `vi.hoisted` para existir antes.
const { ioFalso, socketFalso } = vi.hoisted(() => {
  const socketFalso = {
    connected: false,
    emit: vi.fn(),
    once: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    disconnect: vi.fn(),
  }
  return { socketFalso, ioFalso: vi.fn(() => socketFalso) }
})

vi.mock('socket.io-client', () => ({ io: ioFalso, Socket: class {} }))

beforeEach(() => {
  // El socket es un singleton del módulo: `disconnect()` lo descarta para que cada test abra su propia conexión.
  disconnect()
  socketFalso.connected = false
  ioFalso.mockClear()
  socketFalso.emit.mockClear()
  socketFalso.once.mockClear()
  socketFalso.disconnect.mockClear()
  reiniciarSesionDePrueba()
})

describe('el socket de web-staff', () => {
  it('conecta sin mandar ningún token: el gateway no autentica la conexión', () => {
    joinRestauranteComoMozo('rest-1')

    expect(ioFalso).toHaveBeenCalledTimes(1)
    const [, opciones] = ioFalso.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(opciones).toEqual({ transports: ['websocket'] })
    expect(opciones['auth']).toBeUndefined()
  })

  it('reusa la misma conexión para el mozo y para la cocina', () => {
    joinRestauranteComoMozo('rest-1')
    joinRestauranteComoCocina('rest-1')

    expect(ioFalso).toHaveBeenCalledTimes(1)
  })

  it('si ya está conectado, se une al restaurante al instante', () => {
    socketFalso.connected = true

    joinRestauranteComoMozo('rest-1')

    expect(socketFalso.emit).toHaveBeenCalledWith('mozo:join', { restauranteId: 'rest-1' })
  })

  it('si todavía no conectó, se une al restaurante recién al conectar', () => {
    joinRestauranteComoCocina('rest-1')

    expect(socketFalso.emit).not.toHaveBeenCalled()
    expect(socketFalso.once).toHaveBeenCalledWith('connect', expect.any(Function))
    const alConectar = socketFalso.once.mock.calls[0]?.[1] as () => void
    alConectar()
    expect(socketFalso.emit).toHaveBeenCalledWith('cocina:join', { restauranteId: 'rest-1' })
  })

  it('cerrar sesión desconecta el socket antes de irse a web-auth', async () => {
    socketFalso.connected = true
    joinRestauranteComoMozo('rest-1')

    await cerrarSesion()

    expect(socketFalso.disconnect).toHaveBeenCalledTimes(1)
    expect(logoutSimulado).toHaveBeenCalledTimes(1)
  })

  it('después de cerrar sesión, la próxima suscripción abre una conexión nueva', async () => {
    joinRestauranteComoMozo('rest-1')
    await cerrarSesion()

    joinRestauranteComoMozo('rest-1')

    expect(ioFalso).toHaveBeenCalledTimes(2)
  })
})
