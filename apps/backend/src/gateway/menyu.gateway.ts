import { Logger } from '@nestjs/common'
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import { Namespace, Socket } from 'socket.io'
import { isAllowedOrigin } from '../common/is-allowed-origin'
import {
  AccesoDelSocket,
  esIdDeRestaurante,
  esToken,
  MotivoDeRechazo,
  SalaDelPersonal,
} from './acceso-del-socket.service'

/** Lo que responde un join. El motivo de un rechazo queda en el log, nunca en la respuesta. */
export type RespuestaDelJoin = { ok: true; sesion?: boolean } | { ok: false; error: 'No autorizado' }

const NO_AUTORIZADO = { ok: false, error: 'No autorizado' } as const

/** Los datos de un socket del personal: está en un solo restaurante a la vez, en una o en las dos salas. */
interface DatosDelPersonal {
  usuarioId: string
  restauranteId: string
  salas: SalaDelPersonal[]
}

/** El nombre de cada sala lo arma el servidor: el cliente solo manda un id, que se valida antes. */
const SALA = {
  salon: (restauranteId: string) => `salon:${restauranteId}`,
  cocina: (restauranteId: string) => `cocina:${restauranteId}`,
  sesion: (sesionId: string) => `sesion:${sesionId}`,
  menu: (restauranteId: string) => `menu:${restauranteId}`,
}

/** Lo que sale del payload de un join sin confiar en su forma. */
function restauranteDelPayload(data: unknown): unknown {
  return typeof data === 'object' && data !== null ? (data as { restauranteId?: unknown }).restauranteId : undefined
}

/** Para el log: un id que vino del cliente puede ser cualquier cosa. */
function paraElLog(valor: unknown): string {
  return typeof valor === 'string' ? JSON.stringify(valor.slice(0, 64)) : typeof valor
}

/**
 * El Socket.io de MenYU (DT-08, docs/auth/specs/auth.md). Cuatro salas, cuyo nombre arma el servidor:
 * - `salon:{restauranteId}` (`mozo:join`): el personal de salón (SALON).
 * - `cocina:{restauranteId}` (`cocina:join`): todo el personal (TODO_EL_PERSONAL).
 * - `sesion:{sesionId}` (`session:join` con el JWT de mesa): el comensal de esa sesión.
 * - `menu:{restauranteId}` (`session:join`, con o sin token): pública, solo avisa que cambió la carta.
 * El token va en el handshake (`auth.token`) y se verifica en cada join: un socket sin join válido no recibe nada.
 */
@WebSocketGateway({
  // Protege solo de otras páginas en un navegador; la barrera real es el token de cada join.
  cors: { origin: (origin: string | undefined, callback: (error: Error | null, permitido?: boolean) => void) => callback(null, isAllowedOrigin(origin)) },
  namespace: '/ws',
})
export class MenyuGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(MenyuGateway.name)

  /** Con `namespace`, lo que inyecta Nest es el Namespace `/ws`, no el Server. */
  @WebSocketServer()
  server!: Namespace

  constructor(private readonly accesoDelSocket: AccesoDelSocket) {}

  handleConnection(client: Socket) {
    this.logger.debug(`conectado: ${client.id}`)
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`desconectado: ${client.id}`)
  }

  @SubscribeMessage('mozo:join')
  unirseAlSalon(@MessageBody() data: unknown, @ConnectedSocket() client: Socket): Promise<RespuestaDelJoin> {
    return this.unirseAlPersonal(client, 'mozo:join', 'salon', restauranteDelPayload(data))
  }

  @SubscribeMessage('cocina:join')
  unirseALaCocina(@MessageBody() data: unknown, @ConnectedSocket() client: Socket): Promise<RespuestaDelJoin> {
    return this.unirseAlPersonal(client, 'cocina:join', 'cocina', restauranteDelPayload(data))
  }

  /**
   * El comensal. Con el JWT de su mesa entra a su sesión y a la carta de su restaurante, los dos sacados del token (el
   * payload se ignora). Sin token, o con uno que no es de mesa, entra solo a la carta del restaurante del payload.
   */
  @SubscribeMessage('session:join')
  unirseALaSesion(@MessageBody() data: unknown, @ConnectedSocket() client: Socket): RespuestaDelJoin {
    const sesion = this.accesoDelSocket.comensal(this.tokenDe(client))
    if (sesion) {
      void client.join([SALA.sesion(sesion.sesionId), SALA.menu(sesion.restauranteId)])
      return { ok: true, sesion: true }
    }

    const restauranteId = restauranteDelPayload(data)
    if (!esIdDeRestaurante(restauranteId)) return this.rechazar(client, 'session:join', restauranteId, 'restaurante-invalido')
    void client.join(SALA.menu(restauranteId))
    return { ok: true, sesion: false }
  }

  emitOrderNew(restauranteId: string, pedido: unknown) {
    this.server.to([SALA.salon(restauranteId), SALA.cocina(restauranteId)]).emit('order:new', pedido)
  }

  emitOrderUpdated(restauranteId: string, pedido: { sesionId?: string | null }) {
    const salas = [SALA.salon(restauranteId), SALA.cocina(restauranteId)]
    if (pedido.sesionId) salas.push(SALA.sesion(pedido.sesionId))
    this.server.to(salas).emit('order:updated', pedido)
  }

  emitOrderEdited(restauranteId: string, pedido: unknown) {
    this.server.to([SALA.salon(restauranteId), SALA.cocina(restauranteId)]).emit('order:edited', pedido)
  }

  emitMozoCalled(restauranteId: string, data: { llamadoId: string; sesionId: string; mesaNumero: string; motivo: string }) {
    this.server.to(SALA.salon(restauranteId)).emit('waiter:called', data)
  }

  emitSesionCerrada(restauranteId: string, sesionId: string) {
    this.server.to([SALA.salon(restauranteId), SALA.sesion(sesionId)]).emit('sesion:cerrada', { sesionId })
  }

  emitQuierePagar(restauranteId: string, data: { sesionId: string; mesaId: string; mesaNumero: string; totalAcumulado: number }) {
    this.server.to(SALA.salon(restauranteId)).emit('sesion:quierePagar', data)
  }

  emitSesionCobrada(restauranteId: string, data: { sesionId: string; mesaId: string; mesaNumero: string }) {
    this.server.to([SALA.salon(restauranteId), SALA.sesion(data.sesionId)]).emit('sesion:cobrada', data)
  }

  emitMenuUpdated(restauranteId: string) {
    this.server.to(SALA.menu(restauranteId)).emit('menu:updated', { restauranteId })
  }

  private async unirseAlPersonal(
    client: Socket,
    evento: 'mozo:join' | 'cocina:join',
    sala: SalaDelPersonal,
    restauranteId: unknown,
  ): Promise<RespuestaDelJoin> {
    const acceso = await this.accesoDelSocket.personal(this.tokenDe(client), restauranteId, sala)
    if (!acceso.ok) return this.rechazar(client, evento, restauranteId, acceso.motivo)
    const id = restauranteId as string

    // Un restaurante a la vez: el join a otro saca al socket de las salas del anterior.
    const anterior = this.personalDe(client)
    const salas = anterior?.restauranteId === id ? anterior.salas : []
    if (anterior && anterior.restauranteId !== id) {
      for (const suya of anterior.salas) void client.leave(SALA[suya](anterior.restauranteId))
    }

    void client.join(SALA[sala](id))
    client.data.personal = {
      usuarioId: acceso.usuarioId,
      restauranteId: id,
      salas: salas.includes(sala) ? salas : [...salas, sala],
    } satisfies DatosDelPersonal
    return { ok: true }
  }

  private rechazar(client: Socket, evento: string, restauranteId: unknown, motivo: MotivoDeRechazo): RespuestaDelJoin {
    this.logger.warn(`join rechazado: socket ${client.id}, ${evento}, restaurante ${paraElLog(restauranteId)}, motivo ${motivo}`)
    return NO_AUTORIZADO
  }

  private tokenDe(client: Socket): string | undefined {
    const token: unknown = (client.handshake?.auth as { token?: unknown } | undefined)?.token
    return esToken(token) ? token : undefined
  }

  private personalDe(socket: Socket): DatosDelPersonal | undefined {
    return (socket.data as { personal?: DatosDelPersonal } | undefined)?.personal
  }
}
