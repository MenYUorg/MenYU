import { BadRequestException, ConflictException, NotFoundException, PipeTransform } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { generarPassword, motivoContrasenaDebil } from './contrasenas'

/**
 * Reglas comunes de las cuentas que administra ROOT (dueños y otras cuentas ROOT). Funciones sueltas, sin estado.
 */

/** Las cuentas que se crean desde la consola usan las mismas 12 rondas que el script de cuentas ROOT. */
export const BCRYPT_ROUNDS_ROOT = 12

export const MENSAJE_EMAIL_EN_USO = 'Ese email ya lo usa otra cuenta'

/** Minúsculas y sin espacios: el login busca el email así, y la tabla `admin` es sensible a mayúsculas. */
export function normalizarEmail(texto: string): string {
  return texto.trim().toLowerCase()
}

type ClienteConCuentas = Pick<Prisma.TransactionClient, 'admin' | 'mozo' | 'cliente'>

/**
 * Prisma ejecuta `equals` con `mode: 'insensitive'` como `ILIKE`, y ahí `_` y `%` son comodines: sin escaparlos, `a_b@x.com` coincidiría
 * con `axb@x.com` y `%@x.com` con cualquier email de ese dominio (falsos 409). Se antepone la barra invertida, el escape de LIKE.
 */
export function comoTextoLiteral(texto: string): string {
  return texto.replace(/[\\%_]/g, '\\$&')
}

/**
 * 409 si el email ya lo usa un admin, un mozo o un cliente (sin importar mayúsculas). El login busca primero en `admin`, después en
 * `mozo` y después en `cliente`: una cuenta de admin con el mismo email que un mozo o un cliente taparía su inicio de sesión.
 * El mensaje no dice quién lo usa: ROOT no tiene por qué saber qué mozos o clientes hay.
 */
export async function exigirEmailLibre(tx: ClienteConCuentas, email: string, excluirAdminId?: string): Promise<void> {
  const igual = { equals: comoTextoLiteral(email), mode: 'insensitive' as const }
  const admin = await tx.admin.findFirst({
    where: { email: igual, ...(excluirAdminId ? { id: { not: excluirAdminId } } : {}) },
    select: { id: true },
  })
  const mozo = admin ? null : await tx.mozo.findFirst({ where: { email: igual }, select: { id: true } })
  const cliente = admin || mozo ? null : await tx.cliente.findFirst({ where: { email: igual }, select: { id: true } })
  if (admin || mozo || cliente) throw new ConflictException(MENSAJE_EMAIL_EN_USO)
}

/** La contraseña de una cuenta nueva o restablecida: la que eligió ROOT (si cumple) o una generada. */
export async function prepararPassword(
  elegida: string | undefined,
  email: string,
): Promise<{ passwordHash: string; passwordTemporal: string | null; generada: boolean }> {
  if (elegida !== undefined) {
    const motivo = motivoContrasenaDebil(elegida, email)
    if (motivo) throw new BadRequestException(`La contraseña no sirve: ${motivo}`)
    return { passwordHash: await bcrypt.hash(elegida, BCRYPT_ROUNDS_ROOT), passwordTemporal: null, generada: false }
  }
  const generada = generarPassword()
  return { passwordHash: await bcrypt.hash(generada, BCRYPT_ROUNDS_ROOT), passwordTemporal: generada, generada: true }
}

/** Una contraseña generada nueva, para restablecer. */
export async function generarPasswordTemporal(): Promise<{ passwordHash: string; passwordTemporal: string }> {
  const passwordTemporal = generarPassword()
  return { passwordHash: await bcrypt.hash(passwordTemporal, BCRYPT_ROUNDS_ROOT), passwordTemporal }
}

/** Cierra las sesiones renovables de la cuenta (la tabla `refresh_token` ya existe). El token de acceso vale hasta que vence. */
export async function revocarSesiones(tx: Pick<Prisma.TransactionClient, 'refreshToken'>, adminId: string): Promise<number> {
  const { count } = await tx.refreshToken.updateMany({
    where: { userId: adminId, userTipo: 'admin', revokedAt: null },
    data: { revokedAt: new Date() },
  })
  return count
}

/** El código de error de Prisma de una violación de clave única (el email), por si dos pedidos chocan entre la revisión y el alta. */
export function esEmailRepetido(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

/** Ejecuta una escritura de cuenta y, si choca con la clave única del email, responde 409 en vez de 500. */
export async function conConflictoDeEmail<T>(escritura: () => Promise<T>): Promise<T> {
  try {
    return await escritura()
  } catch (error) {
    if (esEmailRepetido(error)) throw new ConflictException(MENSAJE_EMAIL_EN_USO)
    throw error
  }
}

/**
 * Los ids de la ruta (`:id`) no se exigen UUID: la base tiene ids como `m-001` o `r-001`. Se valida solo la forma (como
 * IdRestaurantePipe de Discovery); si no la tiene, no puede ser de ningún registro y se responde como un id que no existe.
 */
export const FORMA_ID = /^[A-Za-z0-9_-]{1,64}$/

export class IdPipe implements PipeTransform<string, string> {
  constructor(private readonly queNoSeEncontro = 'No encontrado') {}

  transform(id: string): string {
    if (typeof id !== 'string' || !FORMA_ID.test(id)) throw new NotFoundException(this.queNoSeEncontro)
    return id
  }
}
