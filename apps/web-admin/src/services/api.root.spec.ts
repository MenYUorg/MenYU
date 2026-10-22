import { api } from './api'
import { reiniciarSesionDePrueba, sesionDePrueba } from '../test/authClient'

vi.mock('@menyu/auth-client', async () => (await import('../test/authClient')).moduloSimulado())

const fetchFalso = vi.fn()

function respuesta(cuerpo: unknown = {}, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(cuerpo) } as Response
}

beforeEach(() => {
  fetchFalso.mockReset()
  fetchFalso.mockResolvedValue(respuesta([]))
  vi.stubGlobal('fetch', fetchFalso)
  reiniciarSesionDePrueba()
})

afterEach(() => vi.unstubAllGlobals())

const ultimaLlamada = () => {
  const [url, opciones] = fetchFalso.mock.calls[fetchFalso.mock.calls.length - 1] as [string, RequestInit]
  return {
    url,
    metodo: opciones.method,
    cuerpo: opciones.body,
    encabezados: opciones.headers as Record<string, string>,
  }
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
      sesionDePrueba.token = 'token-de-root'

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

  describe('duenos', () => {
    it('listar pide todos los dueños, sin parámetros (la búsqueda se hace en pantalla)', async () => {
      await api.root.duenos.listar()

      expect(ultimaLlamada()).toMatchObject({ url: '/root/duenos', metodo: 'GET' })
    })

    it('invitar manda nombre y email a la marca', async () => {
      await api.root.duenos.invitar('m1', { email: 'juan@laparrilla.com', nombre: 'Juan' })

      expect(ultimaLlamada()).toMatchObject({
        url: '/root/marcas/m1/duenos',
        metodo: 'POST',
        cuerpo: JSON.stringify({ email: 'juan@laparrilla.com', nombre: 'Juan' }),
      })
    })

    it('quitar manda el id de la membresía y entiende la respuesta vacía (204)', async () => {
      fetchFalso.mockResolvedValue({ ok: true, status: 204, json: () => Promise.reject(new Error('sin cuerpo')) } as Response)

      await expect(api.root.duenos.quitar('mem-1')).resolves.toBeUndefined()

      expect(ultimaLlamada()).toMatchObject({ url: '/root/duenos/mem-1', metodo: 'DELETE' })
    })

    it('un id con caracteres raros no se escapa de la ruta', async () => {
      await api.root.duenos.quitar('../marcas/m1')
      expect(ultimaLlamada().url).toBe('/root/duenos/..%2Fmarcas%2Fm1')

      await api.root.duenos.invitar('m1/../../roots', { email: 'a@b.com', nombre: 'A' })
      expect(ultimaLlamada().url).toBe('/root/marcas/m1%2F..%2F..%2Froots/duenos')
    })

    it('no hay forma de cambiarles el email ni la contraseña desde la API', () => {
      expect(Object.keys(api.root.duenos).sort()).toEqual(['invitar', 'listar', 'quitar'])
    })
  })

  describe('cuentas ROOT', () => {
    it('listar pide las cuentas ROOT', async () => {
      await api.root.cuentas.listar()

      expect(ultimaLlamada()).toMatchObject({ url: '/root/roots', metodo: 'GET' })
    })

    it('invitar manda nombre y email', async () => {
      await api.root.cuentas.invitar({ email: 'bruno@menyu.com', nombre: 'Bruno' })

      expect(ultimaLlamada()).toMatchObject({
        url: '/root/roots',
        metodo: 'POST',
        cuerpo: JSON.stringify({ email: 'bruno@menyu.com', nombre: 'Bruno' }),
      })
    })

    it('no hay forma de quitarlas, ni restablecerles la contraseña, desde la API (decisión 15)', () => {
      expect(Object.keys(api.root.cuentas).sort()).toEqual(['invitar', 'listar'])
    })
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
