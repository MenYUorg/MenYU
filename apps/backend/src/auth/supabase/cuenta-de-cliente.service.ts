import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { errors, JWTPayload } from 'jose'
import { PrismaService } from '../../prisma/prisma.service'
import { FALLAS_DEL_JWKS, UUID, VerificadorTokenSupabase } from './verificador-token.service'

/** Como los topes de nombres de la consola: el nombre sale de `user_metadata`, que escribe la persona. */
export const LARGO_MAXIMO_DEL_NOMBRE = 80
export const NOMBRE_POR_DEFECTO = 'Cliente'

interface CuentaDeSupabase {
  supabaseUserId: string
  email: string | null
  nombre: string
}

/**
 * El `Cliente` de una cuenta de Supabase (docs/auth/specs/auth.md, Fase 4b): lo usa `POST /sessions/open` para dejar
 * la mesa a nombre de quien inició sesión. No crea `Usuario` ni `Membresia`: un `Cliente` no da acceso a nada del
 * personal, sea de quien sea la cuenta (el registro público está abierto).
 */
@Injectable()
export class CuentaDeClienteService {
  private readonly logger = new Logger(CuentaDeClienteService.name)

  constructor(
    private readonly verificador: VerificadorTokenSupabase,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * El id del `Cliente` de la cuenta del token, o null si el token no es válido (vencido, alterado, de otro proyecto) o
   * no se pudo verificar: quien llama sigue como invitado, sin error. En orden:
   * 1. El `Cliente` que ya tiene esa cuenta.
   * 2. Un `Cliente` del login anterior con el mismo email y sin cuenta: se vincula y conserva su historial, como la
   *    invitación con el `Mozo`. Supabase da sesión solo con el email confirmado ("Confirm email", Fase 0) o con Google
   *    (ver la nota de seguridad de la Fase 3b), así que quien tiene el token es dueño de ese email.
   * 3. Uno nuevo.
   */
  async clienteDe(token: string): Promise<string | null> {
    const cuenta = await this.cuentaDelToken(token)
    if (!cuenta) return null
    return (
      (await this.clienteDeLaCuenta(cuenta.supabaseUserId)) ??
      (await this.vincularPorEmail(cuenta)) ??
      (await this.crear(cuenta))
    )
  }

  private async cuentaDelToken(token: string): Promise<CuentaDeSupabase | null> {
    let claims: JWTPayload
    try {
      claims = await this.verificador.claims(token)
    } catch (error) {
      // Un token vencido o alterado es lo esperable; que no se pueda verificar ninguno (sin SUPABASE_URL o sin el JWKS), no.
      if (!(error instanceof errors.JOSEError) || FALLAS_DEL_JWKS.has(error.code)) {
        this.logger.warn(`No se pudo verificar el token de la cuenta de cliente: ${(error as Error).message}`)
      }
      return null
    }
    if (typeof claims.sub !== 'string' || !UUID.test(claims.sub)) return null
    return { supabaseUserId: claims.sub, email: emailDe(claims), nombre: nombreDe(claims) }
  }

  private async clienteDeLaCuenta(supabaseUserId: string): Promise<string | null> {
    const cliente = await this.prisma.cliente.findUnique({ where: { supabaseUserId }, select: { id: true } })
    return cliente?.id ?? null
  }

  /** La escritura va condicionada a que siga sin cuenta: si otro pedido lo vinculó antes, no se pisa. */
  private async vincularPorEmail(cuenta: CuentaDeSupabase): Promise<string | null> {
    if (!cuenta.email) return null
    const legacy = await this.prisma.cliente.findFirst({
      where: { supabaseUserId: null, email: { equals: cuenta.email, mode: 'insensitive' } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })
    if (!legacy) return null

    try {
      const { count } = await this.prisma.cliente.updateMany({
        where: { id: legacy.id, supabaseUserId: null },
        data: { supabaseUserId: cuenta.supabaseUserId },
      })
      return count === 1 ? legacy.id : null
    } catch (error) {
      // Otro pedido de la misma cuenta ya creó o vinculó su `Cliente`: se sigue con ese.
      if (esClaveRepetida(error)) return this.clienteDeLaCuenta(cuenta.supabaseUserId)
      throw error
    }
  }

  private async crear(cuenta: CuentaDeSupabase): Promise<string> {
    try {
      return await this.insertar(cuenta, cuenta.email)
    } catch (error) {
      if (!esClaveRepetida(error)) throw error
      // Dos pedidos de la misma cuenta a la vez: el otro ya lo creó.
      const existente = await this.clienteDeLaCuenta(cuenta.supabaseUserId)
      if (existente) return existente
      // El email es de otro `Cliente` que ya tiene su propia cuenta (por ejemplo, la persona cambió el email de esa
      // cuenta y registró otra con el anterior). No se le quita: el nuevo queda sin email.
      return this.insertar(cuenta, null)
    }
  }

  private async insertar(cuenta: CuentaDeSupabase, email: string | null): Promise<string> {
    const cliente = await this.prisma.cliente.create({
      data: { nombre: cuenta.nombre, email, supabaseUserId: cuenta.supabaseUserId },
      select: { id: true },
    })
    return cliente.id
  }
}

function emailDe(claims: JWTPayload): string | null {
  const email = claims['email']
  if (typeof email !== 'string' || !email.includes('@')) return null
  return email.trim().toLowerCase()
}

/**
 * El nombre que eligió la persona al registrarse (`nombre`, lo manda web-auth) o el que da Google (`full_name` o
 * `name`). Sin ninguno, "Cliente": la parte local del email no se usa porque el personal ve el nombre.
 */
function nombreDe(claims: JWTPayload): string {
  const metadatos = claims['user_metadata']
  if (metadatos === null || typeof metadatos !== 'object') return NOMBRE_POR_DEFECTO
  const { nombre, full_name, name } = metadatos as Record<string, unknown>
  for (const candidato of [nombre, full_name, name]) {
    if (typeof candidato !== 'string') continue
    // Sin caracteres de control y con los espacios emprolijados; se corta por caracteres, no por unidades de UTF-16.
    const limpio = candidato.replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim()
    if (limpio) return Array.from(limpio).slice(0, LARGO_MAXIMO_DEL_NOMBRE).join('').trim()
  }
  return NOMBRE_POR_DEFECTO
}

function esClaveRepetida(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}
