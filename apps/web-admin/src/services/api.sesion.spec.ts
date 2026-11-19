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

  describe('personal e invitaciones', () => {
    it('lista el personal de un restaurante', async () => {
      fetchFalso.mockResolvedValue(respuesta({ duenos: [], miembros: [], sinCuenta: [] }))

      await expect(api.personal.listar('rest-1')).resolves.toEqual({ duenos: [], miembros: [], sinCuenta: [] })

      const [url, opciones] = fetchFalso.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('/restaurantes/rest-1/personal')
      expect(opciones.method).toBe('GET')
    })

    it('quitar el acceso usa la membresía, y los ids raros no se escapan de la ruta', async () => {
      fetchFalso.mockResolvedValue({ ok: true, status: 204, json: () => Promise.reject(new Error('sin cuerpo')) } as unknown as Response)

      await expect(api.personal.quitarAcceso('rest-1', 'mem-1')).resolves.toBeUndefined()
      expect((fetchFalso.mock.calls[0] as [string, RequestInit])[0]).toBe('/restaurantes/rest-1/personal/mem-1')

      await api.personal.quitarAcceso('../../root/marcas', 'x?y=1')
      expect((fetchFalso.mock.calls[1] as [string, RequestInit])[0]).toBe(
        '/restaurantes/..%2F..%2Froot%2Fmarcas/personal/x%3Fy%3D1',
      )
    })

    it('la invitación manda el email, el nombre, el rol y el ámbito', async () => {
      fetchFalso.mockResolvedValue(respuesta({ usuarioId: 'u-1', membresiaId: 'mem-1', invitacionEnviada: true }))

      await api.invitaciones.crear({ email: 'sol@menyu.com', nombre: 'Sol', rol: 'MOZO', restauranteId: 'rest-1' })

      const [url, opciones] = fetchFalso.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('/auth/invitaciones')
      expect(opciones.method).toBe('POST')
      expect(opciones.body).toBe(
        JSON.stringify({ email: 'sol@menyu.com', nombre: 'Sol', rol: 'MOZO', restauranteId: 'rest-1' }),
      )
    })
  })

  describe('cajas', () => {
    it('las cajas abiertas se piden por restaurante, con GET (#360)', async () => {
      fetchFalso.mockResolvedValue(respuesta({ cajas: [{ cajaId: 'caja-1', nombre: 'Principal' }] }))

      await expect(api.cajas.abiertas('rest 1')).resolves.toEqual({ cajas: [{ cajaId: 'caja-1', nombre: 'Principal' }] })

      const [url, opciones] = fetchFalso.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('/cajas/abiertas?restauranteId=rest%201')
      expect(opciones.method).toBe('GET')
    })

    const pedido = () => {
      const [url, opciones] = fetchFalso.mock.calls[0] as [string, RequestInit]
      return { url, metodo: opciones.method, body: opciones.body === undefined ? undefined : JSON.parse(opciones.body as string) }
    }

    it('todas las cajas del restaurante se piden por restaurante, con GET', async () => {
      const CAJA = { id: 'c-1', restauranteId: 'rest 1', nombre: 'Barra', activa: false, createdAt: '2026-11-01T10:00:00.000Z' }
      fetchFalso.mockResolvedValue(respuesta([CAJA]))

      await expect(api.cajas.listar('rest 1')).resolves.toEqual([CAJA])

      expect(pedido()).toEqual({ url: '/cajas?restauranteId=rest%201', metodo: 'GET', body: undefined })
    })

    it('crear una caja es un POST con el restaurante y el nombre', async () => {
      await api.cajas.crear('rest-1', 'Caja principal')

      expect(pedido()).toEqual({ url: '/cajas', metodo: 'POST', body: { restauranteId: 'rest-1', nombre: 'Caja principal' } })
    })

    it('actualizar es un PATCH a la caja que manda solo lo que se pasó', async () => {
      await api.cajas.actualizar('c/1', { activa: false })
      expect(pedido()).toEqual({ url: '/cajas/c%2F1', metodo: 'PATCH', body: { activa: false } })

      fetchFalso.mockClear()
      await api.cajas.actualizar('c-1', { nombre: 'Barra' })
      expect(pedido()).toEqual({ url: '/cajas/c-1', metodo: 'PATCH', body: { nombre: 'Barra' } })
    })
  })

  describe('turnos', () => {
    const pedido = (n = 0) => {
      const [url, opciones] = fetchFalso.mock.calls[n] as [string, RequestInit]
      return { url, metodo: opciones.method, body: opciones.body }
    }

    it('la primera página del historial se pide por restaurante, con GET y sin límite ni cursor', async () => {
      const PAGINA = { items: [], siguiente: null }
      fetchFalso.mockResolvedValue(respuesta(PAGINA))

      await expect(api.turnos.listar('rest 1')).resolves.toEqual(PAGINA)

      expect(pedido()).toEqual({ url: '/turnos?restauranteId=rest%201', metodo: 'GET', body: undefined })
    })

    it('la página siguiente manda el cursor codificado', async () => {
      await api.turnos.listar('rest/1', 'turno&2')

      expect(pedido()).toEqual({ url: '/turnos?restauranteId=rest%2F1&cursor=turno%262', metodo: 'GET', body: undefined })
    })

    it('el detalle y el resumen de un turno se piden por su id codificado, con GET', async () => {
      await api.turnos.detalle('t/1')
      await api.turnos.resumen('t/1')

      expect(pedido(0)).toEqual({ url: '/turnos/t%2F1', metodo: 'GET', body: undefined })
      expect(pedido(1)).toEqual({ url: '/turnos/t%2F1/resumen', metodo: 'GET', body: undefined })
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
