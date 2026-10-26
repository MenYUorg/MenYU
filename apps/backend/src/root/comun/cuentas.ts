import { NotFoundException, PipeTransform } from '@nestjs/common'

/**
 * Reglas comunes de la consola de ROOT. Funciones sueltas, sin estado.
 */

/**
 * Prisma ejecuta `equals` con `mode: 'insensitive'` como `ILIKE`, y ahí `_` y `%` son comodines: sin escaparlos, `a_b@x.com` coincidiría
 * con `axb@x.com` y `%@x.com` con cualquier email de ese dominio. Se antepone la barra invertida, el escape de LIKE.
 */
export function comoTextoLiteral(texto: string): string {
  return texto.replace(/[\\%_]/g, '\\$&')
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
