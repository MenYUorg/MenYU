import { useCocinaStore } from './cocinaStore'
import type { Pedido } from '@menyu/types'

const makePedido = (id: string, estado: Pedido['estado'] = 'pendiente'): Pedido => ({
  id,
  sesionId: 'sesion-1',
  mesaId: 'mesa-1',
  estado,
  createdAt: new Date().toISOString(),
})

describe('cocinaStore', () => {
  beforeEach(() => {
    useCocinaStore.setState({ pedidos: [] })
  })

  // ── cargarPedidosIniciales ────────────────────────────────────────────────

  describe('cargarPedidosIniciales', () => {
    it('carga pedidos cuando el store está vacío', () => {
      const iniciales = [makePedido('p-1'), makePedido('p-2')]
      useCocinaStore.getState().cargarPedidosIniciales(iniciales)
      expect(useCocinaStore.getState().pedidos).toHaveLength(2)
    })

    it('no duplica pedidos que ya existen en el store', () => {
      useCocinaStore.setState({ pedidos: [makePedido('p-1')] })
      useCocinaStore.getState().cargarPedidosIniciales([makePedido('p-1'), makePedido('p-2')])
      expect(useCocinaStore.getState().pedidos).toHaveLength(2)
    })

    it('solo agrega los pedidos que no existen aún', () => {
      useCocinaStore.setState({ pedidos: [makePedido('p-1')] })
      useCocinaStore.getState().cargarPedidosIniciales([makePedido('p-2'), makePedido('p-3')])
      const ids = useCocinaStore.getState().pedidos.map((p) => p.id)
      expect(ids).toEqual(['p-1', 'p-2', 'p-3'])
    })
  })

  // ── agregarPedido ─────────────────────────────────────────────────────────

  describe('agregarPedido', () => {
    it('agrega el pedido al inicio de la lista', () => {
      useCocinaStore.setState({ pedidos: [makePedido('p-viejo')] })
      useCocinaStore.getState().agregarPedido(makePedido('p-nuevo'))
      expect(useCocinaStore.getState().pedidos[0].id).toBe('p-nuevo')
    })

    it('los pedidos anteriores permanecen', () => {
      useCocinaStore.setState({ pedidos: [makePedido('p-1')] })
      useCocinaStore.getState().agregarPedido(makePedido('p-2'))
      expect(useCocinaStore.getState().pedidos).toHaveLength(2)
    })
  })

  // ── actualizarEstado ──────────────────────────────────────────────────────

  describe('actualizarEstado', () => {
    it('actualiza el estado del pedido indicado', () => {
      useCocinaStore.setState({ pedidos: [makePedido('p-1', 'pendiente')] })
      useCocinaStore.getState().actualizarEstado('p-1', 'en_preparacion')
      expect(useCocinaStore.getState().pedidos[0].estado).toBe('en_preparacion')
    })

    it('no afecta otros pedidos', () => {
      useCocinaStore.setState({
        pedidos: [makePedido('p-1', 'pendiente'), makePedido('p-2', 'pendiente')],
      })
      useCocinaStore.getState().actualizarEstado('p-1', 'listo')
      expect(useCocinaStore.getState().pedidos[1].estado).toBe('pendiente')
    })

    it('un pedidoId inexistente no altera ningún pedido', () => {
      useCocinaStore.setState({ pedidos: [makePedido('p-1', 'pendiente')] })
      useCocinaStore.getState().actualizarEstado('no-existe', 'listo')
      expect(useCocinaStore.getState().pedidos[0].estado).toBe('pendiente')
    })
  })
})
