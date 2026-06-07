import { useMozoStore } from './mozoStore'
import type { Pedido } from '@menyu/types'

vi.mock('@menyu/auth', () => ({
  TOKEN_KEY: 'menyu_access_token',
  REFRESH_KEY: 'menyu_refresh_token',
}))

const makePedido = (id: string): Pedido => ({
  id,
  sesionId: 'sesion-1',
  mesaId: 'mesa-1',
  estado: 'listo',
  createdAt: new Date().toISOString(),
})

const makeLlamado = (sesionId: string, mesaNumero = '3') => ({
  llamadoId: `llamado-${sesionId}`,
  sesionId,
  mesaNumero,
  motivo: 'pedir cuenta',
})

describe('mozoStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useMozoStore.setState({ llamados: [], pedidosListos: [] })
  })

  // ── addLlamado ────────────────────────────────────────────────────────────

  describe('addLlamado', () => {
    it('agrega un llamado nuevo', () => {
      useMozoStore.getState().addLlamado(makeLlamado('sesion-1'))
      expect(useMozoStore.getState().llamados).toHaveLength(1)
    })

    it('mismo sesionId reemplaza el llamado anterior (no duplica)', () => {
      useMozoStore.getState().addLlamado(makeLlamado('sesion-1'))
      useMozoStore.getState().addLlamado(makeLlamado('sesion-1'))
      expect(useMozoStore.getState().llamados).toHaveLength(1)
    })

    it('sesionId diferente → llamados independientes', () => {
      useMozoStore.getState().addLlamado(makeLlamado('sesion-1'))
      useMozoStore.getState().addLlamado(makeLlamado('sesion-2', '7'))
      expect(useMozoStore.getState().llamados).toHaveLength(2)
    })

    it('nuevo llamado para misma mesa no está atendido', () => {
      useMozoStore.getState().addLlamado(makeLlamado('sesion-1'))
      useMozoStore.getState().marcarAtendido('sesion-1')
      useMozoStore.getState().addLlamado(makeLlamado('sesion-1'))
      const llamado = useMozoStore.getState().llamados.find((l) => l.sesionId === 'sesion-1')
      expect(llamado?.atendido).toBe(false)
    })
  })

  // ── marcarAtendido ────────────────────────────────────────────────────────

  describe('marcarAtendido', () => {
    it('marca el llamado de esa sesión como atendido', () => {
      useMozoStore.getState().addLlamado(makeLlamado('sesion-1'))
      useMozoStore.getState().marcarAtendido('sesion-1')
      expect(useMozoStore.getState().llamados[0].atendido).toBe(true)
    })

    it('no afecta llamados de otras sesiones', () => {
      useMozoStore.getState().addLlamado(makeLlamado('sesion-1'))
      useMozoStore.getState().addLlamado(makeLlamado('sesion-2'))
      useMozoStore.getState().marcarAtendido('sesion-1')
      const otro = useMozoStore.getState().llamados.find((l) => l.sesionId === 'sesion-2')
      expect(otro?.atendido).toBe(false)
    })
  })

  // ── agregarPedidoListo ────────────────────────────────────────────────────

  describe('agregarPedidoListo', () => {
    it('agrega el pedido a la lista de listos', () => {
      useMozoStore.getState().agregarPedidoListo(makePedido('p-1'))
      expect(useMozoStore.getState().pedidosListos).toHaveLength(1)
    })

    it('mismo pedidoId reemplaza el existente (no duplica)', () => {
      useMozoStore.getState().agregarPedidoListo(makePedido('p-1'))
      useMozoStore.getState().agregarPedidoListo(makePedido('p-1'))
      expect(useMozoStore.getState().pedidosListos).toHaveLength(1)
    })

    it('pedidoId diferente → pedidos independientes', () => {
      useMozoStore.getState().agregarPedidoListo(makePedido('p-1'))
      useMozoStore.getState().agregarPedidoListo(makePedido('p-2'))
      expect(useMozoStore.getState().pedidosListos).toHaveLength(2)
    })
  })

  // ── setRestauranteId ──────────────────────────────────────────────────────

  describe('setRestauranteId', () => {
    it('actualiza el restauranteId en el estado', () => {
      useMozoStore.getState().setRestauranteId('rest-42')
      expect(useMozoStore.getState().restauranteId).toBe('rest-42')
    })
  })
})
