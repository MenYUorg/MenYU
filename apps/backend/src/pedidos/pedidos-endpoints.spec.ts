import { AppDeEndpoints, CUENTAS, crearAppDeEndpoints, MUNDO, SIN_USUARIO } from '../test/app-endpoints'
import { PedidosController } from './pedidos.controller'
import { PedidosService } from './pedidos.service'

const UUID = (n: number) => `6f1c2a40-0000-4a1b-9c3d-${String(n).padStart(12, '0')}`
const REST = MUNDO.REST_1
const PEDIDO = {
  sesionId: UUID(1),
  mesaId: UUID(2),
  items: [{ itemId: UUID(3), cantidad: 2, mods: [{ itemIngredienteId: UUID(4), accion: 'QUITAR', cantidad: 1 }] }],
}

describe('endpoints de pedidos', () => {
  let api: AppDeEndpoints
  const pedidos = {
    listarPorEstado: jest.fn(),
    auditoriaEdiciones: jest.fn(),
    confirmar: jest.fn(),
    crearStaff: jest.fn(),
    editarPedido: jest.fn(),
    getEdiciones: jest.fn(),
    actualizarEstado: jest.fn(),
  }

  beforeAll(async () => {
    api = await crearAppDeEndpoints(PedidosController, [{ provide: PedidosService, useValue: pedidos }])
  })

  afterAll(() => api.cerrar())

  beforeEach(() => jest.clearAllMocks())

  describe('POST /pedidos (comensal)', () => {
    it('confirma el pedido pasando el header Authorization tal cual (201)', async () => {
      // Arrange
      pedidos.confirmar.mockResolvedValue({ id: 'pedido-1' })

      // Act
      const res = await api.pedir('post', '/pedidos', { body: PEDIDO }).set('Authorization', 'Bearer token-de-sesion')

      // Assert
      expect(res.status).toBe(201)
      expect(pedidos.confirmar).toHaveBeenCalledWith('Bearer token-de-sesion', PEDIDO)
    })

    it.each([
      ['un ítem con cantidad 0', { ...PEDIDO, items: [{ itemId: UUID(3), cantidad: 0 }] }],
      ['una modificación con una acción inválida', { ...PEDIDO, items: [{ itemId: UUID(3), cantidad: 1, mods: [{ itemIngredienteId: UUID(4), accion: 'CAMBIAR', cantidad: 1 }] }] }],
      ['un sesionId que no es UUID', { ...PEDIDO, sesionId: 'sesion-1' }],
    ])('con %s responde 400 sin llegar al service', async (_caso, body) => {
      // Act
      const res = await api.pedir('post', '/pedidos', { body })

      // Assert
      expect(res.status).toBe(400)
      expect(pedidos.confirmar).not.toHaveBeenCalled()
    })
  })

  describe('GET /pedidos (todo el personal del restaurante de la query)', () => {
    it.each([
      ['la COCINA', CUENTAS.COCINA],
      ['el MOZO', CUENTAS.MOZO],
      ['el OWNER de la marca', CUENTAS.OWNER_A],
    ])('%s lista los pedidos del restaurante y el estado', async (_caso, cuenta) => {
      // Arrange
      pedidos.listarPorEstado.mockResolvedValue([])

      // Act
      const res = await api.pedir('get', '/pedidos', { cuenta, query: { restauranteId: REST, estado: 'pendiente' } })

      // Assert
      expect(res.status).toBe(200)
      expect(pedidos.listarPorEstado).toHaveBeenCalledWith(REST, 'pendiente')
    })

    it.each([
      ['ROOT', CUENTAS.ROOT, REST],
      ['el OWNER de otra marca (antes no se chequeaba la pertenencia)', CUENTAS.OWNER_B, REST],
      ['la COCINA en otro restaurante', CUENTAS.COCINA, MUNDO.REST_2],
    ])('%s recibe 403', async (_caso, cuenta, restauranteId) => {
      // Act
      const res = await api.pedir('get', '/pedidos', { cuenta, query: { restauranteId, estado: 'pendiente' } })

      // Assert
      expect(res.status).toBe(403)
      expect(pedidos.listarPorEstado).not.toHaveBeenCalled()
    })

    it('sin token responde 401, y con el token de la sesión de mesa también (no es del personal)', async () => {
      // Act
      const anonimo = await api.pedir('get', '/pedidos', { query: { restauranteId: REST, estado: 'pendiente' } })
      const comensal = await api
        .pedir('get', '/pedidos', { query: { restauranteId: REST, estado: 'pendiente' } })
        .set('Authorization', 'Bearer token-de-sesion')

      // Assert
      expect(anonimo.status).toBe(401)
      expect(comensal.status).toBe(401)
    })
  })

  describe('las rutas de un pedido: autentican y le pasan la cuenta al service', () => {
    it('POST /pedidos/staff crea el pedido con la cuenta (201)', async () => {
      // Arrange
      pedidos.crearStaff.mockResolvedValue({ id: 'pedido-2' })

      // Act
      const res = await api.pedir('post', '/pedidos/staff', { cuenta: CUENTAS.MOZO, body: PEDIDO })

      // Assert
      expect(res.status).toBe(201)
      expect(pedidos.crearStaff).toHaveBeenCalledWith(PEDIDO, CUENTAS.MOZO)
    })

    it('PATCH /pedidos/:id/estado acepta un estado válido', async () => {
      // Arrange
      pedidos.actualizarEstado.mockResolvedValue({ id: 'pedido-1', estado: 'listo' })

      // Act
      const res = await api.pedir('patch', '/pedidos/pedido-1/estado', { cuenta: CUENTAS.COCINA, body: { estado: 'listo' } })

      // Assert
      expect(res.status).toBe(200)
      expect(pedidos.actualizarEstado).toHaveBeenCalledWith('pedido-1', { estado: 'listo' }, CUENTAS.COCINA)
    })

    it('PATCH /pedidos/:id/estado con un estado fuera de la lista responde 400', async () => {
      // Act
      const res = await api.pedir('patch', '/pedidos/pedido-1/estado', { cuenta: CUENTAS.MOZO, body: { estado: 'cancelado' } })

      // Assert
      expect(res.status).toBe(400)
      expect(pedidos.actualizarEstado).not.toHaveBeenCalled()
    })

    it('PATCH /pedidos/:id/editar exige justificación y al menos una edición', async () => {
      // Act
      const sinEdiciones = await api.pedir('patch', '/pedidos/pedido-1/editar', {
        cuenta: CUENTAS.GERENTE,
        body: { justificacion: 'el cliente cambió', ediciones: [] },
      })
      const sinJustificacion = await api.pedir('patch', '/pedidos/pedido-1/editar', {
        cuenta: CUENTAS.GERENTE,
        body: { justificacion: '', ediciones: [{ pedidoItemId: UUID(5), cantidadNueva: 1 }] },
      })

      // Assert
      expect(sinEdiciones.status).toBe(400)
      expect(sinJustificacion.status).toBe(400)
      expect(pedidos.editarPedido).not.toHaveBeenCalled()
    })

    it('PATCH /pedidos/:id/editar con un body válido delega con el id y la cuenta', async () => {
      // Arrange
      pedidos.editarPedido.mockResolvedValue({ id: 'pedido-1' })
      const body = { justificacion: 'el cliente cambió', ediciones: [{ pedidoItemId: UUID(5), cantidadNueva: 0 }] }

      // Act
      const res = await api.pedir('patch', '/pedidos/pedido-1/editar', { cuenta: CUENTAS.MOZO, body })

      // Assert
      expect(res.status).toBe(200)
      expect(pedidos.editarPedido).toHaveBeenCalledWith('pedido-1', body, CUENTAS.MOZO)
    })

    it('GET /pedidos/:id/ediciones delega con el id y la cuenta', async () => {
      // Arrange
      pedidos.getEdiciones.mockResolvedValue([])

      // Act
      const res = await api.pedir('get', '/pedidos/pedido-1/ediciones', { cuenta: CUENTAS.OWNER_A })

      // Assert
      expect(res.status).toBe(200)
      expect(pedidos.getEdiciones).toHaveBeenCalledWith('pedido-1', CUENTAS.OWNER_A)
    })

    it.each([
      ['POST /pedidos/staff', 'post', '/pedidos/staff', PEDIDO],
      ['PATCH /pedidos/:id/estado', 'patch', '/pedidos/pedido-1/estado', { estado: 'listo' }],
      ['GET /pedidos/:id/ediciones', 'get', '/pedidos/pedido-1/ediciones', undefined],
    ] as const)('%s: sin token 401 y sin Usuario 403', async (_ruta, metodo, url, body) => {
      // Act
      const anonimo = await api.pedir(metodo, url, { body })
      const sinUsuario = await api.pedir(metodo, url, { cuenta: SIN_USUARIO, body })

      // Assert
      expect([anonimo.status, sinUsuario.status]).toEqual([401, 403])
    })
  })

  describe('GET /pedidos/auditoria (solo el OWNER)', () => {
    it('el OWNER consulta la auditoría con el rango', async () => {
      // Arrange
      pedidos.auditoriaEdiciones.mockResolvedValue([])

      // Act
      const res = await api.pedir('get', '/pedidos/auditoria', {
        cuenta: CUENTAS.OWNER_A,
        query: { restauranteId: REST, desde: '2026-10-01', hasta: '2026-10-17' },
      })

      // Assert
      expect(res.status).toBe(200)
      expect(pedidos.auditoriaEdiciones).toHaveBeenCalledWith(REST, '2026-10-01', '2026-10-17')
    })

    it.each([
      ['el GERENTE', CUENTAS.GERENTE],
      ['el OWNER de otra marca (antes no se chequeaba la pertenencia)', CUENTAS.OWNER_B],
      ['ROOT', CUENTAS.ROOT],
    ])('%s no ve la auditoría (403)', async (_caso, cuenta) => {
      // Act
      const res = await api.pedir('get', '/pedidos/auditoria', { cuenta, query: { restauranteId: REST } })

      // Assert
      expect(res.status).toBe(403)
      expect(pedidos.auditoriaEdiciones).not.toHaveBeenCalled()
    })
  })
})
