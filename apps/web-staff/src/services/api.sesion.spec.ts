import { api, ApiError } from './api'
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
    encabezados: (opciones as RequestInit).headers as Record<string, string>,
  }))

describe('el cliente de la API usa la sesión de Supabase', () => {
  it('manda el access token de la cookie, no de localStorage', async () => {
    sesionDePrueba.token = 'token-de-supabase'
    localStorage.setItem('menyu_access_token', 'token-legacy')

    await api.mesas.getAll('rest-1')

    expect(llamadas()[0]?.url).toBe('/mesas?restauranteId=rest-1')
    expect(llamadas()[0]?.encabezados['Authorization']).toBe('Bearer token-de-supabase')
  })

  it('sin sesión no manda Authorization', async () => {
    sesionDePrueba.token = null

    await api.mesas.getAll('rest-1')

    expect(llamadas()[0]?.encabezados['Authorization']).toBeUndefined()
  })

  it('un cuerpo viaja como JSON', async () => {
    await api.sesiones.abrir('mesa-1')

    const [url, opciones] = fetchFalso.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/sessions/open-staff')
    expect(opciones.body).toBe(JSON.stringify({ mesaId: 'mesa-1' }))
    expect((opciones.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })

  it('un 204 no intenta leer el cuerpo', async () => {
    fetchFalso.mockResolvedValue({
      ok: true,
      status: 204,
      json: () => Promise.reject(new Error('no hay cuerpo')),
    } as unknown as Response)

    await expect(api.waiterCalls.atender('llamado-1')).resolves.toBeUndefined()
  })

  describe('ante un 401', () => {
    it('renueva la sesión y reintenta una sola vez', async () => {
      sesionDePrueba.token = 'token-vencido'
      sesionDePrueba.tokenRenovado = 'token-nuevo'
      fetchFalso
        .mockResolvedValueOnce(respuesta({ message: 'No autorizado' }, false, 401))
        .mockResolvedValueOnce(respuesta([{ id: 'mesa-1' }]))

      await expect(api.mesas.getAll('rest-1')).resolves.toEqual([{ id: 'mesa-1' }])

      expect(fetchFalso).toHaveBeenCalledTimes(2)
      expect(llamadas()[0]?.encabezados['Authorization']).toBe('Bearer token-vencido')
      expect(llamadas()[1]?.encabezados['Authorization']).toBe('Bearer token-nuevo')
      expect(irAlLoginSimulado).not.toHaveBeenCalled()
    })

    it('si el reintento también da 401, el error llega al llamador y no reintenta de nuevo', async () => {
      sesionDePrueba.tokenRenovado = 'token-nuevo'
      fetchFalso.mockResolvedValue(respuesta({ message: 'No autorizado' }, false, 401))

      await expect(api.mesas.getAll('rest-1')).rejects.toMatchObject({ name: 'ApiError', status: 401 })

      expect(fetchFalso).toHaveBeenCalledTimes(2)
      expect(irAlLoginSimulado).not.toHaveBeenCalled()
    })

    it('si no se puede renovar, va al login y avisa que la sesión expiró', async () => {
      sesionDePrueba.tokenRenovado = null
      fetchFalso.mockResolvedValue(respuesta({ message: 'No autorizado' }, false, 401))

      await expect(api.mesas.getAll('rest-1')).rejects.toMatchObject({
        name: 'ApiError',
        status: 401,
        message: 'Sesión expirada',
      })

      expect(irAlLoginSimulado).toHaveBeenCalledTimes(1)
      expect(fetchFalso).toHaveBeenCalledTimes(1)
    })
  })

  it('un error del servidor llega con su código y su mensaje, y sin mensaje usa el código', async () => {
    fetchFalso.mockResolvedValue(respuesta({ message: 'La mesa ya tiene una sesión' }, false, 409))
    const error = await api.sesiones.abrir('mesa-1').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, message: 'La mesa ya tiene una sesión' })

    fetchFalso.mockResolvedValue({ ok: false, status: 500, json: () => Promise.reject(new Error('x')) } as unknown as Response)
    await expect(api.mesas.getAll('rest-1')).rejects.toMatchObject({ status: 500, message: 'Error 500' })
  })

  it('el cobro de una sesión manda solo el método de pago: quién cobra lo deduce el backend', async () => {
    await api.sesiones.registrarCobro('sesion-1', { metodoPago: 'efectivo' })

    const [url, opciones] = fetchFalso.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/sessions/sesion-1/cobro')
    expect(opciones.method).toBe('PATCH')
    expect(JSON.parse(opciones.body as string)).toEqual({ metodoPago: 'efectivo' })
  })
})
