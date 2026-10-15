import { NotFoundException, PipeTransform } from '@nestjs/common'

/**
 * Cómo es el id de un restaurante: de 1 a 64 letras, números, guiones o guiones bajos. No se exige que sea un UUID:
 * la base tiene restaurantes con ids como `r-001`, que tienen que andar.
 */
export const FORMA_ID_RESTAURANTE = /^[A-Za-z0-9_-]{1,64}$/

/**
 * Pasa el id de la ruta tal cual si tiene la forma de un id de restaurante. Si no (el carácter nulo, que PostgreSQL no
 * acepta, comillas, espacios, barras, un texto larguísimo…), no puede ser de ningún restaurante: se responde igual que
 * uno que no existe, sin llegar a la base.
 */
export class IdRestaurantePipe implements PipeTransform<string, string> {
  transform(id: string): string {
    if (typeof id !== 'string' || !FORMA_ID_RESTAURANTE.test(id)) {
      throw new NotFoundException('Restaurante no encontrado')
    }
    return id
  }
}
