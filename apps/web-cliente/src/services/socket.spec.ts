import { useSessionStore } from '../store/sessionStore'

const { ioMock } = vi.hoisted(() => ({ ioMock: vi.fn() }))
vi.mock('socket.io-client', () => ({ io: ioMock }))

type Handler = (...args: unknown[]) => void

function crearSocketFalso() {
  const handlers = new Map<string, Handler[]>()
  return {
    on: vi.fn((evento: string, cb: Handler) => { handlers.set(evento, [...(handlers.get(evento) ?? []), cb]) }),
    off: vi.fn(),
    emit: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    disparar(evento: string, ...args: unknown[]) { handlers.get(evento)?.forEach((cb) => cb(...args)) },
  }
}

// El módulo guarda la conexión en una variable propia: se recarga para cada test.
async function cargar() {
  vi.resetModules()
  ioMock.mockReset()
  const sockets: ReturnType<typeof crearSocketFalso>[] = []
  ioMock.mockImplementation(() => {
    const falso = crearSocketFalso()
    sockets.push(falso)
    return falso
  })
  const socket = await import('./socket')
  const { useTiempoRealStore } = await import('../store/tiempoRealStore')
  const { useSessionStore: sessionStore } = await import('../store/sessionStore')
  return { socket, sockets, store: useTiempoRealStore, sessionStore }
}

describe('services/socket (web-cliente)', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    useSessionStore.setState({ jwt: null })
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('sin JWT de sesión no crea ningún socket y suscribir no hace nada', async () => {
    const { socket } = await cargar()
    const unsub = socket.onSesionCerrada(() => {})
    expect(ioMock).not.toHaveBeenCalled()
    expect(() => unsub()).not.toThrow()
  })

  it('auth es una función que devuelve el JWT de sesión vigente en cada intento de conexión', async () => {
    const { socket, sessionStore } = await cargar()
    sessionStore.setState({ jwt: 'jwt-1' })
    socket.onSesionCerrada(() => {})
    const opciones = ioMock.mock.calls[0][1] as { auth: (cb: (datos: unknown) => void) => void }

    const primero = vi.fn()
    opciones.auth(primero)
    expect(primero).toHaveBeenCalledWith({ token: 'jwt-1' })

    sessionStore.setState({ jwt: 'jwt-1b' })
    const segundo = vi.fn()
    opciones.auth(segundo)
    expect(segundo).toHaveBeenCalledWith({ token: 'jwt-1b' })
  })

  it('dos suscripciones comparten un solo socket y no se emite ningún session:join', async () => {
    const { socket, sockets, sessionStore } = await cargar()
    sessionStore.setState({ jwt: 'jwt-1' })

    socket.onSesionCerrada(() => {})
    socket.onPedidoActualizado(() => {})
    sockets[0].disparar('connect')

    expect(ioMock).toHaveBeenCalledTimes(1)
    expect(sockets[0].emit).not.toHaveBeenCalled()
  })

  it('al soltar la última suscripción se desconecta el socket', async () => {
    const { socket, sockets, sessionStore } = await cargar()
    sessionStore.setState({ jwt: 'jwt-1' })
    const unsubA = socket.onSesionCerrada(() => {})
    const unsubB = socket.onMenuActualizado(() => {})

    unsubA()
    expect(sockets[0].disconnect).not.toHaveBeenCalled()
    unsubB()
    expect(sockets[0].disconnect).toHaveBeenCalledTimes(1)
  })

  it('si cambia el JWT de sesión, la siguiente suscripción cierra el socket viejo y abre uno nuevo', async () => {
    const { socket, sockets, sessionStore } = await cargar()
    sessionStore.setState({ jwt: 'jwt-1' })
    socket.onSesionCerrada(() => {})

    sessionStore.setState({ jwt: 'jwt-2' })
    socket.onSesionCerrada(() => {})

    expect(sockets).toHaveLength(2)
    expect(sockets[0].disconnect).toHaveBeenCalledTimes(1)
    expect(sockets[1].disconnect).not.toHaveBeenCalled()
  })

  it('un rechazo del servidor marca "sin tiempo real" y nada más: no reconecta ni pide tokens', async () => {
    const { socket, sockets, store, sessionStore } = await cargar()
    sessionStore.setState({ jwt: 'jwt-1' })
    socket.onSesionCerrada(() => {})

    sockets[0].disparar('disconnect', 'io server disconnect')
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    expect(store.getState().sinTiempoReal).toBe(true)
    expect(sockets[0].connect).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('una desconexión por otro motivo (transport close) no marca nada', async () => {
    const { socket, sockets, store, sessionStore } = await cargar()
    sessionStore.setState({ jwt: 'jwt-1' })
    socket.onSesionCerrada(() => {})

    sockets[0].disparar('disconnect', 'transport close')

    expect(store.getState().sinTiempoReal).toBe(false)
  })

  it('la siguiente conexión restablece el aviso', async () => {
    const { socket, sockets, store, sessionStore } = await cargar()
    sessionStore.setState({ jwt: 'jwt-1' })
    socket.onSesionCerrada(() => {})
    sockets[0].disparar('disconnect', 'io server disconnect')
    expect(store.getState().sinTiempoReal).toBe(true)

    sockets[0].disparar('connect')

    expect(store.getState().sinTiempoReal).toBe(false)
  })
})
