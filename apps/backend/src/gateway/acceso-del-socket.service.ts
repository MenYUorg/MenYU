import { Injectable, Logger } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Rol } from '@prisma/client'
import { errors } from 'jose'
import { verificarSesionDeMesa } from '../auth/guards/session-auth.guard'
import { SALON, TODO_EL_PERSONAL } from '../auth/roles-del-personal'
import { AccesoService } from '../auth/supabase/acceso.service'
import {
  FALLAS_DEL_JWKS,
  SupabaseNoConfiguradoError,
  UUID,
  VerificadorTokenSupabase,
} from '../auth/supabase/verificador-token.service'
import { PrismaService } from '../prisma/prisma.service'

/** Las salas del personal: `salon:` (mesas, llamados y cobros) y `cocina:` (los pedidos). */
export type SalaDelPersonal = 'salon' | 'cocina'

/** Quién entra a cada sala del personal (docs/auth/specs/auth.md, gateway). */
export const ROLES_DE_LA_SALA: Record<SalaDelPersonal, readonly Rol[]> = {
  salon: SALON,
  // Incluye MOZO: la pantalla de pedidos del mozo (web-staff, /mozo/pedidos) entra con `cocina:join`.
  cocina: TODO_EL_PERSONAL,
}

/** Por qué se rechazó un join. Solo va al log del servidor: el cliente recibe siempre el mismo "No autorizado". */
export type MotivoDeRechazo =
  | 'sin-token'
  | 'restaurante-invalido'
  | 'token-invalido'
  | 'usuario-inactivo'
  | 'sin-rol'
  | 'error-de-verificacion'

export type AccesoDelPersonal = { ok: true; usuarioId: string } | { ok: false; motivo: MotivoDeRechazo }

/** La sesión de mesa de un comensal, sacada de su token. */
export interface SesionDelComensal {
  sesionId: string
  restauranteId: string
}

/** Un token del handshake: solo un string no vacío. */
export function esToken(token: unknown): token is string {
  return typeof token === 'string' && token !== ''
}

/** Un id de restaurante del payload de un join: tiene que tener forma de UUID antes de tocar la base o las salas. */
export function esIdDeRestaurante(restauranteId: unknown): restauranteId is string {
  return typeof restauranteId === 'string' && UUID.test(restauranteId)
}

/**
 * Decide quién se une a qué sala del gateway (DT-08). El personal entra con el access token de Supabase y un rol en el
 * restaurante; el comensal, con el JWT de su sesión de mesa. No devuelve el detalle al cliente ni loguea el token.
 */
@Injectable()
export class AccesoDelSocket {
  private readonly logger = new Logger(AccesoDelSocket.name)

  constructor(
    private readonly verificador: VerificadorTokenSupabase,
    private readonly prisma: PrismaService,
    private readonly acceso: AccesoService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Si el token de Supabase es de un `Usuario` activo con un rol de la sala en ese restaurante. Una falla de
   * infraestructura (JWKS caído, base) también rechaza, y queda en el log con el detalle.
   */
  async personal(token: unknown, restauranteId: unknown, sala: SalaDelPersonal): Promise<AccesoDelPersonal> {
    if (!esToken(token)) return { ok: false, motivo: 'sin-token' }
    if (!esIdDeRestaurante(restauranteId)) return { ok: false, motivo: 'restaurante-invalido' }

    let supabaseUserId: string
    try {
      supabaseUserId = await this.verificador.verificar(token)
    } catch (error) {
      if (esFallaDeInfraestructura(error)) {
        this.logger.error(`No se pudo verificar el token del socket: ${(error as Error).message}`)
        return { ok: false, motivo: 'error-de-verificacion' }
      }
      return { ok: false, motivo: 'token-invalido' }
    }
    if (!UUID.test(supabaseUserId)) return { ok: false, motivo: 'token-invalido' }

    try {
      const usuario = await this.prisma.usuario.findUnique({
        where: { supabaseUserId },
        select: { id: true, activo: true },
      })
      if (!usuario?.activo) return { ok: false, motivo: 'usuario-inactivo' }
      if (!(await this.tieneRol(usuario.id, restauranteId, sala))) return { ok: false, motivo: 'sin-rol' }
      return { ok: true, usuarioId: usuario.id }
    } catch (error) {
      this.logger.error(`No se pudo verificar el acceso del socket: ${(error as Error).message}`)
      return { ok: false, motivo: 'error-de-verificacion' }
    }
  }

  /**
   * Un join más de un socket que ya entró como `usuarioId`: el token del handshake no se vuelve a verificar (el de
   * Supabase vence a la hora y la conexión dura todo el turno), pero sí la cuenta activa y el rol en la sala pedida.
   */
  async personalYaAutenticado(usuarioId: string, restauranteId: unknown, sala: SalaDelPersonal): Promise<AccesoDelPersonal> {
    if (!esIdDeRestaurante(restauranteId)) return { ok: false, motivo: 'restaurante-invalido' }
    try {
      const usuario = await this.prisma.usuario.findUnique({ where: { id: usuarioId }, select: { activo: true } })
      if (!usuario?.activo) return { ok: false, motivo: 'usuario-inactivo' }
      if (!(await this.tieneRol(usuarioId, restauranteId, sala))) return { ok: false, motivo: 'sin-rol' }
      return { ok: true, usuarioId }
    } catch (error) {
      this.logger.error(`No se pudo verificar el acceso del socket: ${(error as Error).message}`)
      return { ok: false, motivo: 'error-de-verificacion' }
    }
  }

  /** La sesión de mesa del token. Cualquier otra cosa (sin token, invitado, cuenta sin sesión, token de Supabase): null. */
  comensal(token: unknown): SesionDelComensal | null {
    if (!esToken(token)) return null
    try {
      const { sesionId, restauranteId } = verificarSesionDeMesa(this.jwt, `Bearer ${token}`)
      return { sesionId, restauranteId }
    } catch {
      return null
    }
  }

  /**
   * Para la revalidación periódica: si el usuario sigue activo y con un rol de la sala. Un error de base se propaga,
   * para que quien llama no revoque a nadie por una caída.
   */
  async sigueAutorizado(usuarioId: string, restauranteId: string, sala: SalaDelPersonal): Promise<boolean> {
    const usuario = await this.prisma.usuario.findUnique({ where: { id: usuarioId }, select: { activo: true } })
    if (!usuario?.activo) return false
    return this.tieneRol(usuarioId, restauranteId, sala)
  }

  private async tieneRol(usuarioId: string, restauranteId: string, sala: SalaDelPersonal): Promise<boolean> {
    const roles = await this.acceso.rolesEnRestaurante(usuarioId, restauranteId)
    return roles.some((rol) => ROLES_DE_LA_SALA[sala].includes(rol))
  }
}

/** Como en SupabaseAuthGuard: sin configurar, sin JWKS o un error que no es de jose no dicen nada del token. */
function esFallaDeInfraestructura(error: unknown): boolean {
  if (error instanceof SupabaseNoConfiguradoError) return true
  return !(error instanceof errors.JOSEError) || FALLAS_DEL_JWKS.has(error.code)
}
