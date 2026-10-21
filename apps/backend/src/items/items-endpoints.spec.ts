import { AppDeEndpoints, CUENTAS, crearAppDeEndpoints, MUNDO, SIN_USUARIO } from '../test/app-endpoints'
import { ItemsController } from './items.controller'
import { ItemsService } from './items.service'

// Las rutas de ítems con el token de Supabase. En las del restaurante (alta y listado) el rol lo exige la ruta;
// en las de un ítem, el service (items.imagen-ingredientes.spec y items.service.spec).

const REST = MUNDO.REST_1
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)
const ITEM_NUEVO = { restauranteId: REST, nombre: 'Milanesa', precioBase: 1500 }
const RESULTADO = { id: 'item-1', precioDescuento: 1200, porcentajeDescuento: 20, precioVigente: 1200 }

describe('endpoints de ítems', () => {
  let api: AppDeEndpoints
  const items = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    setDescuento: jest.fn(),
    removeDescuento: jest.fn(),
    removeImagen: jest.fn(),
    addIngrediente: jest.fn(),
    updateIngrediente: jest.fn(),
    removeIngrediente: jest.fn(),
  }

  beforeAll(async () => {
    api = await crearAppDeEndpoints(ItemsController, [{ provide: ItemsService, useValue: items }])
  })

  afterAll(() => api.cerrar())

  beforeEach(() => {
    jest.clearAllMocks()
    for (const fn of Object.values(items)) fn.mockResolvedValue(RESULTADO)
  })

  describe('POST /items (el restaurante del body)', () => {
    it.each([
      ['el OWNER de la marca', CUENTAS.OWNER_A],
      ['el GERENTE del restaurante', CUENTAS.GERENTE],
    ])('%s crea el ítem (201)', async (_caso, cuenta) => {
      const res = await api.pedir('post', '/items', { cuenta, body: ITEM_NUEVO })

      expect(res.status).toBe(201)
      expect(items.create).toHaveBeenCalledWith(ITEM_NUEVO)
    })

    it.each([
      ['ROOT (no es un bypass)', CUENTAS.ROOT],
      ['el OWNER de otra marca', CUENTAS.OWNER_B],
      ['el MOZO', CUENTAS.MOZO],
      ['la COCINA', CUENTAS.COCINA],
    ])('%s recibe 403', async (_caso, cuenta) => {
      const res = await api.pedir('post', '/items', { cuenta, body: ITEM_NUEVO })

      expect(res.status).toBe(403)
      expect(items.create).not.toHaveBeenCalled()
    })

    it('sin restauranteId en el body: 400', async () => {
      const res = await api.pedir('post', '/items', { cuenta: CUENTAS.OWNER_A, body: { nombre: 'Milanesa', precioBase: 1 } })

      expect(res.status).toBe(400)
    })
  })

  describe('GET /items (el restaurante de la query)', () => {
    it('el GERENTE lista los del restaurante, con el filtro de disponibles', async () => {
      const res = await api.pedir('get', '/items', { cuenta: CUENTAS.GERENTE, query: { restauranteId: REST, disponible: 'true' } })

      expect(res.status).toBe(200)
      expect(items.findAll).toHaveBeenCalledWith(REST, true)
    })

    it.each([
      ['false', false],
      ['cualquier otra cosa', undefined],
    ])('disponible=%s se pasa como %s', async (valor, esperado) => {
      await api.pedir('get', '/items', { cuenta: CUENTAS.OWNER_A, query: { restauranteId: REST, disponible: valor } })

      expect(items.findAll).toHaveBeenCalledWith(REST, esperado)
    })

    it.each([
      ['ROOT', CUENTAS.ROOT, REST],
      ['el GERENTE en otro restaurante', CUENTAS.GERENTE, MUNDO.REST_2],
      ['el MOZO', CUENTAS.MOZO, REST],
    ])('%s recibe 403', async (_caso, cuenta, restauranteId) => {
      const res = await api.pedir('get', '/items', { cuenta, query: { restauranteId } })

      expect(res.status).toBe(403)
      expect(items.findAll).not.toHaveBeenCalled()
    })
  })

  describe('las rutas de un ítem: autentican y le pasan la cuenta al service', () => {
    // El body va siempre (undefined si no lleva): con una fila más corta, jest pasa `done` en su lugar.
    const RUTAS: Array<[string, 'get' | 'patch' | 'delete' | 'put' | 'post', string, keyof typeof items, object | undefined]> = [
      ['GET /items/:id', 'get', '/items/item-1', 'findOne', undefined],
      ['PATCH /items/:id', 'patch', '/items/item-1', 'update', { nombre: 'Nueva' }],
      ['DELETE /items/:id', 'delete', '/items/item-1', 'remove', undefined],
      ['PUT /items/:id/descuento', 'put', '/items/item-1/descuento', 'setDescuento', { porcentaje: 20 }],
      ['DELETE /items/:id/descuento', 'delete', '/items/item-1/descuento', 'removeDescuento', undefined],
      ['DELETE /items/:id/imagen', 'delete', '/items/item-1/imagen', 'removeImagen', undefined],
      ['POST /items/:itemId/ingredientes', 'post', '/items/item-1/ingredientes', 'addIngrediente', { ingredienteId: MUNDO.REST_2, esOriginal: true, cantidad: 1 }],
      ['PATCH /items/:itemId/ingredientes/:id', 'patch', '/items/item-1/ingredientes/ii-1', 'updateIngrediente', { precioExtra: 1 }],
      ['DELETE /items/:itemId/ingredientes/:id', 'delete', '/items/item-1/ingredientes/ii-1', 'removeIngrediente', undefined],
    ]

    it.each(RUTAS)('%s: sin token, 401', async (_ruta, metodo, url, metodoDelService, body) => {
      const res = await api.pedir(metodo, url, { body })

      expect(res.status).toBe(401)
      expect(items[metodoDelService]).not.toHaveBeenCalled()
    })

    it.each(RUTAS)('%s: cuenta de Supabase sin Usuario, 403', async (_ruta, metodo, url, metodoDelService, body) => {
      const res = await api.pedir(metodo, url, { cuenta: SIN_USUARIO, body })

      expect(res.status).toBe(403)
      expect(items[metodoDelService]).not.toHaveBeenCalled()
    })

    it.each(RUTAS)('%s: con la cuenta, el service recibe al usuario', async (_ruta, metodo, url, metodoDelService, body) => {
      const res = await api.pedir(metodo, url, { cuenta: CUENTAS.GERENTE, body })

      expect(res.status).toBeLessThan(300)
      const argumentos = items[metodoDelService].mock.calls[0]
      expect(argumentos.at(-1)).toEqual(CUENTAS.GERENTE)
    })

    it('POST /items/:id/imagen sin archivo: 400 (el service no se llama)', async () => {
      const res = await api.pedir('post', '/items/item-1/imagen', { cuenta: CUENTAS.OWNER_A })

      expect(res.status).toBe(400)
    })

    it('POST /items/:id/imagen de más de 5 MB: 413, la corta multer antes de llegar al service', async () => {
      const res = await api
        .pedir('post', '/items/item-1/imagen', { cuenta: CUENTAS.COCINA })
        .attach('imagen', Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]), { filename: 'plato.png', contentType: 'image/png' })

      expect(res.status).toBe(413)
    })
  })

  describe('PUT /items/:id/descuento: validación del body', () => {
    it.each([
      ['precio con decimales', { precioDescuento: 1199.5 }],
      ['precio cero', { precioDescuento: 0 }],
      ['precio negativo', { precioDescuento: -5 }],
      ['precio como texto', { precioDescuento: '1200' }],
      ['porcentaje 0', { porcentaje: 0 }],
      ['porcentaje 100', { porcentaje: 100 }],
      ['porcentaje con decimales', { porcentaje: 12.5 }],
      ['porcentaje como texto', { porcentaje: '20' }],
    ])('%s → 400 y no llega al servicio', async (_caso, body) => {
      const res = await api.pedir('put', '/items/item-1/descuento', { cuenta: CUENTAS.OWNER_A, body })

      expect(res.status).toBe(400)
      expect(items.setDescuento).not.toHaveBeenCalled()
    })

    it('descarta los campos que no corresponden (no se puede cambiar el precio base por acá)', async () => {
      const res = await api.pedir('put', '/items/item-1/descuento', {
        cuenta: CUENTAS.OWNER_A,
        body: { porcentaje: 20, precioBase: 1, disponible: false },
      })

      expect(res.status).toBe(200)
      expect(res.body).toEqual(RESULTADO)
      expect(items.setDescuento).toHaveBeenCalledWith('item-1', { porcentaje: 20 }, CUENTAS.OWNER_A)
    })

    it('acepta los extremos válidos: 1% y 99%, y un precio de $1', async () => {
      for (const body of [{ porcentaje: 1 }, { porcentaje: 99 }, { precioDescuento: 1 }]) {
        const res = await api.pedir('put', '/items/item-1/descuento', { cuenta: CUENTAS.OWNER_A, body })
        expect(res.status).toBe(200)
      }
    })
  })
})
