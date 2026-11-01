import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { UIMessageChunk } from 'ai'
import { SessionJwtPayload, verificarSesionDeMesa } from '../auth/guards/session-auth.guard'
import { restauranteDisponible, SELECT_DISPONIBILIDAD } from '../common/restaurante-disponible'
import { PrismaService } from '../prisma/prisma.service'
import { ConfiguracionDelAsistente, configuracionDelAsistente } from './configuracion'
import { ContextoService } from './contexto.service'
import { errorDelAsistente } from './errores'
import { MensajeDelChat, ProveedorService } from './proveedor.service'
import { RegistroAsistenteService } from './registro-asistente.service'

/** Las respuestas del asistente que vuelven en el historial: una de 500 tokens ronda los 2.500 caracteres. */
const MAX_CARACTERES_RESPUESTA_EN_HISTORIAL = 4000

/**
 * El historial que va al modelo: los últimos N mensajes (el backend trunca, no rechaza), cada uno con un tope de largo y
 * sin los vacíos. Arranca en un mensaje del usuario y une los seguidos del mismo rol (una pregunta que se quedó sin
 * respuesta porque falló deja dos seguidos), porque hay proveedores que piden que los roles alternen.
 */
export function historialParaElModelo(
  mensajes: MensajeDelChat[],
  { maxMensajesHistorial, maxCaracteresPregunta }: ConfiguracionDelAsistente,
): MensajeDelChat[] {
  const recortados = mensajes
    .slice(-maxMensajesHistorial)
    .map((m) => ({
      rol: m.rol,
      contenido: m.contenido.trim().slice(0, m.rol === 'usuario' ? maxCaracteresPregunta : MAX_CARACTERES_RESPUESTA_EN_HISTORIAL),
    }))
    .filter((m) => m.contenido !== '')
  const desdeElUsuario = recortados.slice(Math.max(0, recortados.findIndex((m) => m.rol === 'usuario')))
  return desdeElUsuario.reduce<MensajeDelChat[]>((historial, mensaje) => {
    const anterior = historial[historial.length - 1] as MensajeDelChat | undefined
    if (anterior?.rol === mensaje.rol) anterior.contenido = `${anterior.contenido}\n\n${mensaje.contenido}`
    else historial.push(mensaje)
    return historial
  }, [])
}

/**
 * `POST /asistente/:restauranteId/mensajes` (docs/asistente/specs/asistente.md, Fase 4): valida el pedido en el orden de
 * la spec, registra el intento y arranca la respuesta del modelo. Lo que falla antes del stream responde su status con
 * `{ codigo, mensaje }`.
 */
@Injectable()
export class AsistenteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly contexto: ContextoService,
    private readonly proveedor: ProveedorService,
    private readonly registro: RegistroAsistenteService,
  ) {}

  async responder(
    restauranteId: string,
    mensajes: MensajeDelChat[],
    authHeader: string | undefined,
  ): Promise<ReadableStream<UIMessageChunk>> {
    await this.exigirAsistenteHabilitado(restauranteId)
    const sesionMesaId = this.sesionDeMesa(restauranteId, authHeader)
    const configuracion = configuracionDelAsistente()
    const pregunta = this.pregunta(mensajes, configuracion.maxCaracteresPregunta)
    const historial = historialParaElModelo(mensajes, configuracion)
    // Los límites de uso (Fase 5) van acá: con el pedido ya validado y antes de registrar el intento.

    const system = await this.contexto.systemPrompt(restauranteId)
    const registroId = await this.registro.iniciar({
      restauranteId,
      sesionMesaId,
      pregunta,
      modelo: this.proveedor.nombreDelModelo,
    })
    const arranque = await this.proveedor.responder(system, historial, (resultado) =>
      this.registro.completar(registroId, resultado),
    )
    if (!arranque.ok) throw errorDelAsistente(arranque.error.codigo, arranque.error.mensaje)
    return arranque.stream
  }

  /** El restaurante existe, está disponible (él y su marca, como la carta) y tiene el asistente prendido. */
  private async exigirAsistenteHabilitado(restauranteId: string): Promise<void> {
    const restaurante = await this.prisma.restaurante.findUnique({
      where: { id: restauranteId },
      select: { ...SELECT_DISPONIBILIDAD, informacionLocal: { select: { asistenteHabilitado: true } } },
    })
    if (!restaurante || !restauranteDisponible(restaurante) || !restaurante.informacionLocal?.asistenteHabilitado) {
      throw errorDelAsistente('asistente_deshabilitado')
    }
  }

  /**
   * El token de la sesión de mesa es opcional: sin él, la pregunta entra "sin sesión" (la carta vista desde Discovery).
   * Si viene, se verifica como en orders, pedidos y waiter-calls, y tiene que ser de este restaurante.
   */
  private sesionDeMesa(restauranteId: string, authHeader: string | undefined): string | null {
    if (!authHeader) return null
    let sesion: SessionJwtPayload
    try {
      sesion = verificarSesionDeMesa(this.jwt, authHeader)
    } catch {
      throw errorDelAsistente('sesion_invalida')
    }
    if (sesion.restauranteId !== restauranteId) throw errorDelAsistente('sesion_invalida')
    return sesion.sesionId
  }

  /** La pregunta es el último mensaje, y tiene que ser del usuario. */
  private pregunta(mensajes: MensajeDelChat[], maxCaracteres: number): string {
    const ultimo = mensajes[mensajes.length - 1] as MensajeDelChat | undefined
    const pregunta = ultimo?.rol === 'usuario' ? ultimo.contenido.trim() : ''
    if (!pregunta) throw errorDelAsistente('pregunta_invalida')
    if (pregunta.length > maxCaracteres) {
      throw errorDelAsistente('pregunta_larga', `La pregunta puede tener hasta ${maxCaracteres} caracteres.`)
    }
    return pregunta
  }
}
