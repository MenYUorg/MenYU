import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/ws',
})
export class MenyuGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server

  handleConnection(client: Socket) {
    console.log(`[WS] conectado: ${client.id}`)
  }

  handleDisconnect(client: Socket) {
    console.log(`[WS] desconectado: ${client.id}`)
  }

  @SubscribeMessage('session:join')
  handleJoinRestaurante(
    @MessageBody() data: { restauranteId: string },
    @ConnectedSocket() client: Socket,
  ) {
    void client.join(`restaurante-${data.restauranteId}`)
    return { ok: true }
  }

  emitOrderNew(restauranteId: string, pedido: unknown) {
    this.server.to(`restaurante-${restauranteId}`).emit('order:new', pedido)
  }

  emitOrderUpdated(restauranteId: string, pedido: unknown) {
    this.server.to(`restaurante-${restauranteId}`).emit('order:updated', pedido)
  }

  emitMozoCalled(restauranteId: string, data: { sesionId: string; mesaNumero: string }) {
    this.server.to(`restaurante-${restauranteId}`).emit('mozo:llamado', data)
  }

  emitSesionCerrada(restauranteId: string, sesionId: string) {
    this.server.to(`restaurante-${restauranteId}`).emit('sesion:cerrada', { sesionId })
  }
}
