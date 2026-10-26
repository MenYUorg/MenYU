import { act, render, screen } from '@testing-library/react'
import type { Pedido } from '@menyu/types'
import * as socketService from '../services/socket'
import { useNotifStore } from '../store/notificationStore'
import { perfilDeMozo, reiniciarSesionDePrueba } from '../test/authClient'
import { montarContexto, reiniciarContexto } from '../test/contexto'
import { MozoNotifications } from './MozoNotifications'

vi.mock('@menyu/auth-client', async () => (await import('../test/authClient')).moduloSimulado())

const oyentes: {
  llamado?: (d: { llamadoId: string; sesionId: string; mesaNumero: string; motivo: string }) => void
  nuevo?: (p: Pedido) => void
  actualizado?: (p: Pedido) => void
} = {}
const desuscribir = { llamado: vi.fn(), nuevo: vi.fn(), actualizado: vi.fn() }
vi.mock('../services/socket', () => ({
  joinRestauranteComoMozo: vi.fn(),
  onMozoCalled: vi.fn((fn) => { oyentes.llamado = fn; return desuscribir.llamado }),
  onPedidoNuevo: vi.fn((fn) => { oyentes.nuevo = fn; return desuscribir.nuevo }),
  onPedidoActualizado: vi.fn((fn) => { oyentes.actualizado = fn; return desuscribir.actualizado }),
}))

const pedido = (estado: string, mesa?: string, cantidades: number[] = []) =>
  ({
    id: 'p-1',
    estado,
    ...(mesa ? { mesa: { numero: mesa } } : {}),
    items: cantidades.map((cantidad) => ({ cantidad })),
  } as unknown as Pedido)

beforeEach(() => {
  vi.clearAllMocks()
  reiniciarSesionDePrueba()
  reiniciarContexto()
  montarContexto(perfilDeMozo('rest-1'))
  useNotifStore.setState({ notifications: [] })
})

describe('MozoNotifications', () => {
  it('se une al restaurante del contexto, no al del token', () => {
    render(<MozoNotifications />)

    expect(socketService.joinRestauranteComoMozo).toHaveBeenCalledWith('rest-1')
  })

  it('sin restaurante elegido no se une a nada', () => {
    reiniciarContexto()

    render(<MozoNotifications />)

    expect(socketService.joinRestauranteComoMozo).not.toHaveBeenCalled()
  })

  it('sin notificaciones no muestra nada', () => {
    const { container } = render(<MozoNotifications />)

    expect(container).toBeEmptyDOMElement()
  })

  it('un llamado de "pedir cuenta" y uno de asistencia avisan distinto', () => {
    render(<MozoNotifications />)

    act(() => oyentes.llamado!({ llamadoId: 'll-1', sesionId: 's-1', mesaNumero: '4', motivo: 'pedir_cuenta' }))
    expect(screen.getByText('Pedir la cuenta')).toBeInTheDocument()
    expect(screen.getByText('Mesa 4')).toBeInTheDocument()

    act(() => oyentes.llamado!({ llamadoId: 'll-2', sesionId: 's-2', mesaNumero: '7', motivo: 'general' }))
    expect(screen.getByText('Llamado al mozo')).toBeInTheDocument()
    expect(screen.getByText('Mesa 7')).toBeInTheDocument()
  })

  it('un pedido nuevo avisa con la mesa y la cantidad de ítems', () => {
    render(<MozoNotifications />)

    act(() => oyentes.nuevo!(pedido('pendiente', '4', [2, 1])))

    expect(screen.getByText('Nuevo pedido')).toBeInTheDocument()
    expect(screen.getByText('Mesa 4 · 3 ítems')).toBeInTheDocument()
  })

  it('un pedido nuevo sin mesa ni ítems igual avisa', () => {
    render(<MozoNotifications />)

    act(() => oyentes.nuevo!(pedido('pendiente')))

    expect(screen.getByText('Mesa desconocida · 0 ítems')).toBeInTheDocument()
  })

  it('solo avisa del pedido que quedó listo', () => {
    render(<MozoNotifications />)

    act(() => oyentes.actualizado!(pedido('en_preparacion', '4')))
    expect(screen.queryByText('Pedido listo')).not.toBeInTheDocument()

    act(() => oyentes.actualizado!(pedido('listo', '4')))
    expect(screen.getByText('Pedido listo')).toBeInTheDocument()
    expect(screen.getByText('Mesa 4 · listo para entregar')).toBeInTheDocument()
  })

  it('al salir deja de escuchar', () => {
    const { unmount } = render(<MozoNotifications />)

    unmount()

    expect(desuscribir.llamado).toHaveBeenCalledTimes(1)
    expect(desuscribir.nuevo).toHaveBeenCalledTimes(1)
    expect(desuscribir.actualizado).toHaveBeenCalledTimes(1)
  })
})
