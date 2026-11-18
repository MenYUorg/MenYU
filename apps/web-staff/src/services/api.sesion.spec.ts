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

  it('el cobro manda la caja y la propina cuando las hay (#358)', async () => {
    await api.sesiones.registrarCobro('sesion-1', { metodoPago: 'debito', cajaId: 'caja-2', propina: 150.5 })

    const [, opciones] = fetchFalso.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(opciones.body as string)).toEqual({ metodoPago: 'debito', cajaId: 'caja-2', propina: 150.5 })
  })

  it('las cajas abiertas se piden por restaurante (#359)', async () => {
    fetchFalso.mockResolvedValue(respuesta({ cajas: [{ cajaId: 'caja-1', nombre: 'Principal' }] }))

    await expect(api.cajas.abiertas('rest 1')).resolves.toEqual({ cajas: [{ cajaId: 'caja-1', nombre: 'Principal' }] })
    expect(llamadas()[0]?.url).toBe('/cajas/abiertas?restauranteId=rest%201')
  })

  describe('el turno de caja (#359)', () => {
    const pedido = () => {
      const [url, opciones] = fetchFalso.mock.calls[0] as [string, RequestInit]
      return { url, metodo: opciones.method ?? 'GET', body: opciones.body === undefined ? undefined : JSON.parse(opciones.body as string) }
    }

    it('todas las cajas del restaurante se piden por restaurante, con GET', async () => {
      await api.cajas.todas('rest 1')

      expect(pedido()).toEqual({ url: '/cajas?restauranteId=rest%201', metodo: 'GET', body: undefined })
    })

    it('el turno actual se pide por restaurante, con GET', async () => {
      fetchFalso.mockResolvedValue(respuesta({ turno: null }))

      await expect(api.turnos.actual('rest 1')).resolves.toEqual({ turno: null })
      expect(pedido()).toEqual({ url: '/turnos/actual?restauranteId=rest%201', metodo: 'GET', body: undefined })
    })

    it('la preparación del turno se pide por restaurante, con GET', async () => {
      await api.turnos.preparacion('rest 1')

      expect(pedido()).toEqual({ url: '/turnos/preparacion?restauranteId=rest%201', metodo: 'GET', body: undefined })
    })

    it('abrir el turno es un POST con el body tal cual, fondo 0 y asignaciones vacías incluidos', async () => {
      const body = {
        restauranteId: 'rest-1',
        cajas: [{ cajaId: 'caja-1', fondoInicial: 0 }],
        asignaciones: [],
        observaciones: 'Turno noche',
      }

      await api.turnos.abrir(body)

      expect(pedido()).toEqual({ url: '/turnos', metodo: 'POST', body })
    })

    it('reasignar las mesas es un PUT con la lista entera', async () => {
      const asignaciones = [{ mesaId: 'mesa-1', mozoId: 'mozo-1' }]

      await api.turnos.reasignar('turno/1', asignaciones)

      expect(pedido()).toEqual({ url: '/turnos/turno%2F1/asignaciones', metodo: 'PUT', body: { asignaciones } })
    })

    it('el detalle del turno se pide por su id, con GET', async () => {
      await api.turnos.detalle('turno/1')

      expect(pedido()).toEqual({ url: '/turnos/turno%2F1', metodo: 'GET', body: undefined })
    })

    it('registrar un movimiento es un POST al turno con la caja, el tipo, el monto y el motivo', async () => {
      const body = { cajaId: 'caja-1', tipo: 'EGRESO' as const, monto: 1500.5, motivo: 'Compra de hielo' }

      await api.turnos.registrarMovimiento('turno/1', body)

      expect(pedido()).toEqual({ url: '/turnos/turno%2F1/movimientos', metodo: 'POST', body })
    })

    it('cerrar el turno es un POST al turno con lo declarado de cada caja y las observaciones', async () => {
      const body = {
        cajas: [{ cajaId: 'caja-1', declarado: { efectivo: 1500.5, debito: 0, credito: 0, transferencia: 200 } }],
        observaciones: 'Faltó cambio',
      }

      await api.turnos.cerrar('turno/1', body)

      expect(pedido()).toEqual({ url: '/turnos/turno%2F1/cierre', metodo: 'POST', body })
    })

    it('el resumen del turno se pide por su id, con GET', async () => {
      await api.turnos.resumen('turno/1')

      expect(pedido()).toEqual({ url: '/turnos/turno%2F1/resumen', metodo: 'GET', body: undefined })
    })
  })
})
