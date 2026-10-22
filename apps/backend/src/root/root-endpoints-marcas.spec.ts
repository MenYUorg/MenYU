import { AppDeEndpoints, CUENTAS, crearAppDeEndpoints } from '../test/app-endpoints'
import { NO_ROOT } from '../test/root-mock'
import { HistorialRootService } from './historial/historial-root.service'
import { RootHistorialController } from './historial/root-historial.controller'
import { RootMarcasController } from './marcas/root-marcas.controller'
import { RootMarcasService } from './marcas/root-marcas.service'
import { RootRestaurantesController } from './restaurantes/root-restaurantes.controller'
import { RootRestaurantesService } from './restaurantes/root-restaurantes.service'

type Metodo = 'get' | 'post' | 'patch' | 'put' | 'delete'


describe('endpoints de marcas de ROOT', () => {
  let api: AppDeEndpoints
  const marcas = { listar: jest.fn(), detalle: jest.fn(), crear: jest.fn(), editar: jest.fn(), cambiarEstado: jest.fn() }
  const restaurantes = { crear: jest.fn(), editar: jest.fn(), cambiarEstado: jest.fn() }

  beforeAll(async () => {
    api = await crearAppDeEndpoints(RootMarcasController, [
      { provide: RootMarcasService, useValue: marcas },
      { provide: RootRestaurantesService, useValue: restaurantes },
    ])
  })

  afterAll(() => api.cerrar())

  beforeEach(() => {
    jest.clearAllMocks()
    marcas.listar.mockResolvedValue([])
    marcas.detalle.mockResolvedValue({ id: 'm-001' })
    marcas.crear.mockResolvedValue({ id: 'm-nueva' })
    marcas.editar.mockResolvedValue({ id: 'm-001' })
    marcas.cambiarEstado.mockResolvedValue({ id: 'm-001' })
    restaurantes.crear.mockResolvedValue({ id: 'r-nuevo' })
  })

  const RUTAS: Array<[string, Metodo, string, number, jest.Mock, object?]> = [
    ['GET /root/marcas', 'get', '/root/marcas', 200, marcas.listar],
    ['POST /root/marcas', 'post', '/root/marcas', 201, marcas.crear, { nombre: 'La Parrilla', slug: 'la-parrilla' }],
    ['GET /root/marcas/:id', 'get', '/root/marcas/m-001', 200, marcas.detalle],
    ['PATCH /root/marcas/:id', 'patch', '/root/marcas/m-001', 200, marcas.editar, { nombre: 'Nuevo' }],
    ['POST /root/marcas/:id/baja', 'post', '/root/marcas/m-001/baja', 200, marcas.cambiarEstado],
    ['POST /root/marcas/:id/reactivar', 'post', '/root/marcas/m-001/reactivar', 200, marcas.cambiarEstado],
    ['POST /root/marcas/:id/restaurantes', 'post', '/root/marcas/m-001/restaurantes', 201, restaurantes.crear, { nombre: 'Centro', direccion: 'Av. Colón 1200' }],
  ]

  describe.each(RUTAS)('%s', (_nombre, metodo, ruta, exito, servicio, body) => {
    it(`ROOT: ${exito}`, async () => {
      const res = await api.pedir(metodo, ruta, { cuenta: CUENTAS.ROOT, body })

      expect(res.status).toBe(exito)
      expect(servicio).toHaveBeenCalledTimes(1)
    })

    it.each(NO_ROOT)('%s: 403 y el servicio no se llama', async (_rol, cuenta) => {
      const res = await api.pedir(metodo, ruta, { cuenta, body })

      expect(res.status).toBe(403)
      expect(servicio).not.toHaveBeenCalled()
    })

    it('sin token: 401 y el servicio no se llama', async () => {
      const res = await api.pedir(metodo, ruta, { body })

      expect(res.status).toBe(401)
      expect(servicio).not.toHaveBeenCalled()
    })
  })

  it('los permisos van antes que la validación: un OWNER o sin token con un campo de más recibe 403 o 401, no 400', async () => {
    const owner = await api.pedir('patch', '/root/marcas/m-001', { cuenta: CUENTAS.OWNER_A, body: { logoUrl: 'x' } })
    const anonimo = await api.pedir('patch', '/root/marcas/m-001', { body: { logoUrl: 'x' } })

    expect([owner.status, anonimo.status]).toEqual([403, 401])
  })

  describe('lo que le llega al servicio', () => {
    it('GET: bajas=true y bajas=false llegan como booleanos; sin el parámetro, nada', async () => {
      await api.pedir('get', '/root/marcas', { cuenta: CUENTAS.ROOT, query: { bajas: 'true' } })
      await api.pedir('get', '/root/marcas', { cuenta: CUENTAS.ROOT, query: { bajas: 'false' } })
      await api.pedir('get', '/root/marcas', { cuenta: CUENTAS.ROOT })

      expect(marcas.listar.mock.calls.map(([dto]) => dto.bajas)).toEqual([true, false, undefined])
    })

    it('GET con bajas=quizas responde 400', async () => {
      const res = await api.pedir('get', '/root/marcas', { cuenta: CUENTAS.ROOT, query: { bajas: 'quizas' } })

      expect(res.status).toBe(400)
      expect(marcas.listar).not.toHaveBeenCalled()
    })

    it('POST: nombre recortado e identificador en minúsculas', async () => {
      await api.pedir('post', '/root/marcas', { cuenta: CUENTAS.ROOT, body: { nombre: '  La Parrilla de Juan ', slug: ' La-Parrilla-DE-Juan ' } })

      expect(marcas.crear).toHaveBeenCalledWith({ nombre: 'La Parrilla de Juan', slug: 'la-parrilla-de-juan' }, CUENTAS.ROOT)
    })

    it('el id de la marca llega tal cual, aunque no sea UUID, junto con el usuario', async () => {
      await api.pedir('get', '/root/marcas/m-001', { cuenta: CUENTAS.ROOT })
      await api.pedir('post', '/root/marcas/m-001/baja', { cuenta: CUENTAS.ROOT })
      await api.pedir('post', '/root/marcas/m-001/reactivar', { cuenta: CUENTAS.ROOT })

      expect(marcas.detalle).toHaveBeenCalledWith('m-001')
      expect(marcas.cambiarEstado.mock.calls).toEqual([
        ['m-001', false, CUENTAS.ROOT],
        ['m-001', true, CUENTAS.ROOT],
      ])
    })

    it('PATCH y alta de restaurante llevan el id, el cuerpo ya limpio y el usuario', async () => {
      await api.pedir('patch', '/root/marcas/m-001', { cuenta: CUENTAS.ROOT, body: { slug: 'Otro-Slug' } })
      await api.pedir('post', '/root/marcas/m-001/restaurantes', { cuenta: CUENTAS.ROOT, body: { nombre: ' Centro ', direccion: '  Av. Colón 1200  ' } })

      expect(marcas.editar).toHaveBeenCalledWith('m-001', { slug: 'otro-slug' }, CUENTAS.ROOT)
      expect(restaurantes.crear).toHaveBeenCalledWith('m-001', { nombre: 'Centro', direccion: 'Av. Colón 1200' }, CUENTAS.ROOT)
    })
  })

  describe('validación', () => {
    it.each([
      ['sin nombre', { slug: 'la-parrilla' }],
      ['sin identificador', { nombre: 'La Parrilla' }],
      ['con el nombre en blanco', { nombre: '   ', slug: 'la-parrilla' }],
      ['con un nombre de 121 caracteres', { nombre: 'a'.repeat(121), slug: 'la-parrilla' }],
      ['con el carácter nulo en el nombre', { nombre: 'La\u0000Parrilla', slug: 'la-parrilla' }],
      ['con un identificador con espacios', { nombre: 'La Parrilla', slug: 'la parrilla' }],
      ['con un identificador con guiones dobles', { nombre: 'La Parrilla', slug: 'la--parrilla' }],
      ['con un identificador que empieza con guion', { nombre: 'La Parrilla', slug: '-la-parrilla' }],
      ['con un identificador con acentos', { nombre: 'La Parrilla', slug: 'ñandú' }],
      ['con un identificador con barras', { nombre: 'La Parrilla', slug: 'la/parrilla' }],
      ['con un identificador de 81 caracteres', { nombre: 'La Parrilla', slug: 'a'.repeat(81) }],
      ['con el nombre que no es texto', { nombre: 123, slug: 'la-parrilla' }],
    ])('POST /root/marcas %s responde 400', async (_caso, body) => {
      const res = await api.pedir('post', '/root/marcas', { cuenta: CUENTAS.ROOT, body })

      expect(res.status).toBe(400)
      expect(marcas.crear).not.toHaveBeenCalled()
    })

    it('un identificador de 80 caracteres y un nombre de 120 están bien', async () => {
      const res = await api.pedir('post', '/root/marcas', { cuenta: CUENTAS.ROOT, body: { nombre: 'a'.repeat(120), slug: 'a'.repeat(80) } })

      expect(res.status).toBe(201)
    })

    it.each([
      ['el logo', { nombre: 'La Parrilla', slug: 'la-parrilla', logoUrl: 'https://x/logo.png' }],
      ['el estado', { nombre: 'La Parrilla', slug: 'la-parrilla', activo: false }],
      ['un id', { nombre: 'La Parrilla', slug: 'la-parrilla', id: 'otro' }],
    ])('POST /root/marcas con %s de más responde 400 (no se ignora en silencio)', async (_caso, body) => {
      const res = await api.pedir('post', '/root/marcas', { cuenta: CUENTAS.ROOT, body })

      expect(res.status).toBe(400)
      expect(res.body.message).toMatch(/ROOT no puede enviar/)
      expect(marcas.crear).not.toHaveBeenCalled()
    })

    it('PATCH /root/marcas/:id con el logo o el estado responde 400 y dice que el logo lo carga el dueño', async () => {
      const logo = await api.pedir('patch', '/root/marcas/m-001', { cuenta: CUENTAS.ROOT, body: { nombre: 'X', logoUrl: 'https://x/logo.png' } })
      const estado = await api.pedir('patch', '/root/marcas/m-001', { cuenta: CUENTAS.ROOT, body: { activo: false } })

      expect(logo.status).toBe(400)
      expect(logo.body.message).toMatch(/logoUrl/)
      expect(logo.body.message).toMatch(/lo carga el dueño/)
      expect(estado.status).toBe(400)
      expect(marcas.editar).not.toHaveBeenCalled()
    })

    it('PATCH con un nombre en blanco, o null, responde 400', async () => {
      const blanco = await api.pedir('patch', '/root/marcas/m-001', { cuenta: CUENTAS.ROOT, body: { nombre: '  ' } })
      const nulo = await api.pedir('patch', '/root/marcas/m-001', { cuenta: CUENTAS.ROOT, body: { nombre: null } })

      expect([blanco.status, nulo.status]).toEqual([400, 400])
      expect(marcas.editar).not.toHaveBeenCalled()
    })

    it('PATCH con un cuerpo vacío llega al servicio, que responde 400 (no hay nada para cambiar)', async () => {
      await api.pedir('patch', '/root/marcas/m-001', { cuenta: CUENTAS.ROOT, body: {} })

      expect(marcas.editar).toHaveBeenCalledWith('m-001', {}, CUENTAS.ROOT)
    })

    it.each([
      ['sin dirección', { nombre: 'Centro' }],
      ['con la dirección en blanco', { nombre: 'Centro', direccion: '   ' }],
      ['con una dirección de 201 caracteres', { nombre: 'Centro', direccion: 'a'.repeat(201) }],
      ['con el carácter nulo en la dirección', { nombre: 'Centro', direccion: 'Av.\u0000Colón' }],
      ['sin nombre', { direccion: 'Av. Colón 1200' }],
    ])('POST /root/marcas/:id/restaurantes %s responde 400', async (_caso, body) => {
      const res = await api.pedir('post', '/root/marcas/m-001/restaurantes', { cuenta: CUENTAS.ROOT, body })

      expect(res.status).toBe(400)
      expect(restaurantes.crear).not.toHaveBeenCalled()
    })

    it('POST /root/marcas/:id/restaurantes con el modo de sesión o el logo de más responde 400', async () => {
      const res = await api.pedir('post', '/root/marcas/m-001/restaurantes', {
        cuenta: CUENTAS.ROOT,
        body: { nombre: 'Centro', direccion: 'Av. Colón 1200', modoSesion: 'seguro', logoUrl: 'x' },
      })

      expect(res.status).toBe(400)
      expect(res.body.message).toMatch(/modoSesion, logoUrl/)
      expect(restaurantes.crear).not.toHaveBeenCalled()
    })

    it.each([
      ['GET', '/root/marcas/a.b'],
      ['GET', '/root/marcas/a%20b'],
      ['GET', '/root/marcas/%00'],
      ['POST', '/root/marcas/a.b/baja'],
      ['POST', '/root/marcas/a.b/reactivar'],
      ['POST', '/root/marcas/a.b/restaurantes'],
    ] as const)('%s %s: un id con forma de no-id responde 404 sin llegar al servicio', async (metodo, ruta) => {
      const res = await api.pedir(metodo.toLowerCase() as Metodo, ruta, { cuenta: CUENTAS.ROOT, body: { nombre: 'X', direccion: 'Y' } })

      expect(res.status).toBe(404)
      expect(marcas.detalle).not.toHaveBeenCalled()
      expect(marcas.cambiarEstado).not.toHaveBeenCalled()
      expect(restaurantes.crear).not.toHaveBeenCalled()
    })
  })

  // Decisión 5: "borrar" es una baja lógica y reversible. No hay ruta que borre una marca, ni siquiera para ROOT.
  it.each(['delete', 'put'] as const)('%s /root/marcas/:id no existe (404): las marcas no se borran', async (metodo) => {
    const res = await api.pedir(metodo, '/root/marcas/m-001', { cuenta: CUENTAS.ROOT, body: { nombre: 'X' } })

    expect(res.status).toBe(404)
  })
})

describe('endpoints de restaurantes de ROOT', () => {
  let api: AppDeEndpoints
  const restaurantes = { crear: jest.fn(), editar: jest.fn(), cambiarEstado: jest.fn() }

  beforeAll(async () => {
    api = await crearAppDeEndpoints(RootRestaurantesController, [{ provide: RootRestaurantesService, useValue: restaurantes }])
  })

  afterAll(() => api.cerrar())

  beforeEach(() => {
    jest.clearAllMocks()
    restaurantes.editar.mockResolvedValue({ id: 'r-001' })
    restaurantes.cambiarEstado.mockResolvedValue({ id: 'r-001' })
  })

  const RUTAS: Array<[string, Metodo, string, jest.Mock, object?]> = [
    ['PATCH /root/restaurantes/:id', 'patch', '/root/restaurantes/r-001', restaurantes.editar, { nombre: 'Nuevo' }],
    ['POST /root/restaurantes/:id/baja', 'post', '/root/restaurantes/r-001/baja', restaurantes.cambiarEstado],
    ['POST /root/restaurantes/:id/reactivar', 'post', '/root/restaurantes/r-001/reactivar', restaurantes.cambiarEstado],
  ]

  describe.each(RUTAS)('%s', (_nombre, metodo, ruta, servicio, body) => {
    it('ROOT: 200', async () => {
      const res = await api.pedir(metodo, ruta, { cuenta: CUENTAS.ROOT, body })

      expect(res.status).toBe(200)
      expect(servicio).toHaveBeenCalledTimes(1)
    })

    it.each(NO_ROOT)('%s: 403 y el servicio no se llama', async (_rol, cuenta) => {
      const res = await api.pedir(metodo, ruta, { cuenta, body })

      expect(res.status).toBe(403)
      expect(servicio).not.toHaveBeenCalled()
    })

    it('sin token: 401 y el servicio no se llama', async () => {
      const res = await api.pedir(metodo, ruta, { body })

      expect(res.status).toBe(401)
      expect(servicio).not.toHaveBeenCalled()
    })
  })

  it('PATCH lleva el id (aunque no sea UUID), el nombre recortado y el usuario', async () => {
    await api.pedir('patch', '/root/restaurantes/r-001', { cuenta: CUENTAS.ROOT, body: { nombre: '  Alta Córdoba ' } })

    expect(restaurantes.editar).toHaveBeenCalledWith('r-001', { nombre: 'Alta Córdoba' }, CUENTAS.ROOT)
  })

  // Plan, sección 7: "Si llega otro campo, 400 (no se ignora en silencio)".
  it.each([
    ['la dirección', { nombre: 'X', direccion: 'Otra calle 1' }],
    ['solo la dirección', { direccion: 'Otra calle 1' }],
    ['el logo', { nombre: 'X', logoUrl: 'https://x/logo.png' }],
    ['el modo de sesión', { modoSesion: 'seguro' }],
    ['el nombre de la sección de recomendados', { nombreSeccionRecomendados: 'LO MEJOR' }],
    ['el estado', { activo: false }],
    ['la marca (mover el restaurante)', { marcaId: 'otra' }],
    ['los datos de Mercado Pago', { mpAccessToken: 'x' }],
  ])('PATCH con %s responde 400, no se ignora en silencio, y nada llega al servicio', async (_caso, body) => {
    const res = await api.pedir('patch', '/root/restaurantes/r-001', { cuenta: CUENTAS.ROOT, body })

    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/ROOT no puede enviar/)
    expect(res.body.message).toMatch(/los decide el dueño/)
    expect(restaurantes.editar).not.toHaveBeenCalled()
  })

  it('PATCH con un nombre en blanco, null o de 121 caracteres responde 400', async () => {
    const respuestas = await Promise.all(
      [{ nombre: '  ' }, { nombre: null }, { nombre: 'a'.repeat(121) }].map((body) => api.pedir('patch', '/root/restaurantes/r-001', { cuenta: CUENTAS.ROOT, body })),
    )

    expect(respuestas.map((r) => r.status)).toEqual([400, 400, 400])
    expect(restaurantes.editar).not.toHaveBeenCalled()
  })

  it('PATCH con un cuerpo vacío llega al servicio, que responde 400', async () => {
    await api.pedir('patch', '/root/restaurantes/r-001', { cuenta: CUENTAS.ROOT, body: {} })

    expect(restaurantes.editar).toHaveBeenCalledWith('r-001', {}, CUENTAS.ROOT)
  })

  it('baja y reactivar llevan el id y el usuario', async () => {
    await api.pedir('post', '/root/restaurantes/r-001/baja', { cuenta: CUENTAS.ROOT })
    await api.pedir('post', '/root/restaurantes/r-001/reactivar', { cuenta: CUENTAS.ROOT })

    expect(restaurantes.cambiarEstado.mock.calls).toEqual([
      ['r-001', false, CUENTAS.ROOT],
      ['r-001', true, CUENTAS.ROOT],
    ])
  })

  it.each([
    ['patch', '/root/restaurantes/a.b'],
    ['post', '/root/restaurantes/a.b/baja'],
    ['post', '/root/restaurantes/a%20b/reactivar'],
  ] as const)('%s %s: un id con forma de no-id responde 404', async (metodo, ruta) => {
    const res = await api.pedir(metodo, ruta, { cuenta: CUENTAS.ROOT, body: { nombre: 'X' } })

    expect(res.status).toBe(404)
    expect(restaurantes.editar).not.toHaveBeenCalled()
    expect(restaurantes.cambiarEstado).not.toHaveBeenCalled()
  })

  it.each(['delete', 'put', 'get'] as const)('%s /root/restaurantes/:id no existe (404): los restaurantes no se borran ni se leen por acá', async (metodo) => {
    const res = await api.pedir(metodo, '/root/restaurantes/r-001', { cuenta: CUENTAS.ROOT, body: { nombre: 'X' } })

    expect(res.status).toBe(404)
  })
})

describe('endpoint del historial de ROOT', () => {
  let api: AppDeEndpoints
  const historial = { listar: jest.fn() }

  beforeAll(async () => {
    api = await crearAppDeEndpoints(RootHistorialController, [{ provide: HistorialRootService, useValue: historial }])
  })

  afterAll(() => api.cerrar())

  beforeEach(() => {
    jest.clearAllMocks()
    historial.listar.mockResolvedValue({ items: [], siguiente: null })
  })

  it('ROOT: 200 con la página', async () => {
    const res = await api.pedir('get', '/root/historial', { cuenta: CUENTAS.ROOT })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ items: [], siguiente: null })
  })

  it.each(NO_ROOT)('%s no puede leer el historial: 403', async (_rol, cuenta) => {
    const res = await api.pedir('get', '/root/historial', { cuenta })

    expect(res.status).toBe(403)
    expect(historial.listar).not.toHaveBeenCalled()
  })

  it('sin token: 401', async () => {
    const res = await api.pedir('get', '/root/historial')

    expect(res.status).toBe(401)
    expect(historial.listar).not.toHaveBeenCalled()
  })

  it('los filtros llegan al servicio ya convertidos', async () => {
    await api.pedir('get', '/root/historial', {
      cuenta: CUENTAS.ROOT,
      query: { actor: ' ana@ejemplo.com ', entidad: 'MARCA', desde: '2026-10-15', hasta: '2026-10-16', cursor: '120' },
    })

    expect(historial.listar).toHaveBeenCalledWith({ actor: 'ana@ejemplo.com', entidad: 'MARCA', desde: '2026-10-15', hasta: '2026-10-16', cursor: 120 })
  })

  it('los parámetros vacíos (la pantalla los manda aunque estén en blanco) son "sin filtro"', async () => {
    await api.pedir('get', '/root/historial', { cuenta: CUENTAS.ROOT, query: { actor: '', entidad: '', desde: '', hasta: '', cursor: '' } })

    const filtros = historial.listar.mock.calls[0][0]
    expect(Object.values(filtros).filter((v) => v !== undefined)).toEqual([])
  })

  it.each(['MARCA', 'RESTAURANTE', 'OWNER', 'ROOT'])('entidad %s es válida', async (entidad) => {
    const res = await api.pedir('get', '/root/historial', { cuenta: CUENTAS.ROOT, query: { entidad } })

    expect(res.status).toBe(200)
  })

  it.each([
    ['una entidad que no existe', { entidad: 'PEDIDO' }],
    ['una entidad en minúsculas', { entidad: 'marca' }],
    ['una fecha con otro formato', { desde: '15/10/2026' }],
    ['una fecha con hora', { hasta: '2026-10-15T10:00:00' }],
    ['un cursor en cero', { cursor: '0' }],
    ['un cursor negativo', { cursor: '-4' }],
    ['un cursor que no es número', { cursor: 'abc' }],
    ['un cursor decimal', { cursor: '1.5' }],
    ['un cursor gigante', { cursor: '99999999999' }],
    ['un actor larguísimo', { actor: 'a'.repeat(255) }],
    ['el carácter nulo en el actor', { actor: 'a\u0000b' }],
  ])('%s responde 400', async (_caso, query) => {
    const res = await api.pedir('get', '/root/historial', { cuenta: CUENTAS.ROOT, query: query as Record<string, string> })

    expect(res.status).toBe(400)
    expect(historial.listar).not.toHaveBeenCalled()
  })

  // El historial es de solo lectura (decisión 17): no hay ninguna ruta que lo cambie, ni siquiera para ROOT.
  it.each(['post', 'put', 'patch', 'delete'] as const)('%s /root/historial no existe (404)', async (metodo) => {
    const res = await api.pedir(metodo, '/root/historial', { cuenta: CUENTAS.ROOT, body: {} })

    expect(res.status).toBe(404)
  })

  it.each(['put', 'patch', 'delete', 'post'] as const)('%s /root/historial/:id no existe (404)', async (metodo) => {
    const res = await api.pedir(metodo, '/root/historial/1', { cuenta: CUENTAS.ROOT, body: {} })

    expect(res.status).toBe(404)
  })
})
