import { api, ApiError, pedirJson } from './api'
import { irAlLoginSimulado, reiniciarSesionDePrueba, sesionDePrueba } from '../test/authClient'

vi.mock('@menyu/auth-client', async () => (await import('../test/authClient')).moduloSimulado())

const fetchFalso = vi.fn()

function respuesta(cuerpo: unknown = {}, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(cuerpo) } as Response
}

beforeEach(() => {
  fetchFalso.mockReset()
  fetchFalso.mockResolvedValue(respuesta({}))
  vi.stubGlobal('fetch', fetchFalso)
  reiniciarSesionDePrueba()
})

afterEach(() => vi.unstubAllGlobals())

const llamadas = () =>
  fetchFalso.mock.calls.map(([url, opciones]) => ({
    url: url as string,
    autorizacion: (opciones as RequestInit).headers as Record<string, string>,
  }))

describe('el cliente de la API usa la sesión de Supabase', () => {
  it('manda el access token de la cookie, no de localStorage', async () => {
    sesionDePrueba.token = 'token-de-supabase'
    localStorage.setItem('menyu_access_token', 'token-legacy')

    await api.restaurantes.list()

    expect(llamadas()[0]?.autorizacion['Authorization']).toBe('Bearer token-de-supabase')
  })

  it('sin sesión no manda Authorization', async () => {
    sesionDePrueba.token = null

    await api.restaurantes.list()

    expect(llamadas()[0]?.autorizacion['Authorization']).toBeUndefined()
  })

  it('un cuerpo viaja como JSON', async () => {
    await api.categorias.create({ nombre: 'Entradas', restauranteId: 'rest-1' })

    const [, opciones] = fetchFalso.mock.calls[0] as [string, RequestInit]
    expect(opciones.body).toBe(JSON.stringify({ nombre: 'Entradas', restauranteId: 'rest-1' }))
    expect((opciones.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })

  it('un 204 no intenta leer el cuerpo', async () => {
    fetchFalso.mockResolvedValue({
      ok: true,
      status: 204,
      json: () => Promise.reject(new Error('no hay cuerpo')),
    } as unknown as Response)

    await expect(api.items.delete('item-1')).resolves.toBeUndefined()
  })

  describe('ante un 401', () => {
    it('renueva la sesión y reintenta una sola vez', async () => {
      sesionDePrueba.token = 'token-vencido'
      sesionDePrueba.tokenRenovado = 'token-nuevo'
      fetchFalso
        .mockResolvedValueOnce(respuesta({ message: 'No autorizado' }, false, 401))
        .mockResolvedValueOnce(respuesta([{ id: 'rest-1' }]))

      await expect(api.restaurantes.list()).resolves.toEqual([{ id: 'rest-1' }])

      expect(fetchFalso).toHaveBeenCalledTimes(2)
      expect(llamadas()[0]?.autorizacion['Authorization']).toBe('Bearer token-vencido')
      expect(llamadas()[1]?.autorizacion['Authorization']).toBe('Bearer token-nuevo')
      expect(irAlLoginSimulado).not.toHaveBeenCalled()
    })

    it('si el reintento también da 401, el error llega al llamador y no reintenta de nuevo', async () => {
      sesionDePrueba.tokenRenovado = 'token-nuevo'
      fetchFalso.mockResolvedValue(respuesta({ message: 'No autorizado' }, false, 401))

      await expect(api.restaurantes.list()).rejects.toMatchObject({ name: 'ApiError', status: 401 })

      expect(fetchFalso).toHaveBeenCalledTimes(2)
      expect(irAlLoginSimulado).not.toHaveBeenCalled()
    })

    it('si no se puede renovar, va al login y avisa que la sesión expiró', async () => {
      sesionDePrueba.tokenRenovado = null
      fetchFalso.mockResolvedValue(respuesta({ message: 'No autorizado' }, false, 401))

      await expect(api.restaurantes.list()).rejects.toMatchObject({
        name: 'ApiError',
        status: 401,
        message: 'Sesión expirada',
      })

      expect(irAlLoginSimulado).toHaveBeenCalledTimes(1)
      expect(fetchFalso).toHaveBeenCalledTimes(1)
    })
  })

  it('un error del servidor llega con su código y su mensaje, y sin mensaje usa el código', async () => {
    fetchFalso.mockResolvedValue(respuesta({ message: 'Ya existe' }, false, 409))
    await expect(api.categorias.create({ nombre: 'A', restauranteId: 'r' })).rejects.toMatchObject({
      status: 409,
      message: 'Ya existe',
    })

    fetchFalso.mockResolvedValue({ ok: false, status: 500, json: () => Promise.reject(new Error('x')) } as unknown as Response)
    await expect(api.restaurantes.list()).rejects.toMatchObject({ status: 500, message: 'Error 500' })
  })

  describe('upload', () => {
    it('manda el archivo con el token y sin Content-Type propio', async () => {
      sesionDePrueba.token = 'token-de-supabase'
      fetchFalso.mockResolvedValue(respuesta({ logoUrl: 'https://x/logo.png' }))

      await api.marcas.uploadLogo('marca-1', new File(['x'], 'logo.png', { type: 'image/png' }))

      const [url, opciones] = fetchFalso.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('/marcas/marca-1/logo')
      expect(opciones.body).toBeInstanceOf(FormData)
      expect((opciones.body as FormData).get('logo')).toBeInstanceOf(File)
      const encabezados = opciones.headers as Record<string, string>
      expect(encabezados['Authorization']).toBe('Bearer token-de-supabase')
      expect(encabezados['Content-Type']).toBeUndefined()
    })

    it('también renueva la sesión ante un 401', async () => {
      sesionDePrueba.tokenRenovado = 'token-nuevo'
      fetchFalso
        .mockResolvedValueOnce(respuesta({}, false, 401))
        .mockResolvedValueOnce(respuesta({ logoUrl: 'https://x/logo.png' }))

      await expect(
        api.marcas.uploadLogo('marca-1', new File(['x'], 'logo.png', { type: 'image/png' })),
      ).resolves.toEqual({ logoUrl: 'https://x/logo.png' })

      expect(llamadas()[1]?.autorizacion['Authorization']).toBe('Bearer token-nuevo')
    })

    it('un 413 del servidor llega como ApiError', async () => {
      fetchFalso.mockResolvedValue(respuesta({ message: 'La imagen supera los 5 MB' }, false, 413))

      await expect(
        api.items.uploadImage('item-1', new File(['x'], 'foto.png', { type: 'image/png' })),
      ).rejects.toMatchObject({ status: 413, message: 'La imagen supera los 5 MB' })
    })
  })

  describe('pedirJson', () => {
    it('lo usan las pantallas que arman su propio pedido, con el mismo token y el mismo 401', async () => {
      sesionDePrueba.token = 'token-de-supabase'
      fetchFalso.mockResolvedValue(respuesta({ ok: true }))

      await pedirJson('/sessions/s1/cobro', { method: 'PATCH', body: JSON.stringify({ metodoPago: 'efectivo' }) })

      const [url, opciones] = fetchFalso.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('/sessions/s1/cobro')
      expect((opciones.headers as Record<string, string>)['Authorization']).toBe('Bearer token-de-supabase')
      expect((opciones.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    })

    it('respeta un Content-Type propio', async () => {
      await pedirJson('/x', { method: 'POST', body: 'a=1', headers: { 'Content-Type': 'text/plain' } })

      const [, opciones] = fetchFalso.mock.calls[0] as [string, RequestInit]
      expect((opciones.headers as Record<string, string>)['Content-Type']).toBe('text/plain')
    })

    it('un error del servidor es un ApiError', async () => {
      fetchFalso.mockResolvedValue(respuesta({ message: 'No se pudo cobrar' }, false, 409))

      const error = await pedirJson('/x', { method: 'POST', body: '{}' }).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(ApiError)
      expect(error).toMatchObject({ status: 409, message: 'No se pudo cobrar' })
    })
  })
})
