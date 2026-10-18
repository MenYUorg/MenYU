import { AppDeEndpoints, USUARIOS, crearAppDeEndpoints } from '../test/app-endpoints'
import { PedidosController } from './pedidos.controller'
import { PedidosService } from './pedidos.service'

const UUID = (n: number) => `6f1c2a40-0000-4a1b-9c3d-${String(n).padStart(12, '0')}`
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

  describe('endpoints de staff', () => {
    it('GET /pedidos pasa restaurante y estado de la query', async () => {
      // Arrange
      pedidos.listarPorEstado.mockResolvedValue([])

      // Act
      const res = await api.pedir('get', '/pedidos', { usuario: USUARIOS.MOZO, query: { restauranteId: 'rest-1', estado: 'pendiente' } })

      // Assert
      expect(res.status).toBe(200)
      expect(pedidos.listarPorEstado.mock.calls[0].slice(0, 2)).toEqual(['rest-1', 'pendiente'])
    })

    it('sin JWT de staff responde 401', async () => {
      // Act
      const res = await api.pedir('get', '/pedidos', { query: { restauranteId: 'rest-1', estado: 'pendiente' } })

      // Assert
      expect(res.status).toBe(401)
    })

    it('POST /pedidos/staff crea el pedido con el usuario del token (201)', async () => {
      // Arrange
      pedidos.crearStaff.mockResolvedValue({ id: 'pedido-2' })

      // Act
      const res = await api.pedir('post', '/pedidos/staff', { usuario: USUARIOS.MOZO, body: PEDIDO })

      // Assert
      expect(res.status).toBe(201)
      expect(pedidos.crearStaff).toHaveBeenCalledWith(PEDIDO, USUARIOS.MOZO)
    })

    it('PATCH /pedidos/:id/estado acepta un estado válido', async () => {
      // Arrange
      pedidos.actualizarEstado.mockResolvedValue({ id: 'pedido-1', estado: 'listo' })

      // Act
      const res = await api.pedir('patch', '/pedidos/pedido-1/estado', { usuario: USUARIOS.MOZO, body: { estado: 'listo' } })

      // Assert
      expect(res.status).toBe(200)
      expect(pedidos.actualizarEstado.mock.calls[0][0]).toBe('pedido-1')
      expect(pedidos.actualizarEstado.mock.calls[0][1]).toEqual({ estado: 'listo' })
    })

    it('PATCH /pedidos/:id/estado con un estado fuera de la lista responde 400', async () => {
      // Act
      const res = await api.pedir('patch', '/pedidos/pedido-1/estado', { usuario: USUARIOS.MOZO, body: { estado: 'cancelado' } })

      // Assert
      expect(res.status).toBe(400)
      expect(pedidos.actualizarEstado).not.toHaveBeenCalled()
    })

    it('PATCH /pedidos/:id/editar exige justificación y al menos una edición', async () => {
      // Act
      const sinEdiciones = await api.pedir('patch', '/pedidos/pedido-1/editar', {
        usuario: USUARIOS.OWNER,
        body: { justificacion: 'el cliente cambió', ediciones: [] },
      })
      const sinJustificacion = await api.pedir('patch', '/pedidos/pedido-1/editar', {
        usuario: USUARIOS.OWNER,
        body: { justificacion: '', ediciones: [{ pedidoItemId: UUID(5), cantidadNueva: 1 }] },
      })

      // Assert
      expect(sinEdiciones.status).toBe(400)
      expect(sinJustificacion.status).toBe(400)
      expect(pedidos.editarPedido).not.toHaveBeenCalled()
    })

    it('PATCH /pedidos/:id/editar con un body válido delega con el id', async () => {
      // Arrange
      pedidos.editarPedido.mockResolvedValue({ id: 'pedido-1' })
      const body = { justificacion: 'el cliente cambió', ediciones: [{ pedidoItemId: UUID(5), cantidadNueva: 0 }] }

      // Act
      const res = await api.pedir('patch', '/pedidos/pedido-1/editar', { usuario: USUARIOS.OWNER, body })

      // Assert
      expect(res.status).toBe(200)
      expect(pedidos.editarPedido.mock.calls[0][0]).toBe('pedido-1')
      expect(pedidos.editarPedido.mock.calls[0][1]).toEqual(body)
    })

    it('GET /pedidos/:id/ediciones delega con el id', async () => {
      // Arrange
      pedidos.getEdiciones.mockResolvedValue([])

      // Act
      const res = await api.pedir('get', '/pedidos/pedido-1/ediciones', { usuario: USUARIOS.OWNER })

      // Assert
      expect(res.status).toBe(200)
      expect(pedidos.getEdiciones.mock.calls[0][0]).toBe('pedido-1')
    })
  })

  describe('GET /pedidos/auditoria (solo OWNER)', () => {
    it('el OWNER consulta la auditoría con el rango', async () => {
      // Arrange
      pedidos.auditoriaEdiciones.mockResolvedValue([])

      // Act
      const res = await api.pedir('get', '/pedidos/auditoria', {
        usuario: USUARIOS.OWNER,
        query: { restauranteId: 'rest-1', desde: '2026-10-01', hasta: '2026-10-17' },
      })

      // Assert
      expect(res.status).toBe(200)
      expect(pedidos.auditoriaEdiciones.mock.calls[0].slice(0, 3)).toEqual(['rest-1', '2026-10-01', '2026-10-17'])
    })

    it('un GERENTE no ve la auditoría (403)', async () => {
      // Act
      const res = await api.pedir('get', '/pedidos/auditoria', { usuario: USUARIOS.GERENTE, query: { restauranteId: 'rest-1' } })

      // Assert
      expect(res.status).toBe(403)
    })
  })
})
