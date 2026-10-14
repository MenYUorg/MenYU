import { api, ApiError } from './api'

const fetchFalso = vi.fn()

/** Respuesta de `fetch` con ese código y ese cuerpo JSON. */
const respuesta = (status: number, cuerpo?: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: () => (cuerpo === undefined ? Promise.reject(new Error('sin cuerpo')) : Promise.resolve(cuerpo)) }) as Response

describe('api', () => {
  beforeEach(() => {
    fetchFalso.mockReset()
    vi.stubGlobal('fetch', fetchFalso)
  })

  afterEach(() => vi.unstubAllGlobals())

  describe('discovery.restaurante', () => {
    it('pide el restaurante por su id', async () => {
      fetchFalso.mockResolvedValue(respuesta(200, { restaurante: { id: 'abc' }, ofertas: [] }))

      const detalle = await api.discovery.restaurante('abc')

      expect(fetchFalso).toHaveBeenCalledTimes(1)
      expect(fetchFalso.mock.calls[0]?.[0]).toMatch(/\/discovery\/restaurantes\/abc$/)
      expect(fetchFalso.mock.calls[0]?.[1]).toMatchObject({ method: 'GET' })
      expect(detalle.restaurante.id).toBe('abc')
    })

    it('un id con caracteres raros (por ejemplo, el de un link mal escrito) no cambia la ruta pedida', async () => {
      fetchFalso.mockResolvedValue(respuesta(404, { message: 'Restaurante no encontrado' }))

      await expect(api.discovery.restaurante('a/b?c=d#e')).rejects.toBeInstanceOf(ApiError)

      expect(fetchFalso.mock.calls[0]?.[0]).toMatch(/\/discovery\/restaurantes\/a%2Fb%3Fc%3Dd%23e$/)
    })

    it('un 404 llega con su código y el mensaje del servidor', async () => {
      fetchFalso.mockResolvedValue(respuesta(404, { message: 'Restaurante no encontrado' }))

      await expect(api.discovery.restaurante('x')).rejects.toMatchObject({ status: 404, message: 'Restaurante no encontrado' })
    })
  })

  describe('sessions.open', () => {
    const cuerpoEnviado = () => JSON.parse(fetchFalso.mock.calls[0]?.[1]?.body as string) as Record<string, unknown>

    it('el código del QR se manda como tableCode, junto con el restaurante elegido', async () => {
      fetchFalso.mockResolvedValue(respuesta(200, { sesionId: 's' }))

      await api.sessions.open({ qrToken: 'qr-1', restauranteId: 'rest-1' })

      expect(fetchFalso.mock.calls[0]?.[0]).toMatch(/\/sessions\/open$/)
      expect(fetchFalso.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' })
      expect(cuerpoEnviado()).toEqual({ tableCode: 'qr-1', restauranteId: 'rest-1' })
    })

    it('el PIN se manda con el restaurante', async () => {
      fetchFalso.mockResolvedValue(respuesta(200, { sesionId: 's' }))

      await api.sessions.open({ pin: '4821', restauranteId: 'rest-1' })

      expect(cuerpoEnviado()).toEqual({ pin: '4821', restauranteId: 'rest-1' })
    })

    it('sin restaurante (el QR impreso de la mesa) no manda ninguno', async () => {
      fetchFalso.mockResolvedValue(respuesta(200, { sesionId: 's' }))

      await api.sessions.open({ qrToken: 'qr-1' })

      expect(cuerpoEnviado()).toEqual({ tableCode: 'qr-1' })
    })

    it('un 409 (el QR es de otro restaurante) llega con su código', async () => {
      fetchFalso.mockResolvedValue(respuesta(409, { message: 'Ese QR no es de este restaurante' }))

      await expect(api.sessions.open({ qrToken: 'qr-1', restauranteId: 'rest-2' })).rejects.toMatchObject({
        name: 'ApiError',
        status: 409,
        message: 'Ese QR no es de este restaurante',
      })
    })

    it('sin conexión el error no trae código', async () => {
      fetchFalso.mockRejectedValue(new TypeError('Failed to fetch'))

      const error: unknown = await api.sessions.open({ qrToken: 'qr-1' }).catch((e: unknown) => e)

      expect(error).toBeInstanceOf(TypeError)
      expect((error as { status?: unknown }).status).toBeUndefined()
    })
  })
})
