import { AppDeEndpoints, CUENTAS, crearAppDeEndpoints, MUNDO, SIN_USUARIO } from '../test/app-endpoints'
import { MarcaController } from './marca.controller'
import { MarcaService } from './marca.service'

// Las rutas de /marcas solo autentican: ser OWNER de la marca lo exige el service (marca.service.spec).
describe('endpoints de marcas', () => {
  let api: AppDeEndpoints
  const marcas = { findAll: jest.fn(), findOne: jest.fn(), update: jest.fn() }
  const MARCA = MUNDO.MARCA_A

  beforeAll(async () => {
    api = await crearAppDeEndpoints(MarcaController, [{ provide: MarcaService, useValue: marcas }])
  })

  afterAll(() => api.cerrar())

  beforeEach(() => {
    jest.clearAllMocks()
    marcas.findAll.mockResolvedValue([{ id: MARCA }])
    marcas.findOne.mockResolvedValue({ id: MARCA })
    marcas.update.mockResolvedValue({ id: MARCA })
  })

  it('GET /marcas, GET y PATCH /marcas/:id le pasan la cuenta al service', async () => {
    const lista = await api.pedir('get', '/marcas', { cuenta: CUENTAS.OWNER_A })
    const detalle = await api.pedir('get', `/marcas/${MARCA}`, { cuenta: CUENTAS.OWNER_A })
    const cambio = await api.pedir('patch', `/marcas/${MARCA}`, { cuenta: CUENTAS.OWNER_A, body: { nombre: 'Nueva' } })

    expect([lista.status, detalle.status, cambio.status]).toEqual([200, 200, 200])
    expect(marcas.findAll).toHaveBeenCalledWith(CUENTAS.OWNER_A)
    expect(marcas.findOne).toHaveBeenCalledWith(MARCA, CUENTAS.OWNER_A)
    expect(marcas.update).toHaveBeenCalledWith(MARCA, { nombre: 'Nueva' }, CUENTAS.OWNER_A)
  })

  it('PATCH con un nombre vacío: 400', async () => {
    const res = await api.pedir('patch', `/marcas/${MARCA}`, { cuenta: CUENTAS.OWNER_A, body: { nombre: '' } })

    expect(res.status).toBe(400)
    expect(marcas.update).not.toHaveBeenCalled()
  })

  it('sin token 401 y sin Usuario 403', async () => {
    const anonimo = await api.pedir('get', '/marcas')
    const sinUsuario = await api.pedir('get', `/marcas/${MARCA}`, { cuenta: SIN_USUARIO })

    expect(anonimo.status).toBe(401)
    expect(sinUsuario.status).toBe(403)
    expect(marcas.findAll).not.toHaveBeenCalled()
    expect(marcas.findOne).not.toHaveBeenCalled()
  })

  it.each([
    ['POST /marcas', 'post', '/marcas'],
    ['DELETE /marcas/:id', 'delete', `/marcas/${MARCA}`],
  ] as const)('%s ya no existe (vive en /root): 404', async (_ruta, metodo, url) => {
    const res = await api.pedir(metodo, url, { cuenta: CUENTAS.OWNER_A, body: { nombre: 'Nueva', slug: 'nueva' } })

    expect(res.status).toBe(404)
  })
})
