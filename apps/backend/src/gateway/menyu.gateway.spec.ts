import { Server, Socket } from 'socket.io'
import { MenyuGateway } from './menyu.gateway'

// El gateway de Socket.io: cada evento va a la sala de su restaurante.
// El servidor y el socket son dobles.
describe('MenyuGateway', () => {
  let gateway: MenyuGateway
  const emitir = jest.fn()
  const sala = jest.fn((_nombre: string) => ({ emit: emitir }))

  beforeEach(() => {
    jest.clearAllMocks()
    gateway = new MenyuGateway()
    gateway.server = { to: sala } as unknown as Server
  })

  it('registra las conexiones y desconexiones', () => {
    // Arrange
    const log = jest.spyOn(console, 'log').mockImplementation(() => {})
    const socket = { id: 's1' } as Socket

    // Act
    gateway.handleConnection(socket)
    gateway.handleDisconnect(socket)

    // Assert
    expect(log).toHaveBeenNthCalledWith(1, '[WS] conectado: s1')
    expect(log).toHaveBeenNthCalledWith(2, '[WS] desconectado: s1')
    log.mockRestore()
  })

  describe('emite a la sala del restaurante', () => {
    const pedido = { id: 'ped-1' }
    it.each([
      ['order:new', (g: MenyuGateway) => g.emitOrderNew('rest-1', pedido), pedido],
      ['order:updated', (g: MenyuGateway) => g.emitOrderUpdated('rest-1', pedido), pedido],
      ['order:edited', (g: MenyuGateway) => g.emitOrderEdited('rest-1', pedido), pedido],
      [
        'waiter:called',
        (g: MenyuGateway) => g.emitMozoCalled('rest-1', { llamadoId: 'll-1', sesionId: 'ses-1', mesaNumero: '4', motivo: 'general' }),
        { llamadoId: 'll-1', sesionId: 'ses-1', mesaNumero: '4', motivo: 'general' },
      ],
      ['sesion:cerrada', (g: MenyuGateway) => g.emitSesionCerrada('rest-1', 'ses-1'), { sesionId: 'ses-1' }],
      [
        'sesion:quierePagar',
        (g: MenyuGateway) => g.emitQuierePagar('rest-1', { sesionId: 'ses-1', mesaId: 'm-1', mesaNumero: '4', totalAcumulado: 2500 }),
        { sesionId: 'ses-1', mesaId: 'm-1', mesaNumero: '4', totalAcumulado: 2500 },
      ],
      [
        'sesion:cobrada',
        (g: MenyuGateway) => g.emitSesionCobrada('rest-1', { sesionId: 'ses-1', mesaId: 'm-1', mesaNumero: '4' }),
        { sesionId: 'ses-1', mesaId: 'm-1', mesaNumero: '4' },
      ],
      ['menu:updated', (g: MenyuGateway) => g.emitMenuUpdated('rest-1'), { restauranteId: 'rest-1' }],
    ])('%s', (evento, emitirEvento, datos) => {
      // Act
      emitirEvento(gateway)

      // Assert
      expect(sala).toHaveBeenCalledWith('restaurante-rest-1')
      expect(emitir).toHaveBeenCalledWith(evento, datos)
    })
  })
})
