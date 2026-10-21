import { api } from './api'

vi.mock('@menyu/auth', () => ({ TOKEN_KEY: 'menyu_access_token', REFRESH_KEY: 'menyu_refresh_token', resolveLoginUrl: vi.fn() }))

const fetchFalso = vi.fn()

function respuesta(cuerpo: unknown = {}, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(cuerpo) } as Response
}

beforeEach(() => {
  fetchFalso.mockReset()
  fetchFalso.mockResolvedValue(respuesta([]))
  vi.stubGlobal('fetch', fetchFalso)
  localStorage.clear()
})

afterEach(() => vi.unstubAllGlobals())

const ultimaLlamada = () => {
  const [url, opciones] = fetchFalso.mock.calls[fetchFalso.mock.calls.length - 1] as [string, RequestInit]
  return { url, metodo: opciones.method, cuerpo: opciones.body, encabezados: opciones.headers as Record<string, string> }
}

describe('api.root', () => {
  describe('marcas', () => {
    it('listar pide solo las activas, o también las de baja', async () => {
      await api.root.marcas.listar()
      expect(ultimaLlamada().url).toBe('/root/marcas')

      await api.root.marcas.listar({ bajas: false })
      expect(ultimaLlamada().url).toBe('/root/marcas')

      await api.root.marcas.listar({ bajas: true })
      expect(ultimaLlamada().url).toBe('/root/marcas?bajas=true')
    })

    it('manda el token de la sesión', async () => {
      localStorage.setItem('menyu_access_token', 'token-de-root')

      await api.root.marcas.listar()

      expect(ultimaLlamada().encabezados['Authorization']).toBe('Bearer token-de-root')
    })

    it('detalle, editar, baja y reactivar usan la dirección de la marca', async () => {
      await api.root.marcas.detalle('m1')
      expect(ultimaLlamada()).toMatchObject({ url: '/root/marcas/m1', metodo: 'GET' })

      await api.root.marcas.editar('m1', { nombre: 'Nuevo' })
      expect(ultimaLlamada()).toMatchObject({ url: '/root/marcas/m1', metodo: 'PATCH', cuerpo: JSON.stringify({ nombre: 'Nuevo' }) })

      await api.root.marcas.baja('m1')
      expect(ultimaLlamada()).toMatchObject({ url: '/root/marcas/m1/baja', metodo: 'POST' })

      await api.root.marcas.reactivar('m1')
      expect(ultimaLlamada()).toMatchObject({ url: '/root/marcas/m1/reactivar', metodo: 'POST' })
    })

    it('crear y crearRestaurante mandan el cuerpo', async () => {
      await api.root.marcas.crear({ nombre: 'La Parrilla', slug: 'la-parrilla' })
      expect(ultimaLlamada()).toMatchObject({ url: '/root/marcas', metodo: 'POST', cuerpo: JSON.stringify({ nombre: 'La Parrilla', slug: 'la-parrilla' }) })

      await api.root.marcas.crearRestaurante('m1', { nombre: 'Centro', direccion: 'Calle 1' })
      expect(ultimaLlamada()).toMatchObject({ url: '/root/marcas/m1/restaurantes', metodo: 'POST' })
    })

    it('un id con caracteres raros no se escapa de la ruta', async () => {
      await api.root.marcas.detalle('../root/roots?x=1')

      expect(ultimaLlamada().url).toBe('/root/marcas/..%2Froot%2Froots%3Fx%3D1')
    })
  })

  describe('restaurantes', () => {
    it('editar, baja y reactivar', async () => {
      await api.root.restaurantes.editar('r1', { nombre: 'Centro' })
      expect(ultimaLlamada()).toMatchObject({ url: '/root/restaurantes/r1', metodo: 'PATCH', cuerpo: JSON.stringify({ nombre: 'Centro' }) })

      await api.root.restaurantes.baja('r1')
      expect(ultimaLlamada()).toMatchObject({ url: '/root/restaurantes/r1/baja', metodo: 'POST' })

      await api.root.restaurantes.reactivar('r1')
      expect(ultimaLlamada()).toMatchObject({ url: '/root/restaurantes/r1/reactivar', metodo: 'POST' })
    })
  })

  describe('historial', () => {
    it('sin filtros no manda parámetros', async () => {
      await api.root.historial.listar()
      expect(ultimaLlamada().url).toBe('/root/historial')

      await api.root.historial.listar({ actor: '', entidad: undefined, desde: '', hasta: '' })
      expect(ultimaLlamada().url).toBe('/root/historial')
    })

    it('manda solo los filtros que tienen valor', async () => {
      await api.root.historial.listar({ actor: 'root@menyu.com', entidad: 'MARCA', desde: '2026-10-01', hasta: '2026-10-15', cursor: 40 })

      const { searchParams } = new URL(ultimaLlamada().url, 'http://x')
      expect(Object.fromEntries(searchParams)).toEqual({
        actor: 'root@menyu.com',
        entidad: 'MARCA',
        desde: '2026-10-01',
        hasta: '2026-10-15',
        cursor: '40',
      })
    })

    it('el email viaja codificado', async () => {
      await api.root.historial.listar({ actor: 'a+b@menyu.com' })

      expect(ultimaLlamada().url).toBe('/root/historial?actor=a%2Bb%40menyu.com')
    })
  })

  it('cuentas.listar pide las cuentas ROOT', async () => {
    await api.root.cuentas.listar()

    expect(ultimaLlamada()).toMatchObject({ url: '/root/roots', metodo: 'GET' })
  })

  it('un error del servidor llega con su código y su mensaje', async () => {
    fetchFalso.mockResolvedValue(respuesta({ message: 'Ya existe una marca con ese identificador' }, false, 409))

    await expect(api.root.marcas.crear({ nombre: 'A', slug: 'a' })).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
      message: 'Ya existe una marca con ese identificador',
    })
  })
})
