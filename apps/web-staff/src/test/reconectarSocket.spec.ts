import { reconectarSiRechazaElServidor, refrescarTokens, TOKEN_KEY, REFRESH_KEY } from '@menyu/auth'

const vaciar = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

function crearSocket() {
  const handlers = new Map<string, (motivo: string) => void>()
  return {
    on: vi.fn((evento: string, cb: (motivo: string) => void) => { handlers.set(evento, cb) }),
    connect: vi.fn(),
    desconectarPor: (motivo: string) => handlers.get('disconnect')?.(motivo),
  }
}

const tokensOk = () => ({
  ok: true,
  status: 200,
  json: async () => ({ accessToken: 'nuevo-a', refreshToken: 'nuevo-r' }),
})
const tokensRechazados = () => ({
  ok: false,
  status: 401,
  json: async () => ({ message: 'Refresh token inválido o expirado' }),
})

describe('refresh de tokens y reconexión del socket', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem(TOKEN_KEY, 'viejo-a')
    localStorage.setItem(REFRESH_KEY, 'viejo-r')
    fetchMock = vi.fn().mockResolvedValue(tokensOk())
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('reconectarSiRechazaElServidor', () => {
    it('rechazo del servidor → renueva los tokens y reconecta', async () => {
      const socket = crearSocket()
      const onSinTiempoReal = vi.fn()
      reconectarSiRechazaElServidor(socket, onSinTiempoReal)

      socket.desconectarPor('io server disconnect')
      await vaciar()

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ refreshToken: 'viejo-r' })
      expect(localStorage.getItem(TOKEN_KEY)).toBe('nuevo-a')
      expect(localStorage.getItem(REFRESH_KEY)).toBe('nuevo-r')
      expect(socket.connect).toHaveBeenCalledTimes(1)
      expect(onSinTiempoReal).not.toHaveBeenCalled()
    })

    it('dos rechazos dentro de 30 s → onSinTiempoReal, sin un tercer intento', async () => {
      const ahora = vi.spyOn(Date, 'now')
      const socket = crearSocket()
      const onSinTiempoReal = vi.fn()
      reconectarSiRechazaElServidor(socket, onSinTiempoReal)

      ahora.mockReturnValue(1_000_000)
      socket.desconectarPor('io server disconnect')
      await vaciar()
      expect(socket.connect).toHaveBeenCalledTimes(1)
      expect(onSinTiempoReal).not.toHaveBeenCalled()

      ahora.mockReturnValue(1_010_000)
      socket.desconectarPor('io server disconnect')
      await vaciar()
      expect(onSinTiempoReal).toHaveBeenCalledTimes(1)

      ahora.mockReturnValue(1_020_000)
      socket.desconectarPor('io server disconnect')
      await vaciar()

      expect(onSinTiempoReal).toHaveBeenCalledTimes(2)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(socket.connect).toHaveBeenCalledTimes(1)
    })

    it('refresh fallido → onSinTiempoReal, sin reconectar y sin borrar los tokens', async () => {
      fetchMock.mockResolvedValue(tokensRechazados())
      const socket = crearSocket()
      const onSinTiempoReal = vi.fn()
      reconectarSiRechazaElServidor(socket, onSinTiempoReal)

      socket.desconectarPor('io server disconnect')
      await vaciar()

      expect(onSinTiempoReal).toHaveBeenCalledTimes(1)
      expect(socket.connect).not.toHaveBeenCalled()
      expect(localStorage.getItem(TOKEN_KEY)).toBe('viejo-a')
      expect(localStorage.getItem(REFRESH_KEY)).toBe('viejo-r')
    })

    it('sin refresh token guardado → onSinTiempoReal sin hacer ninguna request', async () => {
      localStorage.removeItem(REFRESH_KEY)
      const socket = crearSocket()
      const onSinTiempoReal = vi.fn()
      reconectarSiRechazaElServidor(socket, onSinTiempoReal)

      socket.desconectarPor('io server disconnect')
      await vaciar()

      expect(fetchMock).not.toHaveBeenCalled()
      expect(onSinTiempoReal).toHaveBeenCalledTimes(1)
      expect(socket.connect).not.toHaveBeenCalled()
    })

    it('desconexión por otro motivo (transport close) → no hace nada', async () => {
      const socket = crearSocket()
      const onSinTiempoReal = vi.fn()
      reconectarSiRechazaElServidor(socket, onSinTiempoReal)

      socket.desconectarPor('transport close')
      await vaciar()

      expect(fetchMock).not.toHaveBeenCalled()
      expect(socket.connect).not.toHaveBeenCalled()
      expect(onSinTiempoReal).not.toHaveBeenCalled()
    })
  })

  describe('refrescarTokens', () => {
    it('dos llamadas simultáneas → una sola request y el mismo resultado', async () => {
      const [a, b] = await Promise.all([refrescarTokens(), refrescarTokens()])

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(a).toBe('nuevo-a')
      expect(b).toBe('nuevo-a')
    })

    it('terminada una renovación, la siguiente vuelve a pedir tokens', async () => {
      await refrescarTokens()
      await vaciar()
      await refrescarTokens()

      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ refreshToken: 'nuevo-r' })
    })
  })
})
