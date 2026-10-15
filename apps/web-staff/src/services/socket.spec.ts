import { TOKEN_KEY } from '@menyu/auth'

const { ioMock } = vi.hoisted(() => ({ ioMock: vi.fn() }))
vi.mock('socket.io-client', () => ({ io: ioMock }))

type Handler = (...args: unknown[]) => void

function crearSocketFalso() {
  const handlers = new Map<string, Handler[]>()
  return {
    connected: false,
    on: vi.fn((evento: string, cb: Handler) => { handlers.set(evento, [...(handlers.get(evento) ?? []), cb]) }),
    off: vi.fn(),
    emit: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    disparar(evento: string, ...args: unknown[]) { handlers.get(evento)?.forEach((cb) => cb(...args)) },
  }
}

const jwtDe = (payload: object) => `h.${btoa(JSON.stringify(payload))}.s`
const vaciar = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

// El módulo guarda el socket en una variable propia: se recarga para cada test.
async function cargar() {
  vi.resetModules()
  const falso = crearSocketFalso()
  ioMock.mockReset()
  ioMock.mockReturnValue(falso)
  const socket = await import('./socket')
  const { useTiempoRealStore } = await import('../store/tiempoRealStore')
  return { socket, falso, store: useTiempoRealStore }
}

describe('services/socket', () => {
  beforeEach(() => { localStorage.clear() })

  it('auth es una función que devuelve el token vigente en cada intento de conexión', async () => {
    const { socket } = await cargar()
    socket.onMozoCalled(() => {})
    const opciones = ioMock.mock.calls[0][1] as { auth: (cb: (datos: unknown) => void) => void }

    localStorage.setItem(TOKEN_KEY, 'token-1')
    const primero = vi.fn()
    opciones.auth(primero)
    expect(primero).toHaveBeenCalledWith({ token: 'token-1' })

    localStorage.setItem(TOKEN_KEY, 'token-2')
    const segundo = vi.fn()
    opciones.auth(segundo)
    expect(segundo).toHaveBeenCalledWith({ token: 'token-2' })
  })

  it('cocina:join se vuelve a emitir en cada conexión, no solo en la primera', async () => {
    const { socket, falso } = await cargar()
    socket.joinRestauranteComoCocina('r1')
    expect(falso.emit).not.toHaveBeenCalled()

    falso.disparar('connect')
    expect(falso.emit).toHaveBeenCalledTimes(1)
    expect(falso.emit).toHaveBeenLastCalledWith('cocina:join', { restauranteId: 'r1' })

    falso.disparar('connect')
    expect(falso.emit).toHaveBeenCalledTimes(2)
  })

  it('un mozo no emite ningún join para su room: la asigna el servidor', async () => {
    localStorage.setItem(TOKEN_KEY, jwtDe({ sub: 'm1', tipo: 'mozo' }))
    const { socket, falso } = await cargar()

    falso.connected = true
    socket.joinRestauranteComoMozo('r1')
    falso.disparar('connect')

    expect(falso.emit).not.toHaveBeenCalled()
  })

  it('un admin en el panel del mozo emite admin:join en cada conexión', async () => {
    localStorage.setItem(TOKEN_KEY, jwtDe({ sub: 'a1', tipo: 'admin', rol: 'GERENTE' }))
    const { socket, falso } = await cargar()

    socket.joinRestauranteComoMozo('r1')
    falso.disparar('connect')
    falso.disparar('connect')

    expect(falso.emit).toHaveBeenCalledTimes(2)
    expect(falso.emit).toHaveBeenLastCalledWith('admin:join', { restauranteId: 'r1' })
  })

  it('un rechazo que no se puede reconectar marca "sin tiempo real" y la siguiente conexión lo restablece', async () => {
    const { socket, falso, store } = await cargar()
    socket.onMozoCalled(() => {})

    falso.disparar('disconnect', 'io server disconnect')
    await vaciar()
    expect(store.getState().sinTiempoReal).toBe(true)

    falso.disparar('connect')
    expect(store.getState().sinTiempoReal).toBe(false)
  })
})
