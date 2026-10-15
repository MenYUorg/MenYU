import { Logger } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
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
import { PrismaService } from '../prisma/prisma.service'
import { destinatariosDeMesa } from './destinatarios-mesa'

export const ROOMS = {
  mozo: (mozoId: string) => `mozo-${mozoId}`,
  sesion: (sesionId: string) => `sesion-${sesionId}`,
  cocina: (restauranteId: string) => `restaurante-${restauranteId}-cocina`,
  admin: (restauranteId: string) => `restaurante-${restauranteId}-admin`,
  menu: (restauranteId: string) => `restaurante-${restauranteId}-menu`,
}

export type Identidad =
  | { tipo: 'sesion'; sesionId: string; restauranteId: string }
  | { tipo: 'mozo'; mozoId: string; restauranteId: string }
  | { tipo: 'admin'; adminId: string; rol: 'OWNER' | 'GERENTE' }

interface DatosSocket {
  listo?: Promise<Identidad | null>
}

interface TokenPayload {
  sub?: string
  tipo?: string
  typ?: string
  rol?: string
  sesionId?: string
  mesaId?: string
  restauranteId?: string
}

interface JoinData {
  restauranteId?: unknown
}

export interface JoinResult {
  ok: boolean
  error?: string
}

/** Lo mínimo que necesita el gateway de un pedido para saber a quién avisar. */
interface PedidoEmitible {
  sesionId: string
  mesaId: string
}

const NO_AUTORIZADO: JoinResult = { ok: false, error: 'No autorizado' }
const OK: JoinResult = { ok: true }

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/ws',
})
export class MenyuGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(MenyuGateway.name)

  @WebSocketServer()
  server!: Server

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  // ── Conexión ───────────────────────────────────────────────────────────────

  handleConnection(client: Socket) {
    // El cliente puede mandar su join apenas conecta, antes de que termine la
    // consulta a la base: los handlers esperan esta promesa.
    ;(client.data as DatosSocket).listo = this.autenticar(client)
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`desconectado: ${client.id}`)
  }

  private async autenticar(client: Socket): Promise<Identidad | null> {
    try {
      const auth = client.handshake.auth as { token?: unknown } | undefined
      const identidad = await this.resolverIdentidad(auth?.token)
      if (!identidad) {
        client.disconnect(true)
        return null
      }
      await this.unirRoomsBase(client, identidad)
      return identidad
    } catch (err) {
      this.logger.error(`falló la autenticación del socket ${client.id}`, err instanceof Error ? err.stack : String(err))
      client.disconnect(true)
      return null
    }
  }

  private async resolverIdentidad(token: unknown): Promise<Identidad | null> {
    if (typeof token !== 'string' || token === '') return null

    let payload: TokenPayload
    try {
      payload = this.jwt.verify<TokenPayload>(token)
    } catch {
      return null
    }

    if (payload.tipo === 'cliente') return this.identidadDeSesion(payload)
    if (payload.tipo === 'mozo') return this.identidadDeMozo(payload)
    if (payload.tipo === 'admin') return this.identidadDeAdmin(payload)
    return null
  }

  private identidadDeSesion(payload: TokenPayload): Identidad | null {
    const { sesionId, mesaId, restauranteId, typ } = payload
    // Un token de login de cliente (guest/registro) no trae estos claims.
    if (!sesionId || !mesaId || !restauranteId) return null
    // Los tokens de sesión emitidos antes de agregar `typ` (12 h de vida) no lo
    // traen: se aceptan si traen sesionId. FALLBACK A RETIRAR cuando hayan
    // vencido los tokens viejos: exigir `typ === 'session'`.
    if (typ !== undefined && typ !== 'session') return null
    return { tipo: 'sesion', sesionId, restauranteId }
  }

  private async identidadDeMozo(payload: TokenPayload): Promise<Identidad | null> {
    if (!payload.sub) return null
    const mozo = await this.prisma.mozo.findUnique({
      where: { id: payload.sub },
      select: { id: true, restauranteId: true, activo: true },
    })
    if (!mozo?.activo) return null
    return { tipo: 'mozo', mozoId: mozo.id, restauranteId: mozo.restauranteId }
  }

  private identidadDeAdmin(payload: TokenPayload): Identidad | null {
    // ROOT queda afuera: no accede a los datos privados de los restaurantes.
    if (!payload.sub || (payload.rol !== 'OWNER' && payload.rol !== 'GERENTE')) return null
    return { tipo: 'admin', adminId: payload.sub, rol: payload.rol }
  }

  private async unirRoomsBase(client: Socket, identidad: Identidad): Promise<void> {
    if (identidad.tipo === 'sesion') {
      await client.join([ROOMS.sesion(identidad.sesionId), ROOMS.menu(identidad.restauranteId)])
    } else if (identidad.tipo === 'mozo') {
      await client.join([ROOMS.mozo(identidad.mozoId), ROOMS.menu(identidad.restauranteId)])
    }
    // El admin no tiene restaurante fijo: entra con admin:join / cocina:join.
  }

  private async identidadDe(client: Socket): Promise<Identidad | null> {
    return (await (client.data as DatosSocket).listo) ?? null
  }

  // ── Joins ──────────────────────────────────────────────────────────────────
  // Ninguno toma el restaurante del body salvo el del admin, que se valida
  // contra la base. Mozo y sesión usan el de client.data.

  /** Compatibilidad: el comensal ya entró a sus rooms al conectar. */
  @SubscribeMessage('session:join')
  async handleJoinSesion(@ConnectedSocket() client: Socket): Promise<JoinResult> {
    const identidad = await this.identidadDe(client)
    return identidad?.tipo === 'sesion' ? OK : NO_AUTORIZADO
  }

  /** Compatibilidad: el mozo ya entró a su room al conectar. */
  @SubscribeMessage('mozo:join')
  async handleJoinMozo(@ConnectedSocket() client: Socket): Promise<JoinResult> {
    const identidad = await this.identidadDe(client)
    return identidad?.tipo === 'mozo' ? OK : NO_AUTORIZADO
  }

  /**
   * Limitación conocida: cualquier mozo del restaurante puede unirse a la room
   * de cocina (cocina no tiene rol propio). Se restringe cuando lo tenga.
   */
  @SubscribeMessage('cocina:join')
  async handleJoinCocina(
    @MessageBody() data: JoinData,
    @ConnectedSocket() client: Socket,
  ): Promise<JoinResult> {
    const identidad = await this.identidadDe(client)
    if (identidad?.tipo === 'mozo') {
      await client.join(ROOMS.cocina(identidad.restauranteId))
      return OK
    }
    if (identidad?.tipo === 'admin') return this.unirAdmin(client, identidad, data?.restauranteId, ROOMS.cocina)
    return NO_AUTORIZADO
  }

  @SubscribeMessage('admin:join')
  async handleJoinAdmin(
    @MessageBody() data: JoinData,
    @ConnectedSocket() client: Socket,
  ): Promise<JoinResult> {
    const identidad = await this.identidadDe(client)
    if (identidad?.tipo !== 'admin') return NO_AUTORIZADO
    return this.unirAdmin(client, identidad, data?.restauranteId, ROOMS.admin)
  }

  private async unirAdmin(
    client: Socket,
    identidad: Extract<Identidad, { tipo: 'admin' }>,
    restauranteId: unknown,
    room: (restauranteId: string) => string,
  ): Promise<JoinResult> {
    if (typeof restauranteId !== 'string' || restauranteId === '') {
      return { ok: false, error: 'restauranteId requerido' }
    }
    if (!(await this.adminTieneAcceso(identidad, restauranteId))) {
      return { ok: false, error: 'Sin acceso a este restaurante' }
    }
    await client.join(room(restauranteId))
    return OK
  }

  private async adminTieneAcceso(
    identidad: Extract<Identidad, { tipo: 'admin' }>,
    restauranteId: string,
  ): Promise<boolean> {
    if (identidad.rol === 'OWNER') {
      const [admin, restaurante] = await Promise.all([
        this.prisma.admin.findUnique({ where: { id: identidad.adminId }, select: { marcaId: true } }),
        this.prisma.restaurante.findUnique({ where: { id: restauranteId }, select: { marcaId: true } }),
      ])
      return !!admin?.marcaId && !!restaurante && admin.marcaId === restaurante.marcaId
    }
    const asignacion = await this.prisma.adminRestaurante.findUnique({
      where: { adminId_restauranteId: { adminId: identidad.adminId, restauranteId } },
    })
    return !!asignacion
  }

  // ── Emisión ────────────────────────────────────────────────────────────────
  // Ningún emit* rechaza: un fallo al resolver destinatarios se loguea y se
  // emite igual a las rooms fijas, para no romper el request que lo originó.

  async emitOrderNew(restauranteId: string, pedido: PedidoEmitible): Promise<void> {
    await this.emitirAMesa(pedido.mesaId, [ROOMS.cocina(restauranteId), ROOMS.admin(restauranteId)], 'order:new', pedido)
  }

  async emitOrderUpdated(restauranteId: string, pedido: PedidoEmitible): Promise<void> {
    await this.emitirAMesa(
      pedido.mesaId,
      [ROOMS.sesion(pedido.sesionId), ROOMS.cocina(restauranteId), ROOMS.admin(restauranteId)],
      'order:updated',
      pedido,
    )
  }

  async emitOrderEdited(restauranteId: string, pedido: PedidoEmitible): Promise<void> {
    await this.emitirAMesa(pedido.mesaId, [ROOMS.cocina(restauranteId), ROOMS.admin(restauranteId)], 'order:edited', pedido)
  }

  async emitMozoCalled(
    restauranteId: string,
    mesaId: string,
    data: { llamadoId: string; sesionId: string; mesaNumero: string; motivo: string },
  ): Promise<void> {
    await this.emitirAMesa(mesaId, [ROOMS.admin(restauranteId)], 'waiter:called', data)
  }

  async emitSesionCerrada(restauranteId: string, mesaId: string, sesionId: string): Promise<void> {
    await this.emitirAMesa(mesaId, [ROOMS.sesion(sesionId), ROOMS.admin(restauranteId)], 'sesion:cerrada', { sesionId })
  }

  async emitQuierePagar(
    restauranteId: string,
    data: { sesionId: string; mesaId: string; mesaNumero: string; totalAcumulado: number },
  ): Promise<void> {
    await this.emitirAMesa(data.mesaId, [ROOMS.admin(restauranteId)], 'sesion:quierePagar', data)
  }

  async emitSesionCobrada(
    restauranteId: string,
    data: { sesionId: string; mesaId: string; mesaNumero: string },
  ): Promise<void> {
    await this.emitirAMesa(data.mesaId, [ROOMS.sesion(data.sesionId), ROOMS.admin(restauranteId)], 'sesion:cobrada', data)
  }

  emitMenuUpdated(restauranteId: string): void {
    this.server.to(ROOMS.menu(restauranteId)).emit('menu:updated', { restauranteId })
  }

  private async emitirAMesa(mesaId: string, fijas: string[], evento: string, payload: unknown): Promise<void> {
    let mozos: string[] = []
    try {
      mozos = await destinatariosDeMesa(this.prisma, mesaId)
    } catch (err) {
      this.logger.error(`no se pudieron resolver los mozos de la mesa ${mesaId}`, err instanceof Error ? err.stack : String(err))
    }
    this.server.to([...mozos.map(ROOMS.mozo), ...fijas]).emit(evento, payload)
  }
}
